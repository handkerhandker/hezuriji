/**
 * headless 裸跑验证：30 个模拟日，检查退化模式。
 * 用法：npx tsx scripts/sim-check.mts [天数] [种子]
 */
import { Sim } from '../src/engine/sim';
import { generateDayReport } from '../src/engine/report';
import { gini } from '../src/engine/metrics';

const days = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 20260802);

const sim = new Sim(seed);
sim.runUntilDay(days + 1);

const w = sim.world;
console.log(`=== 裸跑 ${days} 天（种子 ${seed}） ===\n`);

// —— 最终状态 ——
console.log('【最终住户状态】');
for (const a of w.agents) {
  console.log(
    `  ${a.name} | ${a.job?.title ?? '无业'} | 钱 ${a.money} | 饿 ${Math.round(a.hunger)} 累 ${Math.round(a.energy)} 心情 ${Math.round(a.mood)} | 履历 ${a.facts.length} 条`,
  );
}

// —— 指标曲线（每 5 天一行）——
console.log('\n【指标曲线】 day | 动作熵 | 基尼 | 社交对 | LLM醒/退 | 进账/花销 | 事件数');
for (const m of sim.metricsHistory) {
  if (m.day % 5 === 0 || m.day === 1) {
    console.log(
      `  D${String(m.day).padStart(3)} | ${m.actionEntropy.toFixed(2)} | ${m.gini.toFixed(2)} | ${m.socialPairs} | ${m.llmWakes}/${m.llmFallbacks} | ${m.faucet}/${m.sink} | ${m.eventCount}`,
    );
  }
}

// —— 抽样日报（第 3 天、第 15 天、第 30 天）——
for (const d of [3, 15, days]) {
  const r = generateDayReport(w, d);
  console.log(`\n【日报 D${d}】`);
  for (const p of r.perAgent) console.log(`  ${p.name}：${p.digest}`);
  for (const h of r.highlights) console.log(`  ★ ${h}`);
}

// —— 退化模式检查（"肯定不值得追"全部可测）——
console.log('\n【退化检查】');
const entropies = sim.metricsHistory.slice(-7).map(m => m.actionEntropy);
const avgEntropy = entropies.reduce((s, v) => s + v, 0) / Math.max(1, entropies.length);
const finalGini = gini(w.agents.map(a => a.money));
const totalFallbacks = sim.metricsHistory.reduce((s, m) => s + m.llmFallbacks, 0);
const socialPairs = sim.metricsHistory[sim.metricsHistory.length - 1]?.socialPairs ?? 0;
const allBankrupt = w.agents.every(a => a.money < 0);
const allRich = w.agents.every(a => a.money > 3000);
const nanMoney = w.agents.some(a => Number.isNaN(a.money));

const checks: Array<[string, boolean]> = [
  ['动作熵未塌陷（近7天均值 > 0.35）', avgEntropy > 0.35],
  ['基尼系数未爆表（< 0.95）', finalGini < 0.95],
  ['未集体破产', !allBankrupt],
  ['未集体通胀（没人都 3000+）', !allRich],
  ['金钱无 NaN', !nanMoney],
  ['社交未孤岛化（对数 > 0）', socialPairs > 0],
];
let fail = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\nLLM 预算池退回总次数：${totalFallbacks}`);
console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项未过 ❌`);
process.exit(fail === 0 ? 0 : 1);
