import type { Agent, LocationId, World } from '../engine/types';

/** 画布内部坐标系（固定 960×640，CSS 负责缩放，任何屏幕都不变形） */
export const SCENE_W = 960;
export const SCENE_H = 640;

export interface Zone {
  id: LocationId;
  name: string;
  x: number; y: number; w: number; h: number;
  floor: string; wall: string;
}

export const ZONES: Record<LocationId, Zone> = {
  apartment: { id: 'apartment', name: '合租公寓', x: 40, y: 40, w: 420, h: 280, floor: '#3d3226', wall: '#6b5a44' },
  store:     { id: 'store',     name: '便利店',   x: 540, y: 40, w: 380, h: 240, floor: '#26333d', wall: '#44586b' },
  office:    { id: 'office',    name: '公司',     x: 540, y: 360, w: 380, h: 240, floor: '#2c2c3a', wall: '#4a4a66' },
  street:    { id: 'street',    name: '街道',     x: 40, y: 400, w: 420, h: 200, floor: '#23301f', wall: '#3c5136' },
};

/** 地点内的小点位：按"在干什么"决定站在哪。 */
export interface Spot { x: number; y: number }

function idx(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** 各街区的"门口"锚点（走路的起点终点）。 */
const ZONE_DOORS: Record<LocationId, Spot> = {
  apartment: { x: 250, y: 330 },
  store: { x: 640, y: 330 },
  office: { x: 640, y: 350 },
  street: { x: 250, y: 370 },
};
/** 马路十字路口：跨街区对角移动会经过这里，走出 L 形而不是穿墙。 */
const JUNCTION: Spot = { x: 500, y: 350 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpSpot(a: Spot, b: Spot, t: number): Spot {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/**
 * 移动中的实时位置：屋里 → 门口 →（路口）→ 目标门口 → 目标点位，
 * 四段无缝衔接——从床边/工位一路走过去，任何时刻都不瞬移。
 */
function walkingSpot(a: Agent, from: LocationId, to: LocationId, p: number): Spot {
  const A = spotInZone(a, from);   // 出发时屋里站的位置
  const B = ZONE_DOORS[from];
  const C = ZONE_DOORS[to];
  const D = spotInZone(a, to);     // 到达后该去的点位
  const sameSide = Math.abs(B.x - C.x) < 10;
  if (p < 0.2) return lerpSpot(A, B, p / 0.2);
  if (p < 0.8) {
    const t = (p - 0.2) / 0.6;
    if (sameSide) return lerpSpot(B, C, t);
    if (t < 0.5) return lerpSpot(B, JUNCTION, t * 2);
    return lerpSpot(JUNCTION, C, (t - 0.5) * 2);
  }
  return lerpSpot(C, D, (p - 0.8) / 0.2);
}

/** 小人在场景里的目标站位（由位置+当前活动推导）。 */
export function agentSpot(a: Agent, w: World): Spot {
  // 移动中：按进度沿真实路线走
  const act = a.activity;
  if (act && act.fromLoc && act.toLoc) {
    const from = act.fromLoc;
    const to = act.toLoc;
    const span = Math.max(0.01, act.untilHour - act.startH);
    const p = Math.max(0, Math.min(1, (w.hourTotal - act.startH) / span));
    return walkingSpot(a, from, to, p);
  }
  return spotInZone(a, a.location);
}

/** 在某个街区内部该站哪（由当前活动推导）。 */
function spotInZone(a: Agent, loc: LocationId): Spot {
  const i = idx(a.id);
  const jitter = (n: number) => (i % (n * 2 + 1)) - n;
  const z = ZONES[loc];

  if (loc === 'apartment') {
    const id = a.activity?.actionId ?? '';
    if (id === 'sleep') {
      // 三间卧室，按人分床
      const beds: Spot[] = [{ x: z.x + 60, y: z.y + 60 }, { x: z.x + 60, y: z.y + 130 }, { x: z.x + 60, y: z.y + 200 }];
      return { x: beds[i % 3].x, y: beds[i % 3].y };
    }
    if (['cook', 'instant_noodles', 'scrap_fridge'].includes(id)) return { x: z.x + 330 + jitter(8), y: z.y + 70 + jitter(8) };
    if (['sofa', 'nap', 'order_takeout', 'milk_tea'].includes(id)) return { x: z.x + 200 + jitter(14), y: z.y + 190 + jitter(10) };
    if (['chat_home', 'treat'].includes(id)) return { x: z.x + 250 + jitter(16), y: z.y + 180 + jitter(14) };
    return { x: z.x + 230 + jitter(30), y: z.y + 150 + jitter(40) }; // 客厅溜达
  }

  if (loc === 'store') {
    const id = a.activity?.actionId ?? '';
    if (id === 'work_clerk') return { x: z.x + 300, y: z.y + 80 };
    if (['buy_bento', 'buy_snack'].includes(id)) return { x: z.x + 110 + jitter(10), y: z.y + 120 + jitter(8) };
    return { x: z.x + 200 + jitter(30), y: z.y + 150 + jitter(20) };
  }

  if (loc === 'office') {
    const id = a.activity?.actionId ?? '';
    if (id.startsWith('work_')) {
      const desks: Spot[] = [{ x: z.x + 90, y: z.y + 80 }, { x: z.x + 210, y: z.y + 80 }, { x: z.x + 90, y: z.y + 170 }, { x: z.x + 210, y: z.y + 170 }];
      return { x: desks[i % 4].x + jitter(6), y: desks[i % 4].y };
    }
    return { x: z.x + 310 + jitter(12), y: z.y + 150 + jitter(20) }; // 茶水间
  }

  // street
  const id = a.activity?.actionId ?? '';
  if (id === 'smoke_break') return { x: z.x + 60, y: z.y + 160 };
  if (id === 'job_hunt') return { x: z.x + 330 + jitter(8), y: z.y + 60 + jitter(6) };
  if (id === 'work_courier') {
    // 骑手沿马路来回跑（时间驱动）
    const t = (Date.now() / 1800 + i) % 2;
    const k = t < 1 ? t : 2 - t;
    return { x: z.x + 60 + k * 300, y: z.y + 105 };
  }
  if (id === 'work_coach') return { x: z.x + 340, y: z.y + 150 };
  if (id === 'wander') return { x: z.x + 120 + ((i * 53) % 200), y: z.y + 60 + ((i * 29) % 80) };
  return { x: z.x + 150 + jitter(40), y: z.y + 100 + jitter(30) };
}

/** 活动对应头顶气泡图标。 */
export function activityIcon(a: Agent): string | null {
  const id = a.activity?.actionId ?? '';
  const map: Record<string, string> = {
    sleep: '💤', nap: '😪', cook: '🍳', instant_noodles: '🍜', scrap_fridge: '🥶',
    order_takeout: '🥡', milk_tea: '🧋', buy_bento: '🍱', buy_snack: '🍿',
    sofa: '📱', chat_home: '💬', treat: '🍻', wander: '🚶', smoke_break: '🚬',
    job_hunt: '📄', go_home: '🏠',
    work_accountant: '🧮', work_programmer: '💻', work_coach: '🏋️', work_courier: '🛵', work_clerk: '🏪',
  };
  if (id.startsWith('move_')) return '🚶';
  return map[id] ?? null;
}

/** 小人专属色（按 id 稳定分配）。 */
export function agentColor(id: string): string {
  const palette = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#a3e635'];
  return palette[idx(id) % palette.length];
}

/** 天色：按游戏内小时给场景盖一层氛围。 */
export function nightOverlay(hour: number): string {
  if (hour >= 6 && hour < 8) return 'rgba(251, 191, 36, 0.06)';   // 清晨
  if (hour >= 8 && hour < 17) return 'rgba(255, 255, 255, 0.03)'; // 白天
  if (hour >= 17 && hour < 19) return 'rgba(251, 146, 60, 0.10)'; // 傍晚
  if (hour >= 19 && hour < 22) return 'rgba(30, 27, 75, 0.18)';   // 入夜
  return 'rgba(15, 23, 42, 0.32)';                                 // 深夜
}
