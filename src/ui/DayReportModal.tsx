import { useState } from 'react';
import type { DayReport } from '../engine/report';
import { weekday } from './TopBar';

interface Props {
  reports: DayReport[];
  onClose: () => void;
}

/** 城市日报：一天一页，人翻得动。 */
export function DayReportModal({ reports, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const r = reports[idx];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="城市日报"
      onClick={onClose}
    >
      <div
        className="panel safe-b flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden bg-slate-900 p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-bold text-amber-300" style={{ fontSize: 'clamp(15px, 1.4vw, 19px)' }}>📰 城市日报</h2>
          <div className="ms-auto flex items-center gap-1">
            <button data-pad onClick={() => setIdx(i => Math.min(reports.length - 1, i + 1))} disabled={idx >= reports.length - 1}
              className="touch-target focusable rounded-lg bg-slate-700/70 px-2 text-slate-200 disabled:opacity-40">‹ 前一天</button>
            <button data-pad onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx <= 0}
              className="touch-target focusable rounded-lg bg-slate-700/70 px-2 text-slate-200 disabled:opacity-40">后一天 ›</button>
            <button data-pad onClick={onClose} className="touch-target focusable rounded-lg bg-slate-700/70 px-3 text-slate-200">✕</button>
          </div>
        </div>

        {!r ? (
          <p className="text-slate-500">还没有日报，过完第一天就有了。</p>
        ) : (
          <div className="nice-scroll min-h-0 flex-1 overflow-y-auto pe-1">
            <p className="mb-3 text-slate-400" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>
              第 {r.day} 天 · {weekday(r.day)}
            </p>
            <div className="space-y-2">
              {r.perAgent.map(p => (
                <div key={p.name} className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-2.5">
                  <p className="font-semibold text-slate-100" style={{ fontSize: 'clamp(12px, 1.05vw, 14px)' }}>{p.name}</p>
                  <p className="mt-0.5 text-slate-300 break-words" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>{p.digest}</p>
                  <p className="mt-0.5 text-amber-200/80" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>{p.words.join('，')}</p>
                </div>
              ))}
            </div>
            {r.highlights.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-2.5">
                <p className="mb-1 font-semibold text-amber-300" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>今日看点</p>
                <ul className="list-disc ps-5 text-amber-100/90" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>
                  {r.highlights.map((h, i) => <li key={i} className="break-words">{h}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
