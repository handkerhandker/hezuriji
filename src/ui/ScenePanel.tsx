import type { Agent, World } from '../engine/types';
import { PixelScene } from './PixelScene';

interface Props {
  world: World;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** 场景面板：像素四街区（点小人可选中）+ 精简名册。 */
export function ScenePanel({ world, selectedId, onSelect }: Props) {
  const agents: Agent[] = world.agents;
  return (
    <section className="panel flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="panel-title">城市现场</h2>
        <p className="text-slate-500" style={{ fontSize: 'clamp(9px, 0.75vw, 11px)' }}>
          点小人可选中 · 天色随游戏时间变化
        </p>
      </div>
      {/* 画面自适应：宽不够按宽缩放，高不够按高缩放，永不变形永不被切 */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <PixelScene world={world} selectedId={selectedId} onSelect={onSelect} />
      </div>
      <div className="nice-scroll mt-2 max-h-24 shrink-0 space-y-0.5 overflow-y-auto">
        {agents.map(a => (
          <button
            key={a.id}
            data-pad
            onClick={() => onSelect(selectedId === a.id ? null : a.id)}
            className={`focusable flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-start transition-colors ${
              selectedId === a.id ? 'bg-amber-400/20 text-amber-200' : 'text-slate-300 hover:bg-slate-700/50'
            }`}
            style={{ fontSize: 'clamp(10px, 0.85vw, 12px)' }}
          >
            <span className={a.money < 0 ? 'text-red-400' : ''}>{a.sleeping ? '💤' : '●'}</span>
            <span className="font-medium">{a.name}</span>
            <span className="truncate text-slate-400">{a.activity ? `${a.activity.verb}中` : '闲着'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
