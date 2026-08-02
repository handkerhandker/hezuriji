import type { Agent } from '../engine/types';
import { stateWords } from '../engine/report';

const TRAIT_NAMES: Record<string, string> = {
  thrifty: '节俭', lavish: '大手大脚', social: '社牛', shy: '社恐', diligent: '勤勉', nightOwl: '夜猫子',
};

interface Props {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** 小人卡片：状态叙事化 + 心愿/担忧外显 + 怪癖 + 戏剧温度。 */
export function AgentsPanel({ agents, selectedId, onSelect }: Props) {
  return (
    <section className="panel flex min-h-0 flex-col p-3">
      <h2 className="panel-title mb-2">住户</h2>
      <div className="nice-scroll flex-1 space-y-2 overflow-y-auto pe-1">
        {agents.map(a => {
          const words = stateWords(a);
          const selected = selectedId === a.id;
          return (
            <button
              key={a.id}
              data-pad
              onClick={() => onSelect(selected ? null : a.id)}
              className={`focusable block w-full rounded-lg border p-2 text-start transition-colors min-w-0 ${
                selected ? 'border-amber-500/70 bg-amber-950/30' : 'border-slate-700/60 bg-slate-900/50 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold text-slate-100" style={{ fontSize: 'clamp(13px, 1.05vw, 15px)' }}>{a.name}</span>
                <span className="text-slate-400" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>{a.job?.title ?? '无业'}</span>
                <span className={`ms-auto font-mono ${a.money < 0 ? 'text-red-400' : a.money < 100 ? 'text-amber-300' : 'text-emerald-300'}`}
                  style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}>
                  {a.money < 0 ? `欠 ${-a.money}` : `${a.money}`} 元
                </span>
              </div>

              <p className="mt-1 text-amber-200/90" style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}>
                {words.join('，')}
              </p>

              <div className="mt-1 flex flex-wrap gap-1">
                {a.traits.map(t => (
                  <span key={t} className="chip border-sky-700/60 bg-sky-950/40 text-sky-300">{TRAIT_NAMES[t] ?? t}</span>
                ))}
                {a.quirks.map(q => (
                  <span key={q} className="chip text-slate-400" title="怪癖">{q}</span>
                ))}
              </div>

              <div className="mt-1.5 grid grid-cols-1 gap-0.5 text-slate-400" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>
                <p className="truncate" title={a.wish}>🌟 心愿：{a.wish}</p>
                <p className="truncate" title={a.worry}>☁️ 担忧：{a.worry}</p>
                <p className="truncate">🎭 戏剧温度 {a.drama.toFixed(1)} · 📖 履历 {a.facts.length} 条</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
