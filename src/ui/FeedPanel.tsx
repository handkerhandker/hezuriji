import { useEffect, useRef, useState } from 'react';
import type { SimEvent } from '../engine/types';

interface Props {
  feed: SimEvent[];
  selectedAgent: string | null;
  agentName: (id: string) => string;
}

type Filter = 'all' | 'salient' | 'social';

/** 动态流：像刷朋友圈一样围观小人过日子。 */
export function FeedPanel({ feed, selectedAgent, agentName }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hasNew, setHasNew] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const filtered = feed.filter(e => {
    if (selectedAgent && e.agentId && e.agentId !== selectedAgent) {
      // 城市级事件与你发的短信（无 agentId）始终显示
      return false;
    }
    if (filter === 'salient') return !!e.salient;
    if (filter === 'social') return ['social', 'treat', 'milestone', 'hire', 'msg_sent', 'msg_reply', 'thought'].includes(e.kind);
    return true;
  });

  // 跟随纪律（最新在顶部）：读者本来就在顶部附近才跟着滚；
  // 翻历史时不打扰，出"回到最新"按钮。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop < 60) {
      el.scrollTop = 0;
      setHasNew(false);
    } else {
      setHasNew(true);
    }
  }, [filtered.length, filtered[0]?.seq]);

  const backToLatest = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setHasNew(false);
  };

  const tabs: Array<{ k: Filter; label: string }> = [
    { k: 'all', label: '全部' },
    { k: 'salient', label: '有戏 🔥' },
    { k: 'social', label: '来往 💬' },
  ];

  return (
    <section className="panel flex min-h-0 flex-col p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="panel-title">动态</h2>
        <div className="ms-auto flex gap-1">
          {tabs.map(t => (
            <button
              key={t.k}
              data-pad
              onClick={() => setFilter(t.k)}
              className={`focusable rounded-full px-2.5 py-1 transition-colors ${
                filter === t.k ? 'bg-amber-400 text-slate-900' : 'bg-slate-700/70 text-slate-300 hover:bg-slate-600'
              }`}
              style={{ fontSize: 'clamp(10px, 0.85vw, 12px)', minHeight: 32 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {selectedAgent && (
        <p className="mb-1 text-amber-300" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>
          只看 {agentName(selectedAgent)} 的动态（再点一次卡片取消）
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        {hasNew && (
          <button
            data-pad
            onClick={backToLatest}
            className="focusable absolute inset-x-0 top-1 z-10 mx-auto w-fit rounded-full bg-amber-400 px-3 py-1 font-semibold text-slate-900 shadow-lg"
            style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}
          >
            ↓ 有新动态，回到最新
          </button>
        )}
        <ol ref={listRef} className="nice-scroll h-full space-y-1 overflow-y-auto pe-1" aria-live="polite">
        {filtered.length === 0 && <li className="text-slate-500">暂时没有动态。</li>}
        {filtered.map(e => (
          <li
            key={e.seq}
            className={`rounded px-2 py-1 break-words ${
              e.kind === 'milestone' || e.kind === 'hire'
                ? 'bg-amber-950/50 text-amber-200 border border-amber-700/50'
                : e.kind === 'thought'
                  ? 'bg-violet-950/40 text-violet-300/90 italic'
                  : e.kind === 'msg_sent'
                    ? 'bg-amber-900/30 text-amber-200/95'
                    : e.kind === 'msg_reply'
                      ? 'bg-emerald-950/40 text-emerald-300/95'
                      : e.kind === 'llm_wake'
                        ? 'bg-violet-950/40 text-violet-300/90'
                        : e.salient
                          ? 'bg-slate-700/50 text-slate-200'
                          : 'text-slate-400'
            }`}
            style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}
          >
            <span className="me-1.5 font-mono text-slate-500" style={{ fontSize: '0.85em' }}>
              D{e.day} {String(e.hour).padStart(2, '0')}:{String(e.min).padStart(2, '0')}
            </span>
            {e.text}
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}
