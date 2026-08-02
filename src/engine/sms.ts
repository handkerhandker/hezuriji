import type { Agent } from './types';
import type { Rng } from './rng';

/**
 * 短信消化层：玩家的话是"输入"，不是指令。
 * 小人按自己的状态/性格/在干什么来消化——
 * 回不回、怎么回、听不听，都是 TA 说了算。
 */

export type MsgKind = 'eat' | 'rest' | 'work' | 'late' | 'cheer' | 'care' | 'money' | 'other';

export interface DigestResult {
  kind: MsgKind;
  outcome: 'reply' | 'read_no_reply';
  /** 内心独白：进城市日志，不进收件箱 */
  monologue: string;
  /** 回信：真实电波，进收件箱；已读不回时为空 */
  reply: string | null;
  /** 行为推力：接下来几小时某类动作加权（输入是"推一把"，不是命令） */
  nudge: { tag: 'food' | 'rest' | 'work'; weight: number; hours: number } | null;
  moodDelta: number;
}

/** 快捷短语（界面硬名单，改动须登记交接说明） */
export const QUICK_MSGS: Array<{ id: string; label: string; text: string }> = [
  { id: 'eat', label: '吃饭了吗', text: '吃饭了吗？别饿着。' },
  { id: 'rest', label: '早点休息', text: '别熬太晚，早点休息。' },
  { id: 'work', label: '上班加油', text: '上班加油！今天也要好好的。' },
  { id: 'late', label: '别迟到了', text: '快出门，今天要迟到了！' },
  { id: 'cheer', label: '打起精神', text: '看你最近有点丧，打起精神来。' },
  { id: 'money', label: '省着点花', text: '悠着点花，月底还要交租呢。' },
];

const KIND_KEYWORDS: Array<[MsgKind, string[]]> = [
  ['eat', ['吃', '饿', '饭', '面', '外卖', '便当']],
  ['rest', ['睡', '休息', '熬', '累', '困', '早点']],
  ['late', ['迟到', '快出门', '来不及', '打卡']],
  ['work', ['上班', '工作', '加油', '干活', '求职', '简历']],
  ['money', ['钱', '省', '租', '花', '存']],
  ['cheer', ['精神', '开心', '别丧', '振作', '加油呀', '陪你']],
  ['care', ['注意', '小心', '身体', '安全', '感冒']],
];

export function classifyMsg(text: string): MsgKind {
  for (const [kind, words] of KIND_KEYWORDS) {
    if (words.some(w => text.includes(w))) return kind;
  }
  return 'other';
}

/** 口水话防重复：同一个小人同一类短信，不连续用同一条模板。 */
const lastUsed = new Map<string, number>();

function pick(pool: string[], key: string, rng: Rng): string {
  if (pool.length === 1) return pool[0];
  let i = rng.int(0, pool.length - 1);
  const last = lastUsed.get(key);
  if (i === last) i = (i + 1) % pool.length;
  lastUsed.set(key, i);
  return pool[i];
}

function fill(tpl: string, a: Agent): string {
  return tpl.replace(/\{name\}/g, a.name).replace(/\{job\}/g, a.job?.title ?? '无业游民');
}

/** 消化一条来信。aiText：未来 LLM 直接给的独白/回信（BrainHook 挂点），现在为 null。 */
export function digestMessage(a: Agent, text: string, rng: Rng, ctx: { inShift: boolean; sleeping: boolean }): DigestResult {
  const kind = classifyMsg(text);
  const key = `${a.id}:${kind}`;

  // 回信意愿：心情、性格、在干嘛共同决定；睡觉的消息醒来再处理（sim 层排队）
  let willing = a.mood > 40 ? 0.78 : 0.45;
  if (a.traits.includes('social')) willing += 0.12;
  if (a.traits.includes('shy')) willing -= 0.12;
  if (ctx.inShift) willing -= 0.15;
  const outcome: DigestResult['outcome'] = rng.chance(Math.max(0.15, Math.min(0.95, willing))) ? 'reply' : 'read_no_reply';

  // 行为推力：短信能推一把，但推不动大山
  let nudge: DigestResult['nudge'] = null;
  let moodDelta = 0;
  if (kind === 'eat' && a.hunger < 70) nudge = { tag: 'food', weight: 9, hours: 3 };
  if ((kind === 'rest' || kind === 'care') && a.energy < 70) nudge = { tag: 'rest', weight: 8, hours: 3 };
  if ((kind === 'work' || kind === 'late') && a.job) nudge = { tag: 'work', weight: 8, hours: 2 };
  if (kind === 'cheer' || kind === 'care') moodDelta = a.mood < 45 ? 5 : 3;
  if (kind === 'money' && a.money < 100) moodDelta = -2; // 戳到痛处了

  // —— 模板池（LLM 未接入时的嗓子；接入后由模型现场写） ——
  const monologues: Record<MsgKind, string[]> = {
    eat: [
      '{name}看了眼手机，又摸了摸肚子。确实有点饿了。',
      '{name}盯着"吃饭了吗"看了两秒，肚子叫了一声。',
    ],
    rest: [
      '{name}打了个哈欠。说得对，是该睡了……再刷五分钟。',
      '{name}揉了揉眼睛。困是真困，就是不想动。',
    ],
    work: [
      '{name}把手机扣在桌上。干活干活。',
      '{name}想起这个月的 KPI，叹了口气。',
    ],
    late: [
      '{name}一个激灵从椅子上弹起来。要迟到了！',
      '{name}看了眼时间，骂了一句，抓起外套就往外走。',
    ],
    cheer: [
      '{name}盯着那条消息看了很久，心里暖了一下。',
      '{name}撇了撇嘴，但嘴角还是翘了一点。',
    ],
    care: [
      '{name}回了句"知道啦"，心里其实挺受用。',
      '{name}嘟囔了一句"啰嗦"，然后把外套拉链拉上了。',
    ],
    money: [
      '{name}看了眼余额，心虚地关掉了外卖软件。',
      '{name}想到房租，后背一紧。',
    ],
    other: [
      '{name}想了想，把这件事记下了。',
      '{name}看完消息，若有所思。',
    ],
  };

  const replies: Record<MsgKind, string[]> = {
    eat: ['刚准备去吃！你吃了吗', '饿着呢，这就去弄点吃的', '还好还好，饿不着'],
    rest: ['知道啦，再忙一会儿就睡', '困死了……这就睡', '嗯，晚安'],
    work: ['在干在干', '嗯，今天状态还行', '知道啦，摸完这条鱼就干'],
    late: ['马上出门！！', '在路上了在路上了', '今天不会迟，放心'],
    cheer: ['……谢谢。', '嗯，我会的', '有这句话就够了'],
    care: ['知道啦，你也是', '嗯嗯，注意着呢', '好，听你的'],
    money: ['知道知道，省着呢', '别提了，正愁呢', '放心，饿不死'],
    other: ['嗯', '看到了', '好嘞', '知道了'],
  };

  const noReplyThoughts = [
    '{name}看了消息，没回，把手机放下了。',
    '{name}已读，想了想，还是没回。',
  ];

  const monologue = fill(pick(monologues[kind], key + ':m', rng), a);
  const reply = outcome === 'reply'
    ? fill(pick(replies[kind], key + ':r', rng), a)
    : null;
  const extra = outcome === 'read_no_reply' ? ' ' + fill(pick(noReplyThoughts, key + ':n', rng), a) : '';

  return { kind, outcome, monologue: monologue + extra, reply, nudge, moodDelta };
}
