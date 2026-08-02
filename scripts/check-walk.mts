/**
 * 走位审计（精确版）：跟踪一次完整的跨街区移动——
 * 每一步都要连续（不允许瞬移），且途中必须真的出现在马路上。
 */
import { Sim } from '../src/engine/sim';
import { agentSpot, ZONES } from '../src/ui/sceneMap';
import type { Activity } from '../src/engine/types';

const sim = new Sim(20260802);
sim.runUntilDay(2);
for (let i = 0; i < 60; i++) sim.stepTick();

let trackedAct: Activity | null = null;
let agentId: string | null = null;
let origin = '';
let dest = '';

// 找到一次移动就停（跳出时 trackedAct 一定指向那次移动的活动实例）
for (let t = 0; t < 24 * 60 && !trackedAct; t++) {
  sim.stepTick();
  const w = sim.world;
  const mover = w.agents.find(a => a.activity?.fromLoc && a.activity.toLoc);
  if (mover) {
    trackedAct = mover.activity;
    agentId = mover.id;
    origin = mover.activity!.fromLoc!;
    dest = mover.activity!.toLoc!;
    console.log(`跟踪 ${mover.name}：${origin} → ${dest}`);
  }
}

if (!trackedAct || !agentId) {
  console.log('没找到移动事件（异常情况）');
  process.exit(1);
}

const steps: Array<{ t: string; x: number; y: number }> = [];

// 持续记录直到这次移动结束
for (let t = 0; t < 60; t++) {
  const w = sim.world;
  const a = sim.agentById(agentId)!;
  if (a.activity !== trackedAct) {
    console.log(`${a.name} 到达 ${a.location}（本次移动结束）`);
    break;
  }
  const s = agentSpot(a, w);
  steps.push({ t: `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`, x: Math.round(s.x), y: Math.round(s.y) });
  sim.stepTick();
}

let jumps = 0;
for (let i = 1; i < steps.length; i++) {
  const d = Math.hypot(steps[i].x - steps[i - 1].x, steps[i].y - steps[i - 1].y);
  if (d > 230) {
    console.log(`❌ 瞬移 ${Math.round(d)}px：${steps[i - 1].t} (${steps[i - 1].x},${steps[i - 1].y}) → ${steps[i].t} (${steps[i].x},${steps[i].y})`);
    jumps++;
  }
}

// 途中必须真的上过马路（离开两个街区的范围）
const zo = ZONES[origin as keyof typeof ZONES];
const zd = ZONES[dest as keyof typeof ZONES];
const inZone = (x: number, y: number, z: typeof zo) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
const onRoad = steps.some(s => !inZone(s.x, s.y, zo) && !inZone(s.x, s.y, zd));

console.log(`\n轨迹（${steps.length} 步）：`);
console.log('  ' + steps.map(s => `${s.t}(${s.x},${s.y})`).join(' → '));
const pass = jumps === 0 && onRoad && steps.length >= 2;
console.log(pass ? '\n走位连续、经过马路，无瞬移 ✅' : '\n存在问题 ❌');
process.exit(pass ? 0 : 1);
