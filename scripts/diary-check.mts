/**
 * 睡前日记验证：每晚 21:50 每人一篇、时间戳正确、内容有真实素材、
 * 日报含日记、长跑无 NaN。
 * 用法：npx tsx scripts/diary-check.mts
 */
import { Sim } from '../src/engine/sim';
import { generateDayReport } from '../src/engine/report';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) { fails++; console.log('❌ FAIL:', msg); }
  else console.log(' ✅', msg);
};

const sim = new Sim(20260802);
sim.runUntilDay(4);
const w = sim.world;

// —— 每人每天一篇 ——
for (const a of w.agents) {
  ok(a.diaries.length === 3, `${a.name} 有 3 篇日记（${a.diaries.length}）`);
  ok(a.diaries.every(d => d.text.length > 10), `${a.name} 日记非空`);
}

// —— 时间戳 21:50 ——
const diaryEvents = w.events.filter(e => e.kind === 'diary');
ok(diaryEvents.length === 15, `日记事件 5 人 × 3 天 = 15（实际 ${diaryEvents.length}）`);
ok(diaryEvents.every(e => e.hour === 21 && e.min >= 50), '全部锁定在 21:50 窗口触发');
console.log('   样例:', diaryEvents[0]?.text.slice(0, 60) + '…');

// —— 语言指纹：节俭的会算账，夜猫子睡不早 ——
const lz = w.agents.find(a => a.id === 'laozhou')!;
ok(lz.diaries.some(d => d.text.includes('账')), '老周日记里有"账"（节俭指纹）');
const xk = w.agents.find(a => a.id === 'xiaok')!;
ok(xk.diaries.some(d => d.text.includes('夜') || d.text.includes('台灯')), '小K 日记里有夜猫子痕迹');

// —— 日报里带日记 ——
const r = generateDayReport(w, 3);
ok(r.perAgent.every(p => p.digest.includes('日记')), 'D3 日报每人 digest 含日记');

// —— 长跑无 NaN、日记有上限 ——
sim.runUntilDay(20);
const nan = sim.world.agents.some(a => [a.money, a.hunger, a.energy, a.mood].some(v => Number.isNaN(v)));
ok(!nan, '带日记跑 19 天无 NaN');
ok(sim.world.agents.every(a => a.diaries.length <= 14), '日记上限 14 篇生效');

console.log(fails === 0 ? '\n睡前日记全部通过 ✅' : `\n${fails} 项未过 ❌`);
process.exit(fails === 0 ? 0 : 1);
