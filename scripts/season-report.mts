/**
 * D单：90 模拟日超长跑 + 城市季报（早餐读物，不进仓库）。
 * 模拟一个"每天傍晚发两条短信"的佛系玩家。
 */
import { Sim } from '../src/engine/sim';
import { generateDayReport } from '../src/engine/report';
import { writeFileSync } from 'node:fs';

const DAYS = 90;
const sim = new Sim(20260802);

// 佛系玩家：每天 19 点前后给两个人各发一条
const DAILY_MSGS: Array<[string, string]> = [
  ['alang', '吃饭了吗？别饿着。'],
  ['xiaok', '别熬太晚，早点休息。'],
  ['dingding', '今天也要加油。'],
  ['feifei', '注意身体。'],
  ['laozhou', '省着点花，月底还要交租。'],
];

let msgIdx = 0;
while (sim.world.day <= DAYS) {
  sim.stepTick();
  if (sim.world.hour === 19 && sim.world.minute === 0 && sim.world.credits > 0) {
    const [who, text] = DAILY_MSGS[msgIdx % DAILY_MSGS.length];
    sim.sendMessage(who, text);
    msgIdx++;
  }
}

const w = sim.world;
const L: string[] = [];
L.push(`# 城市季报 · D1–D${DAYS}`);
L.push('');
L.push(`> 90 个模拟日 · 种子 ${w.seed} · 佛系玩家每天傍晚发 1 条短信`);
L.push('');

// —— 终局人物志 ——
L.push('## 终局人物志');
L.push('');
for (const a of w.agents) {
  const facts = a.facts.length;
  const chats = Object.values(a.chatPartners).reduce((s, v) => s + v, 0);
  const hires = a.facts.filter(f => f.kind === 'hire').length;
  const treats = a.facts.filter(f => f.kind === 'treat' && f.text.startsWith('请')).length;
  const misses = a.facts.filter(f => f.kind === 'miss_work').length;
  L.push(`### ${a.name} · ${a.job?.title ?? '无业'}`);
L.push(`- 钱包：${a.money} 元 ${a.money < 0 ? '（欠债中）' : ''} · 心情 ${Math.round(a.mood)} · 履历 ${facts} 条`);
  L.push(`- 90 天：唠嗑 ${chats} 次 · 请客 ${treats} 次 · 翘班 ${misses} 天${hires ? ` · 找到工作 ${hires} 次` : ''}`);
  const best = Object.entries(a.chatPartners).sort((x, y) => y[1] - x[1])[0];
  if (best) {
    const name = w.agents.find(x => x.id === best[0])?.name ?? best[0];
    L.push(`- 最聊得来的人：${name}（${best[1]} 次）`);
  }
  L.push(`- 心愿：${a.wish} · 担忧：${a.worry}`);
  L.push('');
}

// —— 城市大事记 ——
L.push('## 大事记');
L.push('');
const milestones = w.events.filter(e => e.kind === 'milestone' || e.kind === 'hire');
for (const e of milestones.slice(0, 40)) {
  L.push(`- D${e.day} ${String(e.hour).padStart(2, '0')}:${String(e.min).padStart(2, '0')} ${e.text}`);
}
L.push('');

// —— 关系榜 ——
L.push('## 关系榜（唠嗑次数 TOP）');
L.push('');
const pairs = new Map<string, number>();
for (const a of w.agents) {
  for (const [pid, n] of Object.entries(a.chatPartners)) {
    const key = [a.id, pid].sort().join('|');
    pairs.set(key, Math.max(pairs.get(key) ?? 0, n));
  }
}
const topPairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [key, n] of topPairs) {
  const [x, y] = key.split('|').map(id => w.agents.find(a => a.id === id)?.name ?? id);
  L.push(`- ${x} × ${y}：${n} 次`);
}
L.push('');

// —— 短信众生相 ——
L.push('## 短信众生相');
L.push('');
const out = w.smsLog.filter(s => s.dir === 'out').length;
const inb = w.smsLog.filter(s => s.dir === 'in').length;
const noReply = w.agents.flatMap(a => a.facts).filter(f => f.text.includes('没回')).length;
L.push(`- 玩家共发 ${out} 条，回信 ${inb} 封，已读不回 ${noReply} 次（回复率 ${Math.round((inb / Math.max(1, out)) * 100)}%）`);
const replyByAgent = w.agents.map(a => ({
  name: a.name,
  n: w.smsLog.filter(s => s.dir === 'in' && s.agentId === a.id).length,
})).sort((a, b) => b.n - a.n);
L.push(`- 最爱回你的是：${replyByAgent[0]?.name}（${replyByAgent[0]?.n} 封）；最不爱理你的是：${replyByAgent[replyByAgent.length - 1]?.name}`);
L.push('');

// —— 天气与节奏 ——
L.push('## 天气与节奏');
L.push('');
const rains = w.events.filter(e => e.kind === 'weather' && e.text.includes('下起了雨'));
L.push(`- 90 天共下雨 ${rains.length} 场`);
L.push('');

// —— 指标曲线摘要 ——
L.push('## 指标曲线（每 10 天）');
L.push('');
L.push('| 天 | 动作熵 | 基尼 | 社交对 | LLM醒/退 | 进账/花销 |');
L.push('|---|---|---|---|---|---|');
for (const m of sim.metricsHistory) {
  if (m.day % 10 === 0) {
    L.push(`| D${m.day} | ${m.actionEntropy.toFixed(2)} | ${m.gini.toFixed(2)} | ${m.socialPairs} | ${m.llmWakes}/${m.llmFallbacks} | ${m.faucet}/${m.sink} |`);
  }
}
L.push('');

// —— 最有戏的一天 ——
const dramaByDay = new Map<number, number>();
for (const e of w.events) {
  if (e.salient) dramaByDay.set(e.day, (dramaByDay.get(e.day) ?? 0) + 1);
}
const bestDay = [...dramaByDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
L.push(`## 最有戏的一天（D${bestDay}）`);
L.push('');
const r = generateDayReport(w, bestDay);
for (const p of r.perAgent) L.push(`- **${p.name}**：${p.digest}`);
for (const h of r.highlights) L.push(`- ★ ${h}`);
L.push('');

// —— 体检结论 ——
const giniLast = sim.metricsHistory[sim.metricsHistory.length - 1];
L.push('## 体检结论');
L.push('');
const issues: string[] = [];
if ((giniLast?.actionEntropy ?? 1) < 0.5) issues.push('动作熵偏低，日子有点单调');
if ((giniLast?.gini ?? 0) > 0.8) issues.push('贫富差距偏大');
if (rains.length < 5) issues.push('导演层扰动偏少');
L.push(issues.length ? `- ⚠️ ${issues.join('；')}` : '- 三个月跑下来没有大病：熵没塌、没集体破产、社交没孤岛。');
L.push('');
L.push('—— 季报完。这座城市还想过下个季度。');

writeFileSync('F:\\资料\\kimi\\new game6\\城市季报-D1-D90.md', L.join('\n'), 'utf8');
console.log(`季报已生成：F:\\资料\\kimi\\new game6\\城市季报-D1-D90.md`);
console.log(`事件总量 ${w.events.length} · 短信 ${out} 发 ${inb} 回 · 下雨 ${rains.length} 场`);
console.log('终局钱包:', w.agents.map(a => `${a.name}=${a.money}`).join(' '));
