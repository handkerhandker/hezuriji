/**
 * 短信系统验证：额度、重置、消化（独白/回信/已读不回）、推力、睡觉排队。
 * 用法：npx tsx scripts/sms-check.mts
 */
import { Sim } from '../src/engine/sim';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) { fails++; console.log('❌ FAIL:', msg); }
  else console.log(' ✅', msg);
};

// —— 额度扣减与拒发 ——
{
  const sim = new Sim(20260802);
  ok(sim.world.credits === 3, '初始额度 3');
  ok(sim.sendMessage('alang', '吃饭了吗？') && sim.world.credits === 2, '发出扣 1');
  sim.sendMessage('alang', '早点休息');
  sim.sendMessage('feifei', '上班加油');
  ok(sim.world.credits === 0, '三条后额度归零');
  ok(sim.sendMessage('alang', '第四条') === false, '额度用尽拒发');
  ok(sim.sendMessage('nobody', '查无此人') === false, '收件人不存在拒发');
}

// —— 消化：独白进日志、回信/已读不回、推力 ——
{
  const sim = new Sim(20260802);
  // 连续 5 天每天发满 3 条，覆盖回信与已读不回两种结局
  let replies = 0;
  for (let d = 0; d < 5; d++) {
    sim.sendMessage('alang', '吃饭了吗？别饿着。');
    sim.sendMessage('feifei', '看你最近有点丧，打起精神来。');
    sim.sendMessage('xiaok', '别熬太晚，早点休息。');
    sim.runUntilDay(sim.world.day + 1);
  }
  const w = sim.world;
  const thoughts = w.events.filter(e => e.kind === 'thought');
  ok(thoughts.length >= 15, `每条短信都产生内心独白（${thoughts.length}/15）`);
  replies = w.smsLog.filter(s => s.dir === 'in').length;
  ok(replies > 0, `有人回了信（${replies} 封）`);
  const noReplyFacts = w.agents.flatMap(a => a.facts).filter(f => f.text.includes('没回'));
  console.log(`   （本种子下已读不回 ${noReplyFacts.length} 次）`);
  ok(w.smsLog.every(s => !s.text.includes('心想')), '独白不在收件箱（只有真实电波）');
  ok(w.smsLog.filter(s => s.dir === 'out').length === 15, '发出 15 条全入账');
}

// —— 跨天额度重置 ——
{
  const sim = new Sim(20260802);
  sim.sendMessage('alang', '吃饭了吗？');
  sim.sendMessage('alang', '早点休息');
  sim.sendMessage('alang', '加油');
  ok(sim.sendMessage('alang', 'x') === false, '当天第四条拒发');
  sim.runUntilDay(2);
  ok(sim.world.credits === 3, '跨天额度重置为 3');
  ok(sim.sendMessage('alang', '新的一天') === true, '重置后可再发');
}

// —— 行为推力：饿的时候收到"吃饭了吗"会去吃东西 ——
{
  const sim = new Sim(20260802);
  const a = sim.agentById('dingding')!;
  a.hunger = 20; // 很饿
  a.money = 100;
  sim.sendMessage('dingding', '吃饭了吗？别饿着。');
  sim.stepHour(); // 等消化
  ok(a.nudge !== null && a.nudge.tag === 'food', '饿时收到吃饭短信→获得吃饭推力');
}

// —— 睡觉时收到短信，醒来才消化 ——
{
  const sim = new Sim(20260802);
  const a = sim.agentById('xiaok')!;
  // 强制入睡到明早
  a.sleeping = true;
  a.activity = { actionId: 'sleep', verb: '睡觉', untilHour: sim.world.hourTotal + 6, startH: sim.world.hourTotal, tags: ['sleep'], fx: {} };
  sim.sendMessage('xiaok', '别熬太晚，早点休息。');
  sim.stepHour(); // 还在睡，不该有独白
  const early = sim.world.events.filter(e => e.kind === 'thought' && e.agentId === 'xiaok');
  ok(early.length === 0, '睡觉时不消化短信');
  for (let i = 0; i < 12; i++) sim.stepHour(); // 睡到自然醒后
  const later = sim.world.events.filter(e => e.kind === 'thought' && e.agentId === 'xiaok');
  ok(later.length > 0, '醒来后消化了短信');
}

// —— 长跑不崩（带短信的 10 天） ——
{
  const sim = new Sim(20260802);
  for (let d = 0; d < 10; d++) {
    sim.sendMessage('laozhou', '省着点花，月底还要交租。');
    sim.sendMessage('alang', '快出门，今天要迟到了！');
    sim.sendMessage('feifei', '注意身体。');
    sim.runUntilDay(sim.world.day + 1);
  }
  const nan = sim.world.agents.some(a => [a.money, a.hunger, a.energy, a.mood].some(v => Number.isNaN(v)));
  ok(!nan, '带短信跑 10 天无 NaN');
  ok(sim.world.events.length > 500, `事件量充足（${sim.world.events.length}）`);
}

console.log(fails === 0 ? '\n短信系统全部通过 ✅' : `\n${fails} 项未过 ❌`);
process.exit(fails === 0 ? 0 : 1);
