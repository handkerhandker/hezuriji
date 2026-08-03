import type { Agent, Affordance, FactEntry, SalienceKind, SimEvent, World } from './types';
import { AGENT_SEEDS, JOBS, LLM_DAILY_BUDGET, RENT_AMOUNT, RENT_DAY_INTERVAL } from './data';
import { inShift, isSleepHour, legalActions, moveAction, travelHours } from './actions';
import { ruleDecide, type BrainHook } from './decide';
import { computeDayMetrics, type DayMetrics } from './metrics';
import { digestMessage } from './sms';
import { Rng } from './rng';

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export const SMS_DAILY_CREDITS = 3; // 每日短信额度（三叶草经济）

/** 一座城。所有变化走事件日志，同种子可精确重放。 */
export class Sim {
  world: World;
  rng: Rng;
  brain: BrainHook | null = null;
  attendance: Record<string, number> = {};
  /** 经济指标：水龙头/排水口 */
  faucetToday = 0;
  sinkToday = 0;
  /** 每日指标历史（事件溯源之外的可观测性） */
  metricsHistory: DayMetrics[] = [];
  /** 待投递的短信（睡觉时等醒来再消化） */
  private pendingInbound: Array<{ agentId: string; text: string; deliverAt: number }> = [];
  /** 待送达的回信（TA 想一会儿才回，不是秒回机器人） */
  private pendingReplies: Array<{ agentId: string; text: string; deliverAt: number }> = [];
  private smsSeq = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    const agents: Agent[] = AGENT_SEEDS.map(s => ({
      id: s.id, name: s.name, traits: [...s.traits], quirks: [...s.quirks],
      wish: s.wish, worry: s.worry, job: s.job, home: s.home, location: s.home,
      hunger: this.rng.int(55, 80), energy: this.rng.int(60, 90),
      mood: this.rng.int(45, 70), money: s.money,
      activity: null, facts: [], chatPartners: {}, drama: 0, sleeping: false, nudge: null,
    }));
    this.world = {
      seed, day: 1, hour: 7, minute: 0, hourTotal: 7, agents,
      events: [], llmPool: LLM_DAILY_BUDGET, llmWakesToday: 0, llmFallbacksToday: 0, seq: 0,
      credits: SMS_DAILY_CREDITS, smsLog: [],
    };
    this.emit('state', undefined, `第 1 天早上，五个人陆续醒来。`);
  }

  private emit(kind: SimEvent['kind'], agentId: string | undefined, text: string, salient = false, data?: SimEvent['data']) {
    const w = this.world;
    w.events.push({ seq: ++w.seq, day: w.day, hour: w.hour, min: w.minute, agentId, kind, text, salient, data });
  }

  private fact(a: Agent, kind: FactEntry['kind'], text: string, withWho?: string, amount?: number) {
    a.facts.push({ day: this.world.day, hour: this.world.hour, kind, text, withWho, amount });
  }

  /** 显著性门控 + 预算池：有戏才叫醒 LLM，池空退回规则。 */
  private maybeWake(agent: Agent, reason: SalienceKind) {
    const w = this.world;
    agent.drama += 1;
    if (w.llmPool > 0) {
      w.llmPool -= 1;
      w.llmWakesToday += 1;
      this.emit('llm_wake', agent.id, `${agent.name} 遇到有戏的时刻（${reason}），唤醒决策脑。`, true, { reason });
      // brain 已接则由它出内心独白/改选；当前为接口记账阶段
    } else {
      w.llmFallbacksToday += 1;
      this.emit('llm_fallback', agent.id, `${agent.name} 有戏但预算池已空，按规则结算。`, false, { reason });
    }
  }

  private startActivity(a: Agent, af: Affordance) {
    const w = this.world;
    // 移动类：路程按真实距离，记录从哪到哪（画面按进度画"走过去"）
    let fromLoc: Agent['location'] | undefined;
    let toLoc: Agent['location'] | undefined;
    let hours = af.hours;
    if (af.id.startsWith('move_')) {
      fromLoc = a.location;
      toLoc = af.id.slice(5) as Agent['location'];
    } else if (af.id === 'go_home') {
      fromLoc = a.location;
      toLoc = a.home;
      hours = travelHours(a.location, a.home);
    }
    a.activity = {
      actionId: af.id, verb: af.verb, untilHour: w.hourTotal + hours, startH: w.hourTotal,
      wageOnDone: af.wageOnDone, tags: af.tags, fromLoc, toLoc,
      fx: { cost: af.cost, hunger: af.hunger, energy: af.energy, mood: af.mood, jobSeek: af.jobSeek },
    };
    a.sleeping = af.id === 'sleep';
    const cost = af.cost ? `（-${af.cost} 元）` : '';
    this.emit('act_start', a.id, `${a.name} ${af.verb}${cost}`, false, { action: af.id });
  }

  private completeActivity(a: Agent) {
    const w = this.world;
    const act = a.activity;
    if (!act) return;
    a.activity = null;
    a.sleeping = false;

    // 移动类：走完路程才到（fromLoc/toLoc 在启动时已冻结）
    if (act.actionId.startsWith('move_')) {
      a.location = (act.toLoc ?? act.actionId.slice(5)) as Agent['location'];
      return;
    }
    if (act.actionId === 'go_home') {
      a.location = act.toLoc ?? a.home;
      return;
    }

    const fx = act.fx;
    if (fx.cost) { a.money -= fx.cost; this.sinkToday += fx.cost; }
    if (fx.hunger) a.hunger = clamp(a.hunger + fx.hunger);
    if (fx.energy) a.energy = clamp(a.energy + fx.energy);
    if (fx.mood) a.mood = clamp(a.mood + fx.mood);
    if (fx.hunger) this.fact(a, 'meal', `${act.verb}${fx.cost ? ` -${fx.cost}元` : ''}`);
    if (act.tags.includes('work') && a.job) {
      // 出勤按实际干活的那一小时计（活动占据 [until-1, until) 这个小时）
      const workedHour = ((act.untilHour - 1) % 24 + 24) % 24;
      if (inShift(a, workedHour)) {
        this.attendance[a.id] = (this.attendance[a.id] ?? 0) + 1;
      }
    }
    // 社交结算：拉上同地点的人
    if (act.tags.includes('social')) {
      const partner = w.agents.find(x => x.id !== a.id && x.location === a.location && !x.sleeping);
      if (partner) {
        const treat = act.actionId === 'treat';
        if (treat && fx.cost) {
          partner.hunger = clamp(partner.hunger + 20);
          this.fact(a, 'treat', `请了 ${partner.name} 一顿（-${fx.cost}元）`, partner.name, fx.cost);
          this.fact(partner, 'treat', `${a.name} 请了我一顿`, a.name, fx.cost);
        } else {
          this.fact(a, 'chat', `和 ${partner.name} 唠了会儿`, partner.name);
          this.fact(partner, 'chat', `和 ${a.name} 唠了会儿`, a.name);
        }
        a.mood = clamp(a.mood + 4);
        partner.mood = clamp(partner.mood + 4);
        a.chatPartners[partner.id] = (a.chatPartners[partner.id] ?? 0) + 1;
        partner.chatPartners[a.id] = (partner.chatPartners[a.id] ?? 0) + 1;
        this.emit('social', a.id, `${a.name} 和 ${partner.name} ${treat ? '一起吃了顿（他请客）' : '唠了会儿嗑'}`, true);
        partner.drama += 0.5;
      }
    }
    // 求职结算
    if (fx.jobSeek && !a.job) {
      if (this.rng.chance(0.12)) {
        a.job = JOBS.clerk;
        a.mood = clamp(a.mood + 18);
        this.fact(a, 'hire', `被便利店录用了！`);
        this.emit('milestone', a.id, `🎉 ${a.name} 找到工作了：便利店店员！`, true);
        this.maybeWake(a, 'milestone');
      }
    }
    this.emit('act_done', a.id, `${a.name} ${act.verb} 完了`);
  }

  /** 移动决策：该去上班/回家/找吃的时候先移动（算好提前量，真走过去）。 */
  private decideMove(a: Agent): Affordance | null {
    const w = this.world;
    const hour = w.hourTotal % 24; // 浮点小时，算提前量更准
    // 上班：按"路程+一点余量"动身，到单位正好开工
    if (a.job) {
      const needs = travelHours(a.location, a.job.workplace);
      const inS = inShift(a, hour);
      const shiftSoon = a.job.shifts.some(([s, e]) => (hour >= s - needs - 0.1 && hour < e));
      const wantsSkip = !a.traits.includes('diligent') && a.mood < 30 && this.rng.chance(0.25);
      if ((inS || shiftSoon) && a.location !== a.job.workplace && !wantsSkip) {
        return moveAction(a.job.workplace, a.location);
      }
    }
    // 深夜该回家睡觉
    if (isSleepHour(a, hour) && a.location !== a.home && a.energy < 70) {
      return moveAction(a.home, a.location);
    }
    // 下班了别赖在单位：傍晚回家，白天偶尔去街上转转
    if (a.job && a.location === a.job.workplace && !inShift(a, hour)) {
      const needsHome = travelHours(a.location, a.home);
      const shiftSoon = a.job.shifts.some(([s]) => hour >= s - needsHome - 0.1 && hour < s);
      if (!shiftSoon) {
        if (hour >= 18 || isSleepHour(a, hour)) return moveAction(a.home, a.location);
        if (this.rng.chance(0.5)) return moveAction(this.rng.chance(0.5) ? a.home : 'street', a.location);
      }
    }
    // 无业 + 手头紧：白天出门投简历
    if (!a.job && hour >= 9 && hour <= 15 && a.money < 200 && a.location !== 'street' && this.rng.chance(0.6)) {
      return moveAction('street', a.location);
    }
    // 饿急了而本地没吃的
    const localFood = legalActions(w, a).some(l => l.affordance.tags.includes('food'));
    if (a.hunger < 28 && !localFood) {
      const dest = a.money >= 15 && !a.traits.includes('thrifty') ? 'store' : a.home;
      if (a.location !== dest) return moveAction(dest, a.location);
    }
    return null;
  }

  private stepAgent(a: Agent) {
    const w = this.world;
    // 结算完立刻再次决策（否则每个活动会白吞一小时，出勤永远少一半）
    for (let i = 0; i < 4; i++) {
      if (a.activity) {
        if (w.hourTotal >= a.activity.untilHour) { this.completeActivity(a); continue; }
        return;
      }
      // 需要移动？
      const mv = this.decideMove(a);
      if (mv) { this.startActivity(a, mv); return; }

      // 生成行动空间 → 规则打分 → 显著性门控
      const actions = legalActions(w, a);
      if (actions.length === 0) return;
      const d = ruleDecide(w, a, actions, this.rng);
      let woke = false;
      if (d.salient) {
        const before = w.llmWakesToday;
        this.maybeWake(a, d.salient);
        woke = w.llmWakesToday > before;
      }
      // 有戏且预算到位时，外部 AI 脑子可改选（未接入则规则兜底）
      const chosen = this.brain && d.salient && woke
        ? actions.find(x => x.affordance.id === this.brain!(w, a, actions.map(x => ({
            id: x.affordance.id, verb: x.affordance.verb, cost: x.affordance.cost, hours: x.affordance.hours,
          })), d.salient!)) ?? d.action
        : d.action;
      this.startActivity(a, chosen.affordance);
      return;
    }
  }

  private driftNeeds(a: Agent, dt: number) {
    const w = this.world;
    const night = w.hour >= 22 || w.hour < 7;
    a.hunger = clamp(a.hunger - (a.sleeping ? 1.2 : 3.1) * dt);
    if (!a.sleeping) {
      const decay = a.traits.includes('nightOwl') && night ? 1.1 : 2.1;
      a.energy = clamp(a.energy - decay * dt);
    }
    // 心情向 50 回归；社牛独处掉心情；欠债压着心情
    a.mood = clamp(a.mood + (50 - a.mood) * 0.04 * dt);
    if (a.traits.includes('social')) {
      const alone = !w.agents.some(x => x.id !== a.id && x.location === a.location && !x.sleeping);
      if (alone && !a.sleeping) a.mood = clamp(a.mood - 0.6 * dt);
    }
    if (a.money < 0) a.mood = clamp(a.mood - 0.4 * dt);
    // 挨饿和熬穿了会实实在在地砸心情
    if (a.hunger < 15) a.mood = clamp(a.mood - 1.2 * dt);
    if (a.energy < 10) a.mood = clamp(a.mood - 0.8 * dt);
  }

  private dayRollover() {
    const w = this.world;
    // 日结工资：按出勤小时比例
    for (const a of w.agents) {
      if (!a.job) continue;
      const shiftHours = a.job.shifts.reduce((s, [x, y]) => s + (y - x), 0);
      const attended = this.attendance[a.id] ?? 0;
      if (attended >= shiftHours * 0.5) {
        const wage = Math.round(a.job.wagePerShift * Math.min(1, attended / shiftHours));
        a.money += wage;
        this.faucetToday += wage;
        this.fact(a, 'wage', `工资到账 +${wage} 元`, undefined, wage);
        this.emit('wage', a.id, `${a.name} 工资到账 +${wage} 元（出勤 ${attended}/${shiftHours} 小时）`, false, { wage });
      } else if (shiftHours > 0) {
        this.fact(a, 'miss_work', `今天基本没去上班`);
        this.emit('miss_work', a.id, `${a.name} 今天翘了班，没工资。`, true);
        a.drama += 1;
      }
    }
    this.attendance = {};

    // 日终反思时刻（每个小人一次 LLM 位的日总结，记账）
    for (const a of w.agents) this.maybeWake(a, 'dayEnd');
    this.emit('day_end', undefined, `—— 第 ${w.day} 天结束 ——`);

    // 指标落盘（在重置计数器之前）
    this.metricsHistory.push(computeDayMetrics(this, w.day));

    // 进入新的一天
    w.day += 1;
    w.hour = 0;
    w.minute = 0;
    w.credits = SMS_DAILY_CREDITS; // 短信额度 0:00 重置
    w.llmPool = LLM_DAILY_BUDGET;
    w.llmWakesToday = 0;
    w.llmFallbacksToday = 0;
    this.faucetToday = 0;
    this.sinkToday = 0;
    for (const a of w.agents) a.drama *= 0.5;

    // 交租日：每月 1 号，全城众生相
    if (w.day % RENT_DAY_INTERVAL === 1) {
      this.emit('milestone', undefined, `📅 今天是交租日（${RENT_AMOUNT} 元/人）。`, true);
      for (const a of w.agents) {
        a.money -= RENT_AMOUNT;
        this.sinkToday += RENT_AMOUNT;
        this.fact(a, 'rent', `交租 -${RENT_AMOUNT} 元`, undefined, RENT_AMOUNT);
        const state = a.money < 0 ? '交完租直接欠债了' : a.money < 100 ? '交完租钱包见底' : '顺利交了租';
        this.emit('rent', a.id, `${a.name} ${state}（余 ${a.money} 元）`, a.money < 100, { left: a.money });
        if (a.money < 100) a.drama += 1;
      }
    }
  }

  /** 玩家给小人发短信。返回 false = 额度用尽/收件人不存在。 */
  sendMessage(agentId: string, text: string): boolean {
    const w = this.world;
    const a = this.agentById(agentId);
    if (!a || w.credits <= 0) return false;
    const clean = text.trim().slice(0, 50);
    if (!clean) return false;
    w.credits -= 1;
    w.smsLog.push({ id: ++this.smsSeq, day: w.day, hour: w.hour, min: w.minute, agentId, dir: 'out', text: clean });
    this.emit('msg_sent', undefined, `你 给 ${a.name} 发了条短信：「${clean}」`, true);
    // 睡觉的等醒来再消化；醒着的过 10-40 分钟看到
    const deliverAt = a.sleeping && a.activity
      ? a.activity.untilHour
      : w.hourTotal + this.rng.range(1 / 6, 2 / 3);
    this.pendingInbound.push({ agentId, text: clean, deliverAt });
    return true;
  }

  /** 短信消化：读到 → 独白进日志 + 可能回信 + 可能推一把行为。 */
  private processInbound() {
    const w = this.world;
    const due = this.pendingInbound.filter(p => p.deliverAt <= w.hourTotal);
    this.pendingInbound = this.pendingInbound.filter(p => p.deliverAt > w.hourTotal);
    for (const p of due) {
      const a = this.agentById(p.agentId);
      if (!a) continue;
      // 收到消息 = 有戏的时刻（显著性门控记账，LLM 挂点）
      this.maybeWake(a, 'message');
      const r = digestMessage(a, p.text, this.rng, {
        inShift: a.job ? inShift(a, w.hour) : false,
        sleeping: a.sleeping,
      });
      this.emit('thought', a.id, `💭 ${a.name}：${r.monologue}`, true);
      if (r.moodDelta) a.mood = clamp(a.mood + r.moodDelta);
      if (r.nudge) a.nudge = { tag: r.nudge.tag, weight: r.nudge.weight, untilH: w.hourTotal + r.nudge.hours };
      this.fact(a, 'msg', `收到你的短信：「${p.text}」`);
      if (r.reply) {
        // 回信也要想一会儿，10-40 分钟后送达
        this.pendingReplies.push({ agentId: a.id, text: r.reply, deliverAt: w.hourTotal + this.rng.range(1 / 6, 2 / 3) });
      } else {
        this.fact(a, 'msg', `看了你的短信，没回`);
      }
    }
    // 回信送达
    const dueR = this.pendingReplies.filter(p => p.deliverAt <= w.hourTotal);
    this.pendingReplies = this.pendingReplies.filter(p => p.deliverAt > w.hourTotal);
    for (const p of dueR) {
      const a = this.agentById(p.agentId);
      if (!a) continue;
      w.smsLog.push({ id: ++this.smsSeq, day: w.day, hour: w.hour, min: w.minute, agentId: a.id, dir: 'in', text: p.text });
      this.emit('msg_reply', a.id, `${a.name} 回你：「${p.text}」`, true);
    }
  }

  /** 推进一个时间步（10 分钟）：时钟是"流"，不是"跳"。 */
  stepTick(dt = 1 / 6) {
    const w = this.world;
    // 先让所有人行动/结算
    for (const a of w.agents) this.stepAgent(a);
    // 短信投递
    this.processInbound();
    // 生理漂移（按步长比例）
    for (const a of w.agents) this.driftNeeds(a, dt);
    // 时间前进
    const prevDay = Math.floor(w.hourTotal / 24);
    w.hourTotal += dt;
    w.hour = Math.floor(w.hourTotal % 24);
    w.minute = Math.floor((w.hourTotal % 24) * 60) % 60;
    if (Math.floor(w.hourTotal / 24) > prevDay) this.dayRollover();
  }

  /** 兼容旧接口：推进 1 个游戏小时。 */
  stepHour() {
    for (let i = 0; i < 6; i++) this.stepTick();
  }

  /** 推进到指定天数（headless 裸跑用）。 */
  runUntilDay(targetDay: number) {
    while (this.world.day < targetDay) this.stepHour();
  }

  agentById(id: string): Agent | undefined {
    return this.world.agents.find(a => a.id === id);
  }
}
