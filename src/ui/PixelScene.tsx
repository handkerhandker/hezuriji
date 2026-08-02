import { useEffect, useRef } from 'react';
import type { Agent, World } from '../engine/types';
import {
  SCENE_W, SCENE_H, ZONES, agentSpot, activityIcon, agentColor, nightOverlay,
} from './sceneMap';

interface Props {
  world: World;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface RenderPos { x: number; y: number }

/** 像素小场景：俯视四街区，小人实时站位/走位/头顶气泡。 */
export function PixelScene({ world, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Map<string, RenderPos>>(new Map());
  const worldRef = useRef(world);
  worldRef.current = world;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;

  // 点击选人
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onClick = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * SCENE_W;
      const y = ((e.clientY - r.top) / r.height) * SCENE_H;
      let best: string | null = null;
      let bestD = 28;
      for (const a of worldRef.current.agents) {
        const p = posRef.current.get(a.id);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = a.id; }
      }
      onSelect(best === selRef.current ? null : best);
    };
    cv.addEventListener('click', onClick);
    return () => cv.removeEventListener('click', onClick);
  }, [onSelect]);

  // 主绘制循环
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const w = worldRef.current;
      // 自适应：量父容器，按宽/高谁更紧张决定画布尺寸（等比，永不变形）
      const parent = cv.parentElement;
      if (!parent) { raf = requestAnimationFrame(draw); return; }
      const pw = parent.clientWidth;
      const ph = parent.clientHeight;
      if (pw > 4 && ph > 4) {
        const scale = Math.min(pw / SCENE_W, ph / SCENE_H);
        const cssW = Math.floor(SCENE_W * scale);
        const cssH = Math.floor(SCENE_H * scale);
        if (cv.style.width !== `${cssW}px`) { cv.style.width = `${cssW}px`; cv.style.height = `${cssH}px`; }
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width * dpr));
      const ch = Math.max(1, Math.round(rect.height * dpr));
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      ctx.setTransform(cw / SCENE_W, 0, 0, ch / SCENE_H, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // 底
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      drawRoads(ctx);
      for (const z of Object.values(ZONES)) drawZone(ctx, z);
      drawStreetDressing(ctx);

      // 小人（位置平滑插值 = 走路动画）
      const t = performance.now();
      for (const a of w.agents) {
        const target = agentSpot(a, w);
        const cur = posRef.current.get(a.id) ?? { ...target };
        const k = 0.06; // 每帧逼近 6%，移动事件自然变成"走过去"
        cur.x += (target.x - cur.x) * k;
        cur.y += (target.y - cur.y) * k;
        posRef.current.set(a.id, cur);
        const moving = Math.hypot(target.x - cur.x, target.y - cur.y) > 4;
        drawPerson(ctx, cur.x, cur.y, agentColor(a.id), a, t, moving, selRef.current === a.id);
      }

      // 天色
      ctx.fillStyle = nightOverlay(w.hour);
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-lg border border-slate-700/60"
      style={{ imageRendering: 'pixelated', touchAction: 'manipulation' }}
      aria-label="城市像素场景"
    />
  );
}

/* ---------- 以下是代码绘制的像素美术（无外部素材，永不裂图） ---------- */

function drawRoads(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#1f2937';
  // 横竖两条马路把四街区隔开
  ctx.fillRect(0, 330, SCENE_W, 40);
  ctx.fillRect(480, 0, 40, SCENE_H);
  // 斑马线
  ctx.fillStyle = '#475569';
  for (let x = 20; x < SCENE_W; x += 48) ctx.fillRect(x, 348, 24, 4);
  for (let y = 20; y < SCENE_H; y += 48) ctx.fillRect(498, y, 4, 24);
}

function drawZone(ctx: CanvasRenderingContext2D, z: (typeof ZONES)[keyof typeof ZONES]) {
  // 外墙 + 地板 + 地板砖纹理
  ctx.fillStyle = z.wall;
  ctx.fillRect(z.x - 4, z.y - 4, z.w + 8, z.h + 8);
  ctx.fillStyle = z.floor;
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let gx = z.x; gx < z.x + z.w; gx += 24) {
    ctx.beginPath(); ctx.moveTo(gx, z.y); ctx.lineTo(gx, z.y + z.h); ctx.stroke();
  }
  for (let gy = z.y; gy < z.y + z.h; gy += 24) {
    ctx.beginPath(); ctx.moveTo(z.x, gy); ctx.lineTo(z.x + z.w, gy); ctx.stroke();
  }
  // 门牌
  ctx.fillStyle = 'rgba(226,232,240,0.75)';
  ctx.font = 'bold 15px ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(z.name, z.x + 8, z.y + 20);

  if (z.id === 'apartment') drawApartment(ctx, z.x, z.y);
  if (z.id === 'store') drawStore(ctx, z.x, z.y);
  if (z.id === 'office') drawOffice(ctx, z.x, z.y);
}

function drawApartment(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 隔墙：左列三间卧室 | 右下客厅 | 右上厨房
  ctx.fillStyle = '#6b5a44';
  ctx.fillRect(x + 130, y + 30, 6, 230);   // 卧室区右墙
  ctx.fillRect(x + 290, y + 30, 6, 120);   // 厨房左墙
  ctx.fillRect(x + 136, y + 100, 160, 6);  // 厨房下墙
  // 三张床
  for (const by of [60, 130, 200]) {
    ctx.fillStyle = '#7c5b3d'; ctx.fillRect(x + 30, by - 18, 64, 40);       // 床架
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(x + 34, by - 14, 56, 32);       // 被子
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x + 34, by - 14, 16, 32);       // 枕头
  }
  // 厨房：灶台 + 冰箱
  ctx.fillStyle = '#525252'; ctx.fillRect(x + 310, y + 40, 100, 26);        // 灶台台
  ctx.fillStyle = '#f97316'; ctx.fillRect(x + 320, y + 44, 18, 18);         // 火光
  ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x + 360, y + 44, 40, 18);         // 冰箱
  // 客厅：沙发 + 茶几 + 电视
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x + 170, y + 170, 90, 30);        // 沙发
  ctx.fillStyle = '#a16207'; ctx.fillRect(x + 170, y + 164, 90, 10);
  ctx.fillStyle = '#57534e'; ctx.fillRect(x + 210, y + 215, 40, 22);        // 茶几
  ctx.fillStyle = '#1e293b'; ctx.fillRect(x + 160, y + 250, 70, 8);         // 电视柜
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(x + 168, y + 242, 54, 6);         // 电视屏
}

function drawStore(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 货架三排
  ctx.fillStyle = '#7c5b3d';
  for (const sy of [60, 110, 160]) ctx.fillRect(x + 40, sy, 160, 18);
  // 货品点点
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa'];
  for (const sy of [60, 110, 160]) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = colors[(i + sy) % 4];
      ctx.fillRect(x + 46 + i * 19, sy + 3, 12, 12);
    }
  }
  // 收银台
  ctx.fillStyle = '#525252'; ctx.fillRect(x + 260, y + 60, 100, 30);
  ctx.fillStyle = '#fbbf24'; ctx.fillRect(x + 270, y + 64, 24, 10);         // 收银机屏
}

function drawOffice(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 四张工位
  const desks: Array<[number, number]> = [[90, 80], [210, 80], [90, 170], [210, 170]];
  for (const [dx, dy] of desks) {
    ctx.fillStyle = '#57534e'; ctx.fillRect(x + dx - 28, y + dy - 16, 56, 32);
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(x + dx - 12, y + dy - 12, 24, 14); // 显示器
    ctx.fillStyle = '#78716c'; ctx.fillRect(x + dx - 8, y + dy + 18, 16, 10);  // 椅子
  }
  // 茶水间
  ctx.fillStyle = '#6b5a44'; ctx.fillRect(x + 280, y + 120, 70, 50);
  ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x + 290, y + 128, 20, 34);          // 饮水机
}

function drawStreetDressing(ctx: CanvasRenderingContext2D) {
  const z = ZONES.street;
  // 马路穿街而过
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(z.x, z.y + 85, z.w, 40);
  ctx.fillStyle = '#475569';
  for (let x = z.x + 10; x < z.x + z.w - 20; x += 48) ctx.fillRect(x, z.y + 103, 24, 4);
  // 树
  for (const [tx, ty] of [[90, 40], [180, 30], [70, 170]] as Array<[number, number]>) {
    ctx.fillStyle = '#57534e'; ctx.fillRect(z.x + tx, z.y + ty + 12, 6, 14);
    ctx.fillStyle = '#3f6212'; ctx.fillRect(z.x + tx - 8, z.y + ty - 4, 22, 18);
  }
  // 招聘栏
  ctx.fillStyle = '#7c5b3d'; ctx.fillRect(z.x + 316, z.y + 36, 40, 34);
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(z.x + 320, z.y + 40, 32, 22);
  // 健身房牌子
  ctx.fillStyle = '#334155'; ctx.fillRect(z.x + 310, z.y + 130, 70, 44);
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText('健身', z.x + 326, z.y + 158);
  // 长椅（抽烟点）
  ctx.fillStyle = '#7c5b3d'; ctx.fillRect(z.x + 40, z.y + 168, 46, 10);
}

function drawPerson(
  ctx: CanvasRenderingContext2D, x: number, y: number, color: string,
  a: Agent, t: number, moving: boolean, selected: boolean,
) {
  const bob = moving ? Math.round(Math.sin(t / 90) * 1.5) : Math.round(Math.sin(t / 600 + x) * 0.5);
  const yy = y + bob;
  if (selected) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 10, yy - 18, 20, 30);
  }
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x - 6, y + 11, 12, 3);
  // 腿（走动时交替）
  ctx.fillStyle = '#1e293b';
  const step = moving ? Math.sign(Math.sin(t / 90)) : 0;
  ctx.fillRect(x - 5 + step * 2, yy + 4, 4, 8);
  ctx.fillRect(x + 1 - step * 2, yy + 4, 4, 8);
  // 身体（专属色）
  ctx.fillStyle = color;
  ctx.fillRect(x - 7, yy - 8, 14, 13);
  // 头
  ctx.fillStyle = '#f2c9a0';
  ctx.fillRect(x - 5, yy - 17, 10, 9);
  // 头发
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 5, yy - 18, 10, 3);
  // 名字
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.font = '11px ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(a.name, x, yy - 24);
  ctx.textAlign = 'left';
  // 头顶气泡
  const icon = activityIcon(a);
  if (icon) {
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(x + 8, yy - 34, 20, 18);
    ctx.font = '12px sans-serif';
    ctx.fillText(icon, x + 11, yy - 21);
  }
}
