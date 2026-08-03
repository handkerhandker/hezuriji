import type { Agent, LegalAction, SalienceKind, World } from './types';
import type { Rng } from './rng';
import { inShift, isSleepHour } from './actions';

/**
 * 双系统决策：
 *  - 系统1（代码，快，免费）：效用打分，处理"饿了吃面包"这类毫无悬念的事
 *  - 系统2（LLM，慢，贵）：只在有戏的时刻被显著性门控唤醒
 *
 * LLM 接口留在这里（BrainHook）：接上后小人立刻"活"一个档次；
 * 不接时规则打分兜底，游戏一分钱不花照样跑。
 */

/** 外部可注入的 AI 脑子。返回选中的 affordance id；null = 让规则兜底。 */
export type BrainHook = (
  world: World,
  agent: Agent,
  actions: Array<{ id: string; verb: string; cost?: number; hours: number }>,
  reason: SalienceKind,
) => string | null;

export interface Decision {
  action: LegalAction;
  salient: SalienceKind | null;
}

function urgency(v: number): number {
  const x = 1 - v / 100;
  return x * x;
}

/** 效用打分：收益 × 紧迫度 + 性格权重 + 一点噪声。 */
export function scoreAction(world: World, agent: Agent, la: LegalAction, rng: Rng): number {
  const af = la.affordance;
  const uH = urgency(agent.hunger);
  const uE = urgency(agent.energy);
  const uM = urgency(agent.mood);
  let s = 0;

  if (af.hunger) s += af.hunger * uH * 3;
  if (af.energy) s += af.energy * uE * 2.6;
  if (af.mood) s += af.mood * uM * 2;
  if (af.tags.includes('work')) {
    const inS = inShift(agent, world.hour);
    const diligent = agent.traits.includes('diligent');
    if (inS) s += diligent ? 34 : 28;
    else s += 2;
    // 心情差时非勤勉的人可能翘班
    if (inS && !diligent && agent.mood < 35) s -= 8;
    // 钱越紧，上班越要紧（下月房租在盯着）
    if (inS && agent.money < 450) s += 4;
    if (inS && agent.money < 0) s += 6;
  }
  // 性格加成
  if (agent.traits.includes('lavish') && af.tags.includes('luxury')) s += 5;
  if (agent.traits.includes('social') && af.tags.includes('social')) s += 6;
  if (agent.traits.includes('shy') && af.tags.includes('social')) s += 1;
  if (agent.traits.includes('thrifty') && af.cost !== undefined) s -= af.cost * 0.15;
  if (agent.traits.includes('nightOwl') && af.id === 'sleep') {
    s += world.hour >= 23 ? -4 : 3; // 夜猫子抗拒早睡
  }
  // 怪癖钩子
  if (af.id === 'smoke_break' && agent.quirks.some(q => q.includes('抽烟'))) s += world.hour >= 17 && world.hour <= 20 ? 8 : 2;
  if (af.id === 'milk_tea' && agent.quirks.some(q => q.includes('奶茶')) && world.day % 7 === 5) s += 9; // 周五必点奶茶
  if (af.id === 'treat' && agent.quirks.some(q => q.includes('请客')) && world.day % 7 === 5) s += 10; // 发工资日必请客（周五发薪）

  // 太贵时的自然回避（非硬约束的软压力）
  if (af.cost !== undefined && af.cost > 0 && agent.money < 50) s -= 6;
  // 手头紧时，奢侈类消费（请客/奶茶/外卖）明显降权：请客不能请到破产
  if (af.tags.includes('luxury') && agent.money < 150) s -= 10;
  // 短信推力：被推了一把的事，权重上浮（推得动就听，推不动拉倒）
  if (agent.nudge && world.hourTotal < agent.nudge.untilH) {
    const tag = agent.nudge.tag;
    const hit = af.tags.includes(tag) || (tag === 'rest' && af.tags.includes('sleep'));
    if (hit) s += agent.nudge.weight;
  }
  // 雨天：街上没事别待着了，家里窝着更香
  const raining = world.rainUntilH !== null && world.hourTotal < world.rainUntilH;
  if (raining) {
    if (af.place === 'street') s -= 6;
    if (af.place === 'apartment' && (af.tags.includes('rest') || af.tags.includes('social'))) s += 2;
  }
  // 无业 + 手头紧 → 求职压力直线上升
  if (af.jobSeek) s += 20 * (1 - Math.max(0, Math.min(300, agent.money)) / 300);

  s += rng.range(0, 3); // 噪声，避免机器人感
  return s;
}

/** 显著性门控：这个时刻有没有戏？ */
export function gateSalience(
  world: World,
  agent: Agent,
  ranked: LegalAction[],
  chosen: LegalAction,
): SalienceKind | null {
  const af = chosen.affordance;
  // 社交/请客天然有戏
  if (af.tags.includes('social')) return 'social';
  // 班段内选择不上班 = 有戏（翘班念头）
  if (inShift(agent, world.hour) && !af.tags.includes('work')) return 'conflict';
  // 真纠结：前两名分差小于 10%
  if (ranked.length >= 2) {
    const a = ranked[0].score ?? 0;
    const b = ranked[1].score ?? 0;
    if (a > 0 && (a - b) / a < 0.1) return 'conflict';
  }
  // 钱包警戒线 + 要花钱 = 内心戏
  if ((af.cost ?? 0) > 0 && agent.money < 60) return 'conflict';
  return null;
}

/** 规则兜底选择（系统1）。 */
export function ruleDecide(world: World, agent: Agent, actions: LegalAction[], rng: Rng): Decision {
  for (const la of actions) la.score = scoreAction(world, agent, la, rng);
  const ranked = [...actions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const chosen = ranked[0];
  return { action: chosen, salient: gateSalience(world, agent, ranked, chosen) };
}

/** 夜猫子睡眠时段判断（供 sim 使用）。 */
export { isSleepHour };
