import { useCallback, useEffect, useState } from 'react';
import { useSim, type Speed } from './hooks/useSim';
import { useLastInput, INPUT_HINTS } from './hooks/useLastInput';
import { useGamepad } from './hooks/useGamepad';
import { TopBar } from './ui/TopBar';
import { ScenePanel } from './ui/ScenePanel';
import { AgentsPanel } from './ui/AgentsPanel';
import { FeedPanel } from './ui/FeedPanel';
import { MetricsPanel } from './ui/MetricsPanel';
import { DayReportModal } from './ui/DayReportModal';
import { SmsModal } from './ui/SmsModal';

type MobileTab = 'scene' | 'agents' | 'feed' | 'data';
type Modal = 'report' | 'metrics' | 'sms' | null;

const MOBILE_TABS: Array<{ k: MobileTab; label: string; icon: string }> = [
  { k: 'scene', label: '场景', icon: '🏠' },
  { k: 'agents', label: '住户', icon: '🧑‍🤝‍🧑' },
  { k: 'feed', label: '动态', icon: '📜' },
  { k: 'data', label: '数据', icon: '📈' },
];

export default function App() {
  const { snap, setSpeed, skipToMorning, sim, sendSms } = useSim();
  const inputKind = useLastInput();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('scene');
  const [modal, setModal] = useState<Modal>(null);

  const speed = snap.speed;
  const togglePause = useCallback(() => setSpeed(speed === 0 ? 1 : 0), [speed, setSpeed]);
  const bumpSpeed = useCallback((d: 1 | -1) => {
    const order: Speed[] = [0, 1, 2];
    const i = order.indexOf(speed);
    setSpeed(order[Math.max(0, Math.min(2, i + d))]);
  }, [speed, setSpeed]);

  // 审计/演示用：?demo=sms|report|metrics 直接打开对应弹窗
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === 'sms' || q === 'report' || q === 'metrics') setModal(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(2);
      else if (e.key === 'r' || e.key === 'R') setModal(m => (m === 'report' ? null : 'report'));
      else if (e.key === 'm' || e.key === 'M') setModal(m => (m === 'metrics' ? null : 'metrics'));
      else if (e.key === 't' || e.key === 'T') setModal(m => (m === 'sms' ? null : 'sms'));
      else if (e.key === 'Escape') { setModal(null); setSelectedAgent(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, setSpeed]);

  // —— 手柄 ——
  useGamepad({
    onSpeed: bumpSpeed,
    onPause: togglePause,
    onBack: () => { setModal(null); setSelectedAgent(null); },
  });

  const w = snap.world;
  const agentName = (id: string) => w.agents.find(a => a.id === id)?.name ?? id;

  const mobileShow = (tab: MobileTab) => (mobileTab === tab ? 'flex' : 'hidden');

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200">
      <TopBar
        day={w.day} hour={w.hour} minute={w.minute} speed={speed} llmPool={snap.llmPool}
        credits={w.credits}
        hint={INPUT_HINTS[inputKind]}
        onSpeed={setSpeed}
        onOpenReports={() => setModal('report')}
        onOpenMetrics={() => setModal('metrics')}
        onOpenSms={() => setModal('sms')}
        onSkip={skipToMorning}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-2 pb-16 md:grid-cols-[minmax(260px,320px)_1fr] md:pb-2 lg:grid-cols-[minmax(280px,330px)_1fr_minmax(290px,360px)]">
        {/* 左栏：住户卡（移动端"住户"页） */}
        <div className={`${mobileShow('agents')} min-h-0 flex-col md:flex`}>
          <AgentsPanel agents={w.agents} selectedId={selectedAgent} onSelect={setSelectedAgent} />
        </div>

        {/* 中栏：像素场景（上，弹性占满）+ 动态流（下） */}
        <div className="hidden min-h-0 flex-col gap-2 md:flex">
          <div className="min-h-0 flex-1 flex-col">
            <ScenePanel world={w} selectedId={selectedAgent} onSelect={setSelectedAgent} />
          </div>
          <div className="h-[34%] min-h-[170px] shrink-0 flex-col">
            <FeedPanel feed={snap.feed} selectedAgent={selectedAgent} agentName={agentName} />
          </div>
        </div>
        {/* 移动端：场景页 / 动态页 各占全宽 */}
        <div className={`${mobileShow('scene')} min-h-0 flex-col md:hidden`}>
          <ScenePanel world={w} selectedId={selectedAgent} onSelect={setSelectedAgent} />
        </div>
        <div className={`${mobileShow('feed')} min-h-0 flex-col md:hidden`}>
          <FeedPanel feed={snap.feed} selectedAgent={selectedAgent} agentName={agentName} />
        </div>

        {/* 右栏：指标（lg 常驻；移动端"数据"页） */}
        <div className={`${mobileShow('data')} nice-scroll min-h-0 flex-col gap-2 overflow-y-auto lg:flex`}>
          <section className="panel flex min-h-0 flex-col p-3">
            <h2 className="panel-title mb-2">城市指标</h2>
            <MetricsPanel metrics={snap.metrics} />
          </section>
        </div>
      </main>

      {/* 移动端底部标签栏：44px 触控目标 + 安全区 */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-700/70 bg-slate-900/95 md:hidden" aria-label="主导航">
        {MOBILE_TABS.map(t => (
          <button
            key={t.k}
            data-pad
            onClick={() => setMobileTab(t.k)}
            className={`touch-target focusable flex flex-col items-center justify-center gap-0.5 py-1.5 ${
              mobileTab === t.k ? 'text-amber-300' : 'text-slate-400'
            }`}
            aria-current={mobileTab === t.k ? 'page' : undefined}
          >
            <span aria-hidden className="text-lg">{t.icon}</span>
            <span style={{ fontSize: 11 }}>{t.label}</span>
          </button>
        ))}
      </nav>

      {modal === 'sms' && <SmsModal world={w} onSend={sendSms} onClose={() => setModal(null)} />}
      {modal === 'report' && <DayReportModal reports={snap.reports} onClose={() => setModal(null)} />}
      {modal === 'metrics' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="城市指标"
          onClick={() => setModal(null)}>
          <div className="panel safe-b nice-scroll max-h-[88dvh] w-full max-w-2xl overflow-y-auto bg-slate-900 p-4" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center">
              <h2 className="font-bold text-amber-300" style={{ fontSize: 'clamp(15px, 1.4vw, 19px)' }}>📈 城市指标</h2>
              <button data-pad onClick={() => setModal(null)} className="touch-target focusable ms-auto rounded-lg bg-slate-700/70 px-3 text-slate-200">✕</button>
            </div>
            <MetricsPanel metrics={snap.metrics} />
            <p className="mt-3 text-slate-500" style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}>
              事件总数 {w.events.length} · 模拟种子 {sim.world.seed}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
