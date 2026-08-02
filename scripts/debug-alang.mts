import { Sim } from '../src/engine/sim';

const sim = new Sim(20260802);
// 记录每天结束时的钱，方便定位
const moneyLog: Array<Record<string, number>> = [];
const orig = (sim as unknown as { dayRollover: () => void }).dayRollover;
(sim as unknown as { dayRollover: () => void }).dayRollover = function (this: Sim) {
  orig.call(this);
  moneyLog.push(Object.fromEntries(this.world.agents.map(a => [a.id, a.money])));
};
sim.runUntilDay(31);
const ev = sim.world.events.filter(e => e.day === 30 && e.agentId === 'alang' && e.kind === 'act_start');
for (const e of ev) console.log('D30', e.hour + '时', e.text);
console.log('阿浪 D29 结束时的钱:', moneyLog[28]?.alang);
console.log('阿浪 D30 结束时的钱:', moneyLog[29]?.alang);
