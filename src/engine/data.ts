import type { AgentSeed, JobDef } from './types';

export const JOBS: Record<string, JobDef> = {
  accountant: {
    id: 'accountant', title: '会计', workplace: 'office',
    shifts: [[9, 17]], wagePerShift: 120,
  },
  programmer: {
    id: 'programmer', title: '初级程序员', workplace: 'office',
    shifts: [[10, 19]], wagePerShift: 150,
  },
  coach: {
    id: 'coach', title: '健身教练', workplace: 'street',
    shifts: [[14, 21]], wagePerShift: 100,
  },
  courier: {
    id: 'courier', title: '外卖骑手', workplace: 'street',
    shifts: [[10, 14], [17, 21]], wagePerShift: 110,
  },
  clerk: {
    id: 'clerk', title: '便利店店员', workplace: 'store',
    shifts: [[8, 16]], wagePerShift: 80,
  },
};

export const LOCATION_NAMES: Record<string, string> = {
  apartment: '合租公寓',
  store: '便利店',
  office: '公司',
  street: '街道',
};

/** 首批住户：五毒俱全塞进一间三居室。 */
export const AGENT_SEEDS: AgentSeed[] = [
  {
    id: 'laozhou', name: '老周',
    job: JOBS.accountant,
    traits: ['thrifty', 'diligent'],
    quirks: ['记账记到小数点后两位', '牙膏从尾巴开始挤'],
    wish: '想攒够 5000 块存款',
    worry: '怕记账本弄丢',
    money: 500, home: 'apartment',
  },
  {
    id: 'alang', name: '阿浪',
    job: JOBS.courier,
    traits: ['lavish'],
    quirks: ['傍晚必在楼下抽烟看手机', '发工资当天必请客'],
    wish: '想换一辆新电动车',
    worry: '月底钱包见底',
    money: 120, home: 'apartment',
  },
  {
    id: 'feifei', name: '菲菲',
    job: JOBS.coach,
    traits: ['social'],
    quirks: ['逢人必打招呼', '冰箱里全是鸡胸肉'],
    wish: '想在楼里组一个晨跑团',
    worry: '怕大家觉得她烦',
    money: 300, home: 'apartment',
  },
  {
    id: 'xiaok', name: '小K',
    job: JOBS.programmer,
    traits: ['shy', 'nightOwl'],
    quirks: ['周五必点奶茶', '耳机从不离头'],
    wish: '想在 D200 前攒够钱换显卡',
    worry: '怕被叫去团建',
    money: 800, home: 'apartment',
  },
  {
    id: 'dingding', name: '丁丁',
    job: null, // 应届求职中：求职动作可能拿到便利店 offer
    traits: ['shy'],
    quirks: ['随身带速写本', '紧张时画小人'],
    wish: '想找到第一份工作',
    worry: '怕交不起下月房租',
    money: 200, home: 'apartment',
  },
];

export const RENT_AMOUNT = 450;
export const RENT_DAY_INTERVAL = 30; // 每 30 天 1 号交租
export const LLM_DAILY_BUDGET = 40;  // 每日 LLM 唤醒预算池（全公寓共用）
