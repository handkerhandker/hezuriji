import { useEffect, useRef, useState } from 'react';
import type { Agent, World } from '../engine/types';
import { QUICK_MSGS } from '../engine/sms';
import { stateWords } from '../engine/report';

interface Props {
  world: World;
  onSend: (agentId: string, text: string) => void;
  onClose: () => void;
}

/** 手机短信：给小人递纸条。只显示真实电波，独白去城市日志偷看。 */
export function SmsModal({ world, onSend, onClose }: Props) {
  const [target, setTarget] = useState<Agent>(world.agents[0]);
  const [custom, setCustom] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const credits = world.credits;
  const thread = world.smsLog.filter(s => s.agentId === target.id);

  // 新消息到底部
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [thread.length, target.id]);

  const trySend = (text: string) => {
    if (credits <= 0) return;
    const t = text.trim();
    if (!t) return;
    onSend(target.id, t);
    setCustom('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      role="dialog" aria-modal="true" aria-label="手机短信" onClick={onClose}>
      <div className="panel safe-b flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden bg-slate-900"
        onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-slate-700/70 p-3">
          <h2 className="font-bold text-amber-300" style={{ fontSize: 'clamp(15px, 1.4vw, 19px)' }}>💬 短信</h2>
          <span className={`chip ms-auto ${credits > 0 ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' : 'border-red-700/60 bg-red-950/40 text-red-300'}`}>
            今日剩 {credits} 条 · 0:00 重置
          </span>
          <button data-pad onClick={onClose} className="touch-target focusable rounded-lg bg-slate-700/70 px-3 text-slate-200">✕</button>
        </div>
        <p className="border-b border-slate-800 px-3 py-1.5 text-slate-500" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>
          短信是输入不是指令：TA 按自己的状态消化，回不回、听不听都看 TA。心里话去「动态」里偷看 💭
        </p>

        {/* 收件人 */}
        <div className="nice-scroll flex gap-1.5 overflow-x-auto border-b border-slate-800 p-2">
          {world.agents.map(a => (
            <button
              key={a.id}
              data-pad
              onClick={() => setTarget(a)}
              className={`focusable shrink-0 rounded-lg border px-2.5 py-1.5 text-start transition-colors ${
                target.id === a.id ? 'border-amber-500/70 bg-amber-950/40 text-amber-200' : 'border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
              }`}
              style={{ minHeight: 44 }}
            >
              <span className="block font-medium" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>{a.name}</span>
              <span className="block max-w-28 truncate text-slate-400" style={{ fontSize: 'clamp(9px, 0.75vw, 11px)' }}>
                {a.sleeping ? '💤 睡觉中' : stateWords(a)[0]}
              </span>
            </button>
          ))}
        </div>

        {/* 往来记录 */}
        <div ref={listRef} className="nice-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {thread.length === 0 && (
            <p className="py-8 text-center text-slate-500" style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}>
              还没有往来。给 {target.name} 发第一条吧。
            </p>
          )}
          {thread.map(s => (
            <div key={s.id} className={`flex ${s.dir === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 break-words ${
                s.dir === 'out'
                  ? 'rounded-br-sm bg-amber-500/90 text-slate-900'
                  : 'rounded-bl-sm bg-slate-700/80 text-slate-100'
              }`} style={{ fontSize: 'clamp(12px, 1vw, 14px)' }}>
                {s.text}
                <span className={`mt-0.5 block ${s.dir === 'out' ? 'text-slate-700' : 'text-slate-400'}`} style={{ fontSize: '0.75em' }}>
                  D{s.day} {String(s.hour).padStart(2, '0')}:{String(s.min).padStart(2, '0')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 快捷短语 */}
        <div className="nice-scroll flex gap-1.5 overflow-x-auto border-t border-slate-800 p-2">
          {QUICK_MSGS.map(q => (
            <button
              key={q.id}
              data-pad
              disabled={credits <= 0}
              onClick={() => trySend(q.text)}
              className="focusable shrink-0 rounded-full bg-slate-700/70 px-3 py-1.5 text-slate-200 transition-colors hover:bg-slate-600 disabled:opacity-40"
              style={{ fontSize: 'clamp(11px, 0.9vw, 13px)', minHeight: 36 }}
              title={q.text}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* 自定义输入 */}
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <input
            data-pad
            value={custom}
            onChange={e => setCustom(e.target.value.slice(0, 50))}
            onKeyDown={e => { if (e.key === 'Enter') trySend(custom); }}
            placeholder={credits > 0 ? `对 ${target.name} 说点什么…（50 字内）` : '今日额度用完了，明天再聊'}
            disabled={credits <= 0}
            className="focusable min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
            style={{ fontSize: 16 }} /* iOS：≥16px 防聚焦缩放 */
          />
          <button
            data-pad
            onClick={() => trySend(custom)}
            disabled={credits <= 0 || !custom.trim()}
            className="touch-target focusable shrink-0 rounded-lg bg-amber-500 px-4 font-semibold text-slate-900 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
