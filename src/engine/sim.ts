import type { Agent, Affordance, FactEntry, SalienceKind, SimEvent, World } from './types';
import { AGENT_SEEDS, JOBS, LLM_DAILY_BUDGET, RENT_AMOUNT, RENT_DAY_INTERVAL } from './data';
import { inShift, isSleepHour, legalActions, moveAction, travelHours } from './actions';
import { ruleDecide, type BrainHook } from './decide';
import { computeDayMetrics, type DayMetrics } from './metrics';
import { digestMessage } from './sms';
import { runChatScene as chatScene } from './chat';
import { writeDiary } from './diary';
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
  /** 导演层：上次有戏的时刻（太平静就悄悄投扰动） */
  private lastDramaH = 7;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    const agents: Agent[] = AGENT_SEEDS.map(s => ({
      id: s.id, name: s.name, traits: [...s.traits], quirks: [...s.quirks],
      wish: s.wish, worry: s.worry, job: s.job, home: s.home, location: s.home,
      hunger: this.rng.int(55, 80), energy: this.rng.int(60, 90),
      mood: this.rng.int(45, 70), money: s.money,
      activity: null, facts: [], memories: [], diaries: [], chatPartners: {}, drama: 0, sleeping: false, nudge: null, slackToday: false,
    }));
    this.world = {
      seed, day: 1, hour: 7, minute: 0, hourTotal: 7, agents,
      events: [], llmPool: LLM_DAILY_BUDGET, llmWakesToday: 0, llmFallbacksToday: 0, seq: 0,
      credits: SMS_DAILY_CREDITS, smsLog: [], rainUntilH: null,
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
    // 导演层记账：日终反思是例行公事，不算"有戏"
    if (reason !== 'dayEnd') this.lastDramaH = w.hourTotal;
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
    // 社交结算：拉上同地点的人开一场闲聊（有预算的场景+不对称记忆）
    if (act.tags.includes('social')) {
      const partner = this.pickChatPartner(a);
      if (partner) {
        const treat = act.actionId === 'treat';
        if (treat && fx.cost) {
          partner.hunger = clamp(partner.hunger + 20);
          this.fact(a, 'treat', `请了 ${partner.name} 一顿（-${fx.cost}元）`, partner.name, fx.cost);
          this.fact(partner, 'treat', `${a.name} 请了我一顿`, a.name, fx.cost);
          a.mood = clamp(a.mood + 4);
          partner.mood = clamp(partner.mood + 4);
          a.chatPartners[partner.id] = (a.chatPartners[partner.id] ?? 0) + 1;
          partner.chatPartners[a.id] = (partner.chatPartners[a.id] ?? 0) + 1;
          this.emit('social', a.id, `${a.name} 和 ${partner.name} 一起吃了顿（他请客）`, true);
          partner.drama += 0.5;
        } else {
          this.runChatScene(a, partner);
        }
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

  /** 移动决策：饿急眼 > 上班 > 睡觉 > 闲逛（饥饿紧急度压过通勤，防两头拉扯）。 */
  private decideMove(a: Agent): Affordance | null {
    const w = this.world;
    const hour = w.hourTotal % 24; // 浮点小时，算提前量更准

    // 饿急眼了：本地吃不起/没得吃，先回家吃饭，班先放一放
    const localFood = legalActions(w, a).some(l => l.affordance.tags.includes('food'));
    if (a.hunger < 25 && !localFood && a.location !== a.home) {
      const dest = a.money >= 15 && !a.traits.includes('thrifty') ? 'store' : a.home;
      if (a.location !== dest) return moveAction(dest, a.location);
    }

    // 上班：按"路程+一点余量"动身，到单位正好开工
    if (a.job) {
      const needs = travelHours(a.location, a.job.workplace);
      const inS = inShift(a, hour);
      const shiftSoon = a.job.shifts.some(([s, e]) => (hour >= s - needs - 0.1 && hour < e));
      // 摆烂判定：真崩了(mood<22)才可能翘班，且每天最多摆一次（保险丝）
      const wantsSkip = !a.traits.includes('diligent') && a.mood < 22 && !a.slackToday && this.rng.chance(0.25);
      if (wantsSkip) a.slackToday = true;
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
    // 不太急但也该吃了：本地没吃的就挪窝
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
      // 教练带课、店员站柜台都是在跟人打交道，不算独处
      const withPeople = a.activity && (a.activity.actionId === 'work_coach' || a.activity.actionId === 'work_clerk');
      if (alone && !withPeople && !a.sleeping) a.mood = clamp(a.mood - 0.6 * dt);
    }
    if (a.money < 0) a.mood = clamp(a.mood - 0.25 * dt); // 欠债压心情，但不往死里压
    // 挨饿和熬穿了会实实在在地砸心情
    if (a.hunger < 15) a.mood = clamp(a.mood - 1.2 * dt);
    if (a.energy < 10) a.mood = clamp(a.mood - 0.8 * dt);
    // 下雨天还在街上晃，心情打点折扣
    if (w.rainUntilH !== null && a.location === 'street' && !a.sleeping) a.mood = clamp(a.mood - 0.3 * dt);
  }

  private dayRollover() {
    const w = this.world;
    // 日结工资：按出勤小时比例
    for (const a of w.agents) {
      if (!a.job) continue;
      const shiftHours = a.job.shifts.reduce((s, [x, y]) => s + (y - x), 0);
      const attended = this.attendance[a.id] ?? 0;
      if (attended >= shiftHours * 0.3) {
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

    this.emit('day_end', undefined, `—— 第 ${w.day} 天结束 ——`);

    // 指标落盘（在重置计数器之前）
    this.metricsHistory.push(computeDayMetrics(this, w.day));

    // 进入新的一天
    w.day += 1;
    w.hour = 0;
    w.minute = 0;
    w.credits = SMS_DAILY_CREDITS; // 短信额度 0:00 重置
    for (const a of w.agents) a.slackToday = false; // 保险丝复位
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

  /** 找闲聊对象：同地点、醒着、且这对组合不在冷却里（90 分钟）。 */
  private pairCooldown = new Map<string, number>();

  private pickChatPartner(a: Agent): Agent | null {
    const w = this.world;
    const candidates = w.agents.filter(x => {
      if (x.id === a.id || x.location !== a.location || x.sleeping) return false;
      const key = [a.id, x.id].sort().join('|');
      return (this.pairCooldown.get(key) ?? 0) <= w.hourTotal;
    });
    if (candidates.length === 0) return null;
    return this.rng.pick(candidates);
  }

  /** 开一场闲聊：台词上动态流，记忆各记各的，借钱真转账。 */
  private runChatScene(a: Agent, b: Agent) {
    const w = this.world;
    const out = chatScene(w, a, b, this.rng);
    // 显著性门控：一场对话一次唤醒记账（LLM 挂点，模板先行）
    if (out.salient) this.maybeWake(a, 'social');
    // 台词上动态流（有预算的场景：限轮数）
    for (const line of out.lines) {
      const speaker = this.agentById(line.who);
      this.emit('social', line.who, `${speaker?.name ?? line.who}：「${line.text}」`, out.salient);
    }
    // 不对称记忆：各自记自己听到的版本
    for (const [aid, text] of Object.entries(out.memories)) {
      const who = this.agentById(aid);
      if (!who) continue;
      who.memories.push({ day: w.day, text });
      if (who.memories.length > 30) who.memories.shift();
      const other = aid === a.id ? b : a;
      this.fact(who, 'chat', `和 ${other.name} 聊了几句`, other.name);
    }
    // 心情与关系
    a.mood = clamp(a.mood + out.moodA);
    b.mood = clamp(b.mood + out.moodB);
    a.chatPartners[b.id] = (a.chatPartners[b.id] ?? 0) + 1;
    b.chatPartners[a.id] = (b.chatPartners[a.id] ?? 0) + 1;
    b.drama += 0.5;
    // 借钱成交：真转账+两边客观账目（硬事实不走记忆）
    if (out.loan) {
      const lender = this.agentById(out.loan.from);
      const borrower = this.agentById(out.loan.to);
      if (lender && borrower) {
        lender.money -= out.loan.amount;
        borrower.money += out.loan.amount;
        this.fact(lender, 'loan', `借给 ${borrower.name} ${out.loan.amount} 元`, borrower.name, out.loan.amount);
        this.fact(borrower, 'loan', `找 ${lender.name} 借了 ${out.loan.amount} 元`, lender.name, out.loan.amount);
        this.emit('milestone', a.id, `💸 ${borrower.name} 找 ${lender.name} 借了 ${out.loan.amount} 元。`, true);
      }
    }
    // 这对组合进入冷却
    const key = [a.id, b.id].sort().join('|');
    this.pairCooldown.set(key, w.hourTotal + 1.5);
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

  /** 导演层：不写剧情，只调节奏。200 分钟没戏 → 每小时 30% 概率下场雨。 */
  private directorTick() {
    const w = this.world;
    // 先判断雨停（正在下雨就直接返回）
    if (w.rainUntilH !== null) {
      if (w.hourTotal >= w.rainUntilH) {
        w.rainUntilH = null;
        this.emit('weather', undefined, `🌤️ 雨停了。`);
      }
      return;
    }
    const quietHours = w.hourTotal - this.lastDramaH;
    // 触发率按本城节奏校准为每小时 12%（citylife 30% 太密，30 天会下 24 场；登记口径见交接说明）
    if (quietHours >= 200 / 60 && this.rng.chance(0.12 / 6)) { // 摊到 10 分钟步
      const dur = this.rng.range(90, 140) / 60;
      w.rainUntilH = w.hourTotal + dur;
      this.lastDramaH = w.hourTotal;
      this.emit('weather', undefined, `🌧️ 城里下起了雨（预计 ${Math.round(dur * 60)} 分钟）。雨天适合窝在家里。`, true);
    }
  }

  /** 睡前日记：每晚 21:50，每人一篇（触发时锁时间戳；LLM 挂点=每人一次唤醒记账）。 */
  private lastDiaryDay = 0;

  private diaryTick() {
    const w = this.world;
    // 窗口制触发：21:50–21:59 之间到点即写（浮点漂移多少分钟都不怕），每日一次
    const todMin = Math.floor((w.hourTotal % 24) * 60 + 0.5) % 1440;
    if (todMin < 1310 || todMin >= 1320) return;
    if (this.lastDiaryDay === w.day) return;
    this.lastDiaryDay = w.day;
    for (const a of w.agents) {
      this.maybeWake(a, 'dayEnd');
      const text = writeDiary(a, w, this.rng);
      a.diaries.push({ day: w.day, text });
      if (a.diaries.length > 14) a.diaries.shift();
      this.emit('diary', a.id, `📔 ${a.name} 的睡前日记：${text}`, true);
    }
  }

  /** 推进一个时间步（10 分钟）：时钟是"流"，不是"跳"。 */
  stepTick(dt = 1 / 6) {
    const w = this.world;
    // 先让所有人行动/结算
    for (const a of w.agents) this.stepAgent(a);
    // 短信投递
    this.processInbound();
    // 睡前日记（21:50）
    this.diaryTick();
    // 导演层盯节奏
    this.directorTick();
    // 生理漂移（按步长比例）
    for (const a of w.agents) this.driftNeeds(a, dt);
    // 时间前进
    const prevDay = Math.floor(w.hourTotal / 24);
    w.hourTotal += dt;
    const todMin = Math.floor((w.hourTotal % 24) * 60 + 0.5) % 1440;
    w.hour = Math.floor(todMin / 60);
    w.minute = todMin % 60;
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
