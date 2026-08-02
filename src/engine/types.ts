// 引擎基础类型。引擎是纯 TS，不依赖 DOM/React，可以 headless 裸跑。

/** 结构化性格特质：不是形容词，是行动空间的物理约束（CK3 式）。 */
export type TraitId =
  | 'thrifty'   // 节俭：看不到贵价消费选项
  | 'lavish'    // 大手大脚：偏爱贵的，花钱回血心情
  | 'social'    // 社牛：社交收益高，独处掉心情
  | 'shy'       // 社恐：没有"主动找多人社交"选项
  | 'diligent'  // 勤勉：几乎不会翘班
  | 'nightOwl'; // 夜猫子：夜里精力衰减慢，早上起不来

export type LocationId = 'apartment' | 'store' | 'office' | 'street';

export interface JobDef {
  id: string;
  title: string;
  workplace: LocationId;
  /** 每天的班段（起始小时-结束小时，可跨午夜的拆两段写） */
  shifts: Array<[number, number]>;
  wagePerShift: number;
}

export interface AgentSeed {
  id: string;
  name: string;
  job: JobDef | null;      // null = 无业
  traits: TraitId[];
  quirks: string[];        // 怪癖清单（纯文本风味 + 少量机制钩子）
  wish: string;            // 心愿（外显）
  worry: string;           // 担忧（外显）
  money: number;
  home: LocationId;
}

/** 物件暴露的用途（Sims smart-object 式）：行动空间的基本单元。 */
export interface Affordance {
  id: string;
  verb: string;            // 玩家看到的动作名，如"做顿饭"
  place: LocationId | 'any';
  hours: number;           // 占用时长（活动层：做事中由代码推进）
  cost?: number;           // 金钱
  hunger?: number;         // 结算增量
  energy?: number;
  mood?: number;
  tags: Array<'food' | 'sleep' | 'rest' | 'work' | 'social' | 'errand' | 'luxury' | 'quirk'>;
  /** 额外资费门槛/条件 */
  minMoney?: number;
  needsCompany?: boolean;  // 需要同地点有别人
  shiftId?: string;        // 关联工作班段
  wageOnDone?: number;     // 完成时结算工资
  jobSeek?: boolean;       // 求职动作
}

/** 决策时生成的合法动作（附价格时长，供效用打分 / LLM 选择）。 */
export interface LegalAction {
  affordance: Affordance;
  score?: number;
}

export interface Activity {
  actionId: string;
  verb: string;
  untilHour: number;       // 绝对小时（浮点，world.hourTotal）
  startH: number;          // 启动时刻（浮点小时）：算移动进度用
  wageOnDone?: number;
  tags: Affordance['tags'];
  /** 移动类活动专用：从哪到哪（画面按进度画"走过去"） */
  fromLoc?: LocationId;
  toLoc?: LocationId;
  /** 启动时冻结的效果快照：结算不受"当前合法集"影响（否则睡醒会拿不到精力） */
  fx: Pick<Affordance, 'cost' | 'hunger' | 'energy' | 'mood' | 'jobSeek'>;
}

/** 结构化事实账目：硬事实绝不走模型（防幻觉社交传播）。 */
export interface FactEntry {
  day: number;
  hour: number;
  kind: 'chat' | 'treat' | 'rent' | 'wage' | 'hire' | 'miss_work' | 'meal' | 'other';
  withWho?: string;
  amount?: number;
  text: string;
}

export interface Agent {
  id: string;
  name: string;
  traits: TraitId[];
  quirks: string[];
  wish: string;
  worry: string;
  job: JobDef | null;
  home: LocationId;
  location: LocationId;
  hunger: number;   // 0-100，100=饱
  energy: number;   // 0-100
  mood: number;     // 0-100
  money: number;
  activity: Activity | null;
  facts: FactEntry[];      // 生平履历（结构化账目）
  chatPartners: Record<string, number>; // 关系账：和谁聊过几次（密度指标用）
  drama: number;    // 戏剧温度计（近期有戏事件数，导演层用）
  sleeping: boolean;
}

export type SalienceKind =
  | 'social' | 'conflict' | 'message' | 'interrupted' | 'dayEnd' | 'milestone';

/** 事件溯源：世界的一切变化都是追加日志，可精确重放。 */
export interface SimEvent {
  seq: number;
  day: number;
  hour: number;
  min: number;
  agentId?: string;
  kind:
    | 'act_start' | 'act_done' | 'state' | 'social' | 'treat' | 'wage'
    | 'rent' | 'hire' | 'miss_work' | 'day_end' | 'llm_wake' | 'llm_fallback'
    | 'milestone';
  text: string;
  salient?: boolean;
  data?: Record<string, number | string>;
}

export interface World {
  seed: number;
  day: number;          // 第几天，从 1 开始
  hour: number;         // 0-23（整数，派生自 hourTotal，逻辑判断用）
  minute: number;       // 0-59（整数，显示用）
  hourTotal: number;    // 累计小时（浮点；引擎以 10 分钟为步长推进）
  agents: Agent[];
  events: SimEvent[];
  llmPool: number;      // 每日 LLM 调用预算池
  llmWakesToday: number;
  llmFallbacksToday: number;
  seq: number;
}
