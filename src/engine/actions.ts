import type { Affordance, Agent, LegalAction, World } from './types';
import { JOBS } from './data';

/**
 * 行动空间生成 = 真正的产品。
 * 地点物件暴露 affordance，代码按 状态/性格/钱包/时段 滤出合法集。
 * 性格是物理约束：节俭的人根本看不到贵价选项。
 */

const BASE_AFFORDANCES: Affordance[] = [
  // —— 合租公寓 ——
  { id: 'cook', verb: '做顿饭', place: 'apartment', hours: 1, cost: 6, hunger: 42, mood: 4, tags: ['food'] },
  { id: 'instant_noodles', verb: '泡碗面', place: 'apartment', hours: 1, cost: 3, hunger: 24, tags: ['food'] },
  { id: 'scrap_fridge', verb: '翻冰箱凑合一口', place: 'apartment', hours: 1, cost: 0, hunger: 14, mood: -2, tags: ['food'] },
  { id: 'order_takeout', verb: '点外卖', place: 'any', hours: 1, cost: 25, hunger: 36, mood: 6, tags: ['food', 'luxury'], minMoney: 25 },
  { id: 'milk_tea', verb: '点杯奶茶', place: 'any', hours: 1, cost: 18, hunger: 6, mood: 10, tags: ['luxury', 'quirk'], minMoney: 18 },
  { id: 'sleep', verb: '睡觉', place: 'apartment', hours: 7, energy: 85, tags: ['sleep'] },
  { id: 'nap', verb: '打个盹', place: 'apartment', hours: 1, energy: 14, tags: ['rest'] },
  { id: 'sofa', verb: '瘫在沙发上刷手机', place: 'apartment', hours: 1, energy: 6, mood: 5, tags: ['rest'] },
  { id: 'chat_home', verb: '跟室友唠嗑', place: 'apartment', hours: 1, mood: 9, tags: ['social'], needsCompany: true },
  { id: 'treat', verb: '请室友吃一顿', place: 'apartment', hours: 1, cost: 30, hunger: 20, mood: 12, tags: ['social', 'luxury'], needsCompany: true, minMoney: 30 },
  // —— 便利店 ——
  { id: 'buy_bento', verb: '买个便当', place: 'store', hours: 1, cost: 15, hunger: 32, tags: ['food'], minMoney: 15 },
  { id: 'buy_snack', verb: '买包零食', place: 'store', hours: 1, cost: 8, hunger: 12, mood: 4, tags: ['food'], minMoney: 8 },
  // —— 公司 ——
  { id: 'vending', verb: '自动售货机买零食', place: 'office', hours: 1, cost: 5, hunger: 12, tags: ['food'], minMoney: 5 },
  // —— 街道 ——
  { id: 'wander', verb: '在街上晃', place: 'street', hours: 1, mood: 3, energy: -3, tags: ['rest'] },
  { id: 'stall_noodle', verb: '路边摊吃碗面', place: 'street', hours: 1, cost: 8, hunger: 20, tags: ['food'], minMoney: -20 }, // 摊主赊账：先吃着，发了工资再还
  { id: 'smoke_break', verb: '楼下抽根烟看手机', place: 'street', hours: 1, mood: 8, tags: ['quirk', 'rest'] },
  { id: 'job_hunt', verb: '投简历找工作', place: 'street', hours: 2, mood: -4, energy: -6, tags: ['errand'], jobSeek: true },
  // —— 通用 ——
  { id: 'go_home', verb: '回家', place: 'any', hours: 1, tags: ['errand'] },
];

/** 工作动作按岗位动态生成（班段内才合法）。 */
function workAffordance(agent: Agent): Affordance | null {
  if (!agent.job) return null;
  return {
    id: `work_${agent.job.id}`,
    verb: agent.job.id === 'courier' ? '跑单送外卖' : agent.job.id === 'coach' ? '带课' : '上班干活',
    place: agent.job.workplace,
    hours: 1, // 班段内每小时重新决定要不要继续（会被班段约束强行拉回）
    tags: ['work'],
    shiftId: agent.job.id,
    wageOnDone: 0, // 工资在日结时统一结算，按出勤小时算
  };
}

export function inShift(agent: Agent, hour: number): boolean {
  if (!agent.job) return false;
  return agent.job.shifts.some(([s, e]) => hour >= s && hour < e);
}

/** 今夜预计该睡了 */
export function isSleepHour(agent: Agent, hour: number): boolean {
  const nightOwl = agent.traits.includes('nightOwl');
  return nightOwl ? (hour >= 1 && hour < 9) : (hour >= 23 || hour < 7);
}

function cheapFoodAvailable(agent: Agent): boolean {
  return agent.money >= 6; // 至少能做顿饭/泡面
}

/** 生成合法动作集：位置、钱包、性格、时段四层过滤。 */
export function legalActions(world: World, agent: Agent): LegalAction[] {
  const hour = world.hour;
  const out: LegalAction[] = [];
  const hasCompany = world.agents.some(a => a.id !== agent.id && a.location === agent.location && !a.sleeping);

  for (const af of BASE_AFFORDANCES) {
    if (af.place !== 'any' && af.place !== agent.location) {
      // 允许跨地点：先"回家/出门"类，其它动作必须在场。简化：只允许当前地点 + 回家 + 任意地点动作
      if (af.id !== 'go_home') continue;
    }
    if (af.id === 'go_home' && agent.location === agent.home) continue;
    // 马上要开工了，别在这时候往家跑（等开工比回家正常）
    if (af.id === 'go_home' && agent.job && agent.location === agent.job.workplace) {
      const hf = world.hourTotal % 24;
      const soonShift = agent.job.shifts.some(([s, e]) => hf >= s - 1 && hf < e);
      if (soonShift) continue;
    }
    // 钱包门槛：只有花钱的动作才设卡（白嫖的翻冰箱永远能吃——饿不死是底线）
    if ((af.cost ?? 0) > 0) {
      const gate = af.minMoney ?? af.cost!;
      if (agent.money < gate) continue;
    }
    if (af.needsCompany && !hasCompany) continue;
    if (af.id === 'job_hunt') {
      if (agent.job) continue;
      if (hour < 8 || hour > 17) continue; // 白天才有招聘
    }
    if (af.id === 'sleep' && !isSleepHour(agent, hour) && agent.energy > 45) continue;

    // —— 性格硬约束（CK3 式：选项直接消失）——
    if (agent.traits.includes('thrifty')) {
      // 节俭：有便宜吃法的时侯，贵价食物选项不存在
      if ((af.id === 'order_takeout' || af.id === 'buy_bento' || af.id === 'milk_tea' || af.id === 'treat') && cheapFoodAvailable(agent)) continue;
    }
    if (agent.traits.includes('shy')) {
      // 社恐：没有"请客"这种主动出击选项
      if (af.id === 'treat') continue;
    }
    // 睡觉时段冲突的工作动作不在这里（工作单独加）
    out.push({ affordance: af });
  }

  // 工作动作（只有班段内才合法：公司下班就关门了）
  if (agent.job && inShift(agent, world.hour)) {
    const w = workAffordance(agent);
    if (w) out.push({ affordance: w });
  }
  return out;
}

/**
 * 两地之间的路程时间（小时，浮点）。
 * 按街区地理位置定：同侧近、对角远。移动是真·走过去，不是瞬移。
 */
const TRAVEL_HOURS: Record<string, number> = {
  'apartment|store': 0.35,   // 楼上到街对面
  'apartment|street': 0.25,  // 就住这栋，下楼就到
  'apartment|office': 0.55,  // 对角，要过马路穿两条街
  'store|office': 0.25,      // 同在右边一排
  'store|street': 0.55,
  'office|street': 0.35,
};

export function travelHours(from: string, to: string): number {
  if (from === to) return 0;
  const key1 = `${from}|${to}`;
  const key2 = `${to}|${from}`;
  return TRAVEL_HOURS[key1] ?? TRAVEL_HOURS[key2] ?? 0.4;
}

/** 出门动作：去另一个地点（占真·路程时间，画面按进度画走位）。 */
export function moveAction(dest: string, from: string): Affordance {
  return {
    id: `move_${dest}`,
    verb: `去${dest === 'store' ? '便利店' : dest === 'office' ? '公司' : dest === 'street' ? '街上' : '公寓'}`,
    place: 'any', hours: travelHours(from, dest), tags: ['errand'],
  };
}

export { BASE_AFFORDANCES, JOBS };
