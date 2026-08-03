import type { Agent, World } from './types';
import type { Rng } from './rng';

/**
 * 同屋闲聊·不对称记忆（对标 citylife 三挂点之二）。
 * 一场闲聊=一个有预算的小场景：2-3 回合、有话题、散场后
 * **各自把自己听到的版本记进自己的记忆**——误会、传话、
 * 借钱的小心思，全是"记忆按目击范围过滤"的副产品。
 */

export interface ChatLine {
  who: string; // agentId
  text: string;
}

export interface ChatOutcome {
  lines: ChatLine[];
  /** 各自的主观版本：agentId → 记忆文本 */
  memories: Record<string, string>;
  moodA: number;
  moodB: number;
  /** 借钱成交时的金额（同时写两边结构化账目） */
  loan?: { from: string; to: string; amount: number };
  salient: boolean;
}

type Topic = 'gossip' | 'vent' | 'smalltalk' | 'loan';

function pickTopic(a: Agent, b: Agent, rng: Rng): Topic {
  // 有人缺钱、对方有余粮 → 可能开口借钱（尴尬而真实）
  if (a.money < 100 && b.money > 200 && rng.chance(0.5)) return 'loan';
  const r = rng.next();
  if (r < 0.3) return 'gossip';
  if (r < 0.55) return 'vent';
  return 'smalltalk';
}

const lastTpl = new Map<string, number>();
function pick(pool: string[], key: string, rng: Rng): string {
  if (pool.length === 1) return pool[0];
  let i = rng.int(0, pool.length - 1);
  if (i === lastTpl.get(key)) i = (i + 1) % pool.length;
  lastTpl.set(key, i);
  return pool[i];
}

function fill(t: string, a: Agent, b: Agent, third?: Agent | null, extra?: Record<string, string>): string {
  return t
    .replace(/\{a\}/g, a.name).replace(/\{b\}/g, b.name)
    .replace(/\{third\}/g, third?.name ?? '那谁')
    .replace(/\{amount\}/g, extra?.amount ?? '50')
    .replace(/\{thing\}/g, extra?.thing ?? '那点事');
}

/** 从第三人的近期履历里捞八卦素材（记忆按目击范围过滤的产物）。 */
function gossipMaterial(third: Agent | undefined, rng: Rng): string {
  if (!third) return pick(['最近神神秘秘的', '好像瘦了', '最近老点外卖'], 'g:none', rng);
  const juicy = third.facts.slice(-20).find(f => ['miss_work', 'treat', 'hire', 'rent'].includes(f.kind));
  if (!juicy) return pick(['最近神神秘秘的', '好像瘦了', '最近老点外卖'], 'g:none', rng);
  const map: Record<string, string[]> = {
    miss_work: ['前几天翘班了', '听说前几天没去上班'],
    treat: ['最近老请人吃饭', '出手特别大方'],
    hire: ['找到新工作了', '听说被录用了'],
    rent: ['交租那天脸都绿了', '在为房租发愁'],
  };
  return pick(map[juicy.kind] ?? ['有点不对劲'], `g:${juicy.kind}`, rng);
}

/** 生成一场闲聊。 */
export function runChatScene(world: World, a: Agent, b: Agent, rng: Rng): ChatOutcome {
  const topic = pickTopic(a, b, rng);
  const third = world.agents.find(x => x.id !== a.id && x.id !== b.id && x.location !== a.location)
    ?? world.agents.find(x => x.id !== a.id && x.id !== b.id);

  if (topic === 'gossip') {
    const thing = gossipMaterial(third ?? undefined, rng);
    const opener = pick(['哎，{third}最近{thing}，你发现没', '跟你说个事，{third}{thing}'], 'g:open', rng);
    const response = pick(['真的假的？我都没注意', '是吗，我说呢', '嘘——小声点'], 'g:resp', rng);
    const closer = pick(['行吧，各过各的', '哎，都挺不容易的'], 'g:close', rng);
    const distorted = rng.chance(0.15);
    return {
      lines: [
        { who: a.id, text: fill(opener, a, b, third, { thing }) },
        { who: b.id, text: fill(response, a, b, third, { thing }) },
        { who: a.id, text: fill(closer, a, b, third, { thing }) },
      ],
      memories: {
        [a.id]: `跟 ${b.name} 八卦了 ${third?.name ?? '别人'}：${thing}`,
        [b.id]: distorted
          ? `${a.name} 跟我嚼 ${third?.name ?? '别人'} 的舌根，我嘴上附和，心里觉得${a.name}有点酸`
          : `${a.name} 跟我说，${third?.name ?? '别人'} ${thing}`,
      },
      moodA: 4, moodB: 3, salient: true,
    };
  }

  if (topic === 'vent') {
    const burden = a.money < 0 ? '欠着债，心里堵' : a.job ? '上班太累' : '还没找到工作，心里没底';
    const opener = pick(['最近真的有点撑不住，{burden}', '哎……{burden}'], 'v:open', rng);
    const comfort = pick([
      '会好起来的，先把今天过好',
      '谁不是呢，熬一熬就过去了',
      '走，请你吃点东西，别想那么多',
    ], 'v:comfort', rng);
    const thanks = pick(['嗯，谢谢你听我说', '说出来好多了'], 'v:thanks', rng);
    const distorted = rng.chance(0.1);
    return {
      lines: [
        { who: a.id, text: fill(opener, a, b, null, { burden }) },
        { who: b.id, text: pick([fill(comfort, a, b), fill(comfort, a, b)], 'v:c2', rng) },
        { who: a.id, text: fill(thanks, a, b) },
      ],
      memories: {
        [a.id]: `跟 ${b.name} 倒了苦水（${burden}），TA 安慰了我`,
        [b.id]: distorted
          ? `${a.name} 跟我抱怨了一堆，我安慰了两句，其实有点不知道怎么接`
          : `${a.name} 最近${burden}，我劝了劝 TA`,
      },
      moodA: 6, moodB: 2, salient: true,
    };
  }

  if (topic === 'loan') {
    const amount = b.money > 400 ? 100 : 50;
    const agreed = (b.money > 400 || b.mood > 60) && rng.chance(0.65);
    if (agreed) {
      return {
        lines: [
          { who: a.id, text: fill(pick(['那个……能借我 {amount} 吗，发工资就还', '最近手太紧了，能先借 {amount} 应应急不'], 'l:ask', rng), a, b, null, { amount: String(amount) }) },
          { who: b.id, text: pick(['行，先拿去用', '转你了，不急着还'], 'l:yes', rng) },
          { who: a.id, text: pick(['谢谢！发了工资第一个还你', '够意思，记下了'], 'l:thx', rng) },
        ],
        memories: {
          [a.id]: `找 ${b.name} 借了 ${amount}，欠 TA 一个人情`,
          [b.id]: `${a.name} 找我拿了 ${amount}，说是发工资就还……先记着吧`,
        },
        moodA: 8, moodB: -2,
        loan: { from: b.id, to: a.id, amount },
        salient: true,
      };
    }
    return {
      lines: [
        { who: a.id, text: fill(pick(['能借我 {amount} 吗，过两天就还', '手紧，借 {amount} 周转一下行不'], 'l:ask2', rng), a, b, null, { amount: String(amount) }) },
        { who: b.id, text: pick(['哎我最近也紧，真对不住', '这次真不行，下次吧'], 'l:no', rng) },
        { who: a.id, text: pick(['哦……没事没事', '……行吧'], 'l:ok', rng) },
      ],
      memories: {
        [a.id]: `找 ${b.name} 借钱被婉拒了，有点没面子`,
        [b.id]: `${a.name} 找我借钱，我没借。TA 会不会觉得我小气……`,
      },
      moodA: -4, moodB: -2, salient: true,
    };
  }

  // smalltalk
  const topics: Array<[string, string]> = [
    ['今天吃啥了', '随便对付了一口，你呢'],
    ['最近天是不是要变', '嗯，出门带伞吧'],
    ['这附近新开了家店，改天试试', '行啊，你请客我就去'],
    ['昨晚睡得好吗', '一般，又刷手机到半夜'],
  ];
  const t = topics[rng.int(0, topics.length - 1)];
  return {
    lines: [
      { who: a.id, text: t[0] },
      { who: b.id, text: t[1] },
    ],
    memories: {
      [a.id]: `跟 ${b.name} 闲聊了几句（${t[0]}）`,
      [b.id]: `跟 ${a.name} 闲聊了几句`,
    },
    moodA: 3, moodB: 3, salient: false,
  };
}
