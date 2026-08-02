import type { Speed } from '../hooks/useSim';
import { LLM_DAILY_BUDGET } from '../engine/data';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export function weekday(day: number): string {
  return WEEKDAYS[(day - 1) % 7];
}

interface Props {
  day: number;
  hour: number;
  minute: number;
  speed: Speed;
  llmPool: number;
  credits: number;
  hint: string;
  onSpeed: (s: Speed) => void;
  onOpenReports: () => void;
  onOpenMetrics: () => void;
  onOpenSms: () => void;
  onSkip: () => void;
}

export function TopBar(p: Props) {
  const speedBtns: Array<{ s: Speed; label: string; title: string }> = [
    { s: 0, label: '⏸', title: '暂停（空格）' },
    { s: 1, label: '▶', title: '常速（按 1）' },
    { s: 2, label: '⏩', title: '四倍速（按 2）' },
  ];
  return (
    <header className="safe-t safe-l safe-r flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700/70 bg-slate-900/90 px-3 py-2">
      <div className="min-w-0">
        <h1 className="truncate font-bold text-amber-300" style={{ fontSize: 'clamp(15px, 1.4vw, 20px)' }}>
          合租日记
        </h1>
        <p className="text-slate-500" style={{ fontSize: 'clamp(9px, 0.8vw, 11px)' }}>AI 小人生活模拟 · 裸跑版 v0.1</p>
      </div>

      {/* 时钟 */}
      <div className="chip !px-3 !py-1 text-amber-200 border-amber-700/60 bg-amber-950/40">
        <span className="font-mono font-bold" style={{ fontSize: 'clamp(13px, 1.2vw, 17px)' }}>
          D{p.day} {weekday(p.day)} {String(p.hour).padStart(2, '0')}:{String(p.minute).padStart(2, '0')}
        </span>
      </div>

      {/* 速度控制 */}
      <div className="flex items-center gap-1" role="group" aria-label="速度控制">
        {speedBtns.map(b => (
          <button
            key={b.s}
            data-pad
            title={b.title}
            onClick={() => p.onSpeed(b.s)}
            className={`touch-target focusable rounded-lg px-2 text-lg transition-colors ${
              p.speed === b.s ? 'bg-amber-400 text-slate-900' : 'bg-slate-700/70 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          data-pad
          title="快进到明早 7 点"
          onClick={p.onSkip}
          className="touch-target focusable rounded-lg bg-slate-700/70 px-2 text-slate-300 hover:bg-slate-600"
          style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}
        >
          到明早⏭
        </button>
      </div>

      {/* LLM 预算池 */}
      <div className="chip border-violet-700/60 bg-violet-950/40 text-violet-300" title="每日 LLM 唤醒预算池：有戏的时刻才消耗">
        🧠 {p.llmPool}/{LLM_DAILY_BUDGET}
      </div>

      <div className="ms-auto flex items-center gap-1">
        <button data-pad onClick={p.onOpenSms} className="touch-target focusable relative rounded-lg bg-slate-700/70 px-3 text-slate-200 hover:bg-slate-600" style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}>
          💬 短信
          <span className={`ms-1 inline-block rounded-full px-1.5 font-mono ${p.credits > 0 ? 'bg-emerald-600/80 text-emerald-50' : 'bg-red-700/80 text-red-100'}`}>
            {p.credits}
          </span>
        </button>
        <button data-pad onClick={p.onOpenReports} className="touch-target focusable rounded-lg bg-slate-700/70 px-3 text-slate-200 hover:bg-slate-600" style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}>
          📰 日报
        </button>
        <button data-pad onClick={p.onOpenMetrics} className="touch-target focusable rounded-lg bg-slate-700/70 px-3 text-slate-200 hover:bg-slate-600" style={{ fontSize: 'clamp(11px, 0.9vw, 13px)' }}>
          📈 指标
        </button>
      </div>

      {/* 输入提示：窄屏隐藏，不挤布局 */}
      <div className="hidden w-full text-slate-500 lg:block" style={{ fontSize: 'clamp(9px, 0.75vw, 11px)' }}>
        {p.hint}
      </div>
    </header>
  );
}
