import type { Sim } from './sim';

/**
 * 指标：平衡不靠感觉靠曲线。
 *  - 动作熵：防集体摆烂/趋同（香农多样性）
 *  - 金钱基尼系数：防通胀和集体破产
 *  - 关系密度：防孤岛
 *  - 戏剧温度：导演层节奏参考
 */
export interface DayMetrics {
  day: number;
  actionEntropy: number;      // 0~1（归一化香农熵）
  gini: number;               // 0~1
  socialPairs: number;        // 存在过来往的人际关系对数
  llmWakes: number;           // 今日唤醒决策脑次数
  llmFallbacks: number;       // 预算池空退回规则次数
  faucet: number;             // 今日进账（工资）
  sink: number;               // 今日花销（吃饭+房租）
  eventCount: number;
  moneys: Record<string, number>;
  dramas: Record<string, number>;
}

export function gini(values: number[]): number {
  if (values.length === 0) return 0;
  // 允许欠债（负值）：整体平移到非负再算（标准 offset 做法）
  const min = Math.min(...values);
  const vs = min < 0 ? values.map(v => v - min) : values;
  const sorted = [...vs].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return Math.max(0, Math.min(1, (2 * cum) / (n * n * mean) - (n + 1) / n));
}

export function normalizedEntropy(counts: number[]): number {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total === 0 || counts.length <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(counts.length);
}

export function computeDayMetrics(sim: Sim, day: number): DayMetrics {
  const w = sim.world;
  const dayEvents = w.events.filter(e => e.day === day);
  const starts = dayEvents.filter(e => e.kind === 'act_start' && e.data?.action);
  const kinds = new Map<string, number>();
  for (const e of starts) {
    const k = String(e.data!.action);
    if (k.startsWith('move_') || k === 'go_home') continue; // 移动是交通，不是生活内容
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  let pairs = 0;
  const seen = new Set<string>();
  for (const a of w.agents) {
    for (const pid of Object.keys(a.chatPartners)) {
      const key = [a.id, pid].sort().join('|');
      if (!seen.has(key) && a.chatPartners[pid] > 0) { seen.add(key); pairs++; }
    }
  }
  return {
    day,
    actionEntropy: normalizedEntropy([...kinds.values()]),
    gini: gini(w.agents.map(a => a.money)),
    socialPairs: pairs,
    llmWakes: w.llmWakesToday,
    llmFallbacks: w.llmFallbacksToday,
    faucet: sim.faucetToday,
    sink: sim.sinkToday,
    eventCount: dayEvents.length,
    moneys: Object.fromEntries(w.agents.map(a => [a.name, a.money])),
    dramas: Object.fromEntries(w.agents.map(a => [a.name, Math.round(a.drama * 10) / 10])),
  };
}
