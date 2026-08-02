import type { DayMetrics } from '../engine/metrics';

interface Props {
  metrics: DayMetrics[];
}

/** 迷你火花线（纯 SVG，不引图表库，任何屏幕都可缩放） */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * 100},${32 - ((v - min) / span) * 28 - 2}`,
  ).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 指标面板：平衡不靠感觉靠曲线。 */
export function MetricsPanel({ metrics }: Props) {
  const latest = metrics[metrics.length - 1];
  const entropySeries = metrics.map(m => m.actionEntropy);
  const giniSeries = metrics.map(m => m.gini);

  const cards: Array<{ label: string; value: string; note: string; series?: number[]; color?: string }> = [
    {
      label: '动作熵', value: latest ? latest.actionEntropy.toFixed(2) : '—',
      note: '防集体摆烂/趋同', series: entropySeries, color: '#34d399',
    },
    {
      label: '金钱基尼', value: latest ? latest.gini.toFixed(2) : '—',
      note: '防通胀/集体破产', series: giniSeries, color: '#fbbf24',
    },
    {
      label: '社交对数', value: latest ? String(latest.socialPairs) : '—',
      note: '防孤岛',
    },
    {
      label: 'LLM 唤醒/退回', value: latest ? `${latest.llmWakes}/${latest.llmFallbacks}` : '—',
      note: '显著性门控在工作',
    },
    {
      label: '进账 / 花销', value: latest ? `${latest.faucet} / ${latest.sink}` : '—',
      note: '水龙头 vs 排水口',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {cards.map(c => (
        <div key={c.label} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-2 min-w-0">
          <p className="text-slate-500 truncate" style={{ fontSize: 'clamp(9px, 0.75vw, 11px)' }}>{c.label}</p>
          <p className="font-mono font-bold text-slate-100 truncate" style={{ fontSize: 'clamp(14px, 1.3vw, 18px)' }}>{c.value}</p>
          {c.series && c.color && <Spark values={c.series} color={c.color} />}
          <p className="text-slate-500 truncate" style={{ fontSize: 'clamp(9px, 0.7vw, 10px)' }}>{c.note}</p>
        </div>
      ))}
      {latest && (
        <div className="col-span-full rounded-lg border border-slate-700/60 bg-slate-900/50 p-2">
          <p className="text-slate-500" style={{ fontSize: 'clamp(9px, 0.75vw, 11px)' }}>各人戏剧温度（D{latest.day}）</p>
          <div className="mt-1 space-y-1">
            {Object.entries(latest.dramas).map(([name, d]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-slate-400" style={{ fontSize: 'clamp(10px, 0.8vw, 12px)' }}>{name}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-700/70 overflow-hidden">
                  <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, d * 10)}%` }} />
                </div>
                <span className="w-8 text-end font-mono text-slate-400" style={{ fontSize: 'clamp(10px, 0.8vw, 12px)' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
