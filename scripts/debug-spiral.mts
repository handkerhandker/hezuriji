/** 量化翘班/钱包基线（保险丝单前后对比用）。 */
import { Sim } from '../src/engine/sim';

function measure(days: number, label: string) {
  const sim = new Sim(20260802);
  sim.runUntilDay(days + 1);
  const w = sim.world;
  console.log(`\n【${label}】D1–D${days}`);
  for (const a of w.agents) {
    const misses = a.facts.filter(f => f.kind === 'miss_work').length;
    const wages = a.facts.filter(f => f.kind === 'wage').reduce((s, f) => s + (f.amount ?? 0), 0);
    console.log(`  ${a.name} | 钱包 ${a.money} | 翘班 ${misses} 天 | 工资总进账 ${wages}`);
  }
  const totalMiss = w.events.filter(e => e.kind === 'miss_work').length;
  const totalWage = w.events.filter(e => e.kind === 'wage').reduce((s, e) => s + Number(e.data?.wage ?? 0), 0);
  console.log(`  合计：翘班 ${totalMiss} 天 · 工资发放 ${totalWage}`);
}

measure(30, '30天');
measure(90, '90天');
