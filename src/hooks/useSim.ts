import { useCallback, useEffect, useRef, useState } from 'react';
import { Sim } from '../engine/sim';
import { generateDayReport, type DayReport } from '../engine/report';
import type { DayMetrics } from '../engine/metrics';
import type { SimEvent, World } from '../engine/types';

export type Speed = 0 | 1 | 2; // 暂停 / 1x / 4x

export interface SimSnapshot {
  world: World;
  feed: SimEvent[];          // 最近 N 条事件（新在前）
  reports: DayReport[];      // 日报（新在前）
  metrics: DayMetrics[];
  speed: Speed;
  llmPool: number;
}

const FEED_LIMIT = 300;
// 一个时间步=10 分钟；1x 每步 150ms（现实 1 秒 ≈ 游戏 40 分钟），4x 每步 45ms
const SPEED_MS: Record<Speed, number> = { 0: 0, 1: 150, 2: 45 };

export function useSim(seed = 20260802) {
  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) simRef.current = new Sim(seed);
  const sim = simRef.current;

  const [snap, setSnap] = useState<SimSnapshot>(() => buildSnap(sim, 1));
  const speedRef = useRef<Speed>(1);

  const push = useCallback((speed: Speed) => {
    setSnap(buildSnap(sim, speed));
  }, [sim]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    push(s);
  }, [push]);

  const stepOnce = useCallback(() => {
    sim.stepTick();
    push(speedRef.current);
  }, [sim, push]);

  // 主循环：按速度定时推进 1 个时间步（10 分钟）
  useEffect(() => {
    if (snap.speed === 0) return;
    const ms = SPEED_MS[snap.speed];
    const t = window.setInterval(() => {
      sim.stepTick();
      push(speedRef.current);
    }, ms);
    return () => window.clearInterval(t);
  }, [snap.speed, sim, push]);

  // 快进到下一天早上 7 点
  const skipToMorning = useCallback(() => {
    const w = sim.world;
    let guard = 0;
    while (!(w.hour === 7 && w.minute < 10) && guard++ < 500) sim.stepTick();
    push(speedRef.current);
  }, [sim, push]);

  // 发短信（引擎消化层：回不回、听不听看 TA）
  const sendSms = useCallback((agentId: string, text: string): boolean => {
    const ok = sim.sendMessage(agentId, text);
    push(speedRef.current);
    return ok;
  }, [sim, push]);

  return { snap, setSpeed, stepOnce, skipToMorning, sim, sendSms };
}

function buildSnap(sim: Sim, speed: Speed): SimSnapshot {
  const w = sim.world;
  const feed = w.events.slice(-FEED_LIMIT).reverse();
  const reports: DayReport[] = [];
  for (let d = w.day - 1; d >= Math.max(1, w.day - 7); d--) {
    reports.push(generateDayReport(w, d));
  }
  return {
    world: w,
    feed,
    reports,
    metrics: [...sim.metricsHistory],
    speed,
    llmPool: w.llmPool,
  };
}
