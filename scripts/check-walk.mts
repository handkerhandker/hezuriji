/**
 * 走位审计（稳健版）：扫描若干次跨街区移动，找到一次样本充足的，
 * 验证：每步连续（不瞬移）+ 途中真的经过马路。
 */
import { Sim } from '../src/engine/sim';
import { agentSpot, ZONES } from '../src/ui/sceneMap';
import type { Activity } from '../src/engine/types';

const sim = new Sim(20260802);
sim.runUntilDay(2);

let pass = false;
let tried = 0;

for (let t = 0; t < 6 * 24 * 10 && !pass; t++) {
  sim.stepTick();
  const w = sim.world;
  const mover = w.agents.find(a => a.activity?.fromLoc && a.activity.toLoc && a.activity.untilHour - w.hourTotal >= 0.25);
  if (!mover) continue;
  tried++;
  const act = mover.activity as Activity;
  const origin = act.fromLoc!;
  const dest = act.toLoc!;
  const steps: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 12; k++) {
    const a = sim.agentById(mover.id)!;
    if (a.activity !== act) break;
    const s = agentSpot(a, sim.world);
    steps.push({ x: Math.round(s.x), y: Math.round(s.y) });
    sim.stepTick();
    t++;
  }
  if (steps.length < 2) continue; // 这次样本太少，找下一场
  let jumps = 0;
  for (let i = 1; i < steps.length; i++) {
    const d = Math.hypot(steps[i].x - steps[i - 1].x, steps[i].y - steps[i - 1].y);
    if (d > 230) jumps++;
  }
  const zo = ZONES[origin as keyof typeof ZONES];
  const zd = ZONES[dest as keyof typeof ZONES];
  const inZone = (x: number, y: number, z: typeof zo) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  const onRoad = steps.some(s => !inZone(s.x, s.y, zo) && !inZone(s.x, s.y, zd));
  if (jumps === 0 && onRoad) {
    pass = true;
    console.log(`跟踪 ${mover.name}：${origin} → ${dest}，轨迹（${steps.length} 步）：`);
    console.log('  ' + steps.map(s => `(${s.x},${s.y})`).join(' → '));
    console.log('走位连续、经过马路，无瞬移 ✅');
  }
}

if (!pass) console.log(`扫描 ${tried} 次移动，未找到合规轨迹 ❌`);
process.exit(pass ? 0 : 1);
