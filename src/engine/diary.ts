import type { Agent, World } from './types';
import type { Rng } from './rng';

/**
 * 睡前日记（对标 citylife 三挂点之三）。
 * 每晚 21:50，每个小人用第一人称写一段今天。
 * 素材 = 自己今天的客观账目 + 主观记忆；语气 = 性格（语言指纹）。
 * 模板先行；接 AI 后由 BrainHook 现场写，接口不变。
 */

function opener(a: Agent, rng: Rng): string {
  const shy = a.traits.includes('shy');
  if (a.mood >= 75) return rng.pick(['今天真不错。', '今天过得挺顺的。', '今天是个好日子。']);
  if (a.mood >= 45) return shy
    ? rng.pick(['今天……还行吧。', '也没什么特别的。'])
    : rng.pick(['今天也就那样。', '普普通通的一天。']);
  return shy
    ? rng.pick(['今天……算了，不想说。', '唉。'])
    : rng.pick(['今天真够呛。', '累。不想动。']);
}

function moneyLine(a: Agent, rng: Rng): string | null {
  if (a.traits.includes('thrifty')) {
    return rng.pick([
      `算了下账，现在手头 ${a.money} 元。每一分钱都得有去处。`,
      `记完今天的账：${a.money} 元。嗯，比昨天多就是好。`,
    ]);
  }
  if (a.money < 0) {
    return rng.pick([
      `欠着 ${-a.money} 元。说不愁是假的，明天得更拼一点。`,
      `看了眼余额，-${-a.money}……不想了，睡觉。`,
    ]);
  }
  if (a.traits.includes('lavish') && a.money < 200) {
    return '钱又花得差不多了……算了，开心最重要。';
  }
  return null;
}

function factLine(a: Agent, w: World, rng: Rng): string | null {
  const today = a.facts.filter(f => f.day === w.day && f.kind !== 'meal');
  if (today.length === 0) return null;
  const f = today[today.length - 1];
  switch (f.kind) {
    case 'hire': return rng.pick(['今天被录用了！！！新的开始，我一定好好干。', '找到工作了！感觉一切要变好了。']);
    case 'wage': return rng.pick([`今天工资到了 ${f.amount} 元，踏实。`, `发工资了，+${f.amount}。辛苦没白费。`]);
    case 'miss_work': return rng.pick(['今天翘班了。说不上为什么，就是不想动。', '今天没去。明天一定去……吧。']);
    case 'treat': return f.text.startsWith('请')
      ? rng.pick([`今天请 ${f.withWho} 吃了顿饭，看 TA 吃得开心我也开心。`, `请 ${f.withWho} 吃了顿好的，钱花得值。`])
      : rng.pick([`今天 ${f.withWho} 请我吃了顿饭，谢谢 TA。`, `蹭了 ${f.withWho} 一顿，人情记下了。`]);
    case 'loan': return f.text.startsWith('借给')
      ? rng.pick([`${f.withWho} 找我借了 ${f.amount} 元。希望 TA 能缓过来吧。`, `借给 ${f.withWho} ${f.amount}。什么时候还呢……`])
      : rng.pick([`找 ${f.withWho} 借了 ${f.amount} 元，发了工资第一个还。`, `今天跟 ${f.withWho} 开口借了钱，有点不好意思。`]);
    case 'rent': return rng.pick(['今天交租了。钱包肉眼可见地瘪下去。', '又一个月房租。在这里也算有个窝了。']);
    case 'chat': return rng.pick([`今天和 ${f.withWho} 聊了会儿，挺好的。`, `跟 ${f.withWho} 说了说话，没那么闷了。`]);
    case 'msg': return f.text.includes('没回')
      ? '今天 TA 给我发消息了。没回。不是不想理，是不知道说什么。'
      : '今天收到 TA 的消息了，被人惦记着的感觉，挺好的。';
    default: return null;
  }
}

function memoryLine(a: Agent, w: World, rng: Rng): string | null {
  const today = a.memories.filter(m => m.day === w.day);
  if (today.length === 0) return null;
  const m = today[today.length - 1];
  const shy = a.traits.includes('shy');
  return shy
    ? `有件事记一下：${m.text}。`
    : rng.pick([`对了，${m.text}。`, `还有，${m.text}。`]);
}

function closer(a: Agent, rng: Rng): string {
  const nightOwl = a.traits.includes('nightOwl');
  const tails = nightOwl
    ? ['……不过我的夜才刚开始。', '（台灯还亮着）']
    : ['睡吧，明天见。', '好了，熄灯。'];
  if (a.wish && rng.chance(0.4)) return `${a.wish}——还得继续。${rng.pick(tails)}`;
  return rng.pick(tails);
}

/** 给小人写今天的睡前日记。 */
export function writeDiary(a: Agent, w: World, rng: Rng): string {
  const parts: Array<string | null> = [
    opener(a, rng),
    factLine(a, w, rng),
    memoryLine(a, w, rng),
    moneyLine(a, rng),
    closer(a, rng),
  ];
  return parts.filter(Boolean).join(' ');
}
