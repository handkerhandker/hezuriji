import type { Agent, World } from './types';
import { LOCATION_NAMES } from './data';

/** 状态叙事化：不写"饱食 37"，写"饿得有点狠了"。 */
export function stateWords(a: Agent): string[] {
  const out: string[] = [];
  if (a.hunger < 20) out.push('饿得前胸贴后背');
  else if (a.hunger < 40) out.push('饿得有点狠了');
  else if (a.hunger < 60) out.push('有点饿了');

  if (a.energy < 20) out.push('困得眼皮打架');
  else if (a.energy < 40) out.push('明显累了');

  if (a.mood < 25) out.push('心情跌到了谷底');
  else if (a.mood < 45) out.push('有点丧');
  else if (a.mood >= 75) out.push('心情不错');

  if (a.money < 0) out.push('欠着债');
  else if (a.money < 50) out.push('钱包见底了');
  else if (a.money < 200) out.push('得省着点花');
  return out.length ? out : ['状态还行'];
}

export interface DayReport {
  day: number;
  perAgent: Array<{ name: string; digest: string; words: string[] }>;
  highlights: string[];
}

/** 城市日报：每天一页，人翻得动。 */
export function generateDayReport(w: World, day: number): DayReport {
  const dayEvents = w.events.filter(e => e.day === day);
  const perAgent = w.agents.map(a => {
    const starts = dayEvents.filter(e => e.kind === 'act_start' && e.agentId === a.id);
    const counts = new Map<string, number>();
    for (const e of starts) {
      const verb = e.text.replace(`${a.name} `, '').replace(/（-\d+ 元）/, '');
      counts.set(verb, (counts.get(verb) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
      .map(([v, c]) => (c > 1 ? `${v}×${c}` : v)).join('、');
    const notable = a.facts.filter(f => f.day === day && f.kind !== 'meal')
      .map(f => f.text).slice(-2);
    const digest = [top || '安安静静过了一天', ...notable].join('；');
    return { name: a.name, digest, words: stateWords(a) };
  });

  const highlights: string[] = [];
  const milestones = dayEvents.filter(e => e.kind === 'milestone' || e.kind === 'hire');
  for (const m of milestones) highlights.push(m.text);
  const socials = dayEvents.filter(e => e.kind === 'social');
  if (socials.length > 0) highlights.push(`今天发生了 ${socials.length} 次来往`);
  const misses = dayEvents.filter(e => e.kind === 'miss_work');
  for (const m of misses) highlights.push(m.text);
  const richest = [...w.agents].sort((a, b) => b.money - a.money)[0];
  const poorest = [...w.agents].sort((a, b) => a.money - b.money)[0];
  if (richest && poorest && richest.id !== poorest.id) {
    highlights.push(`最有钱的是 ${richest.name}（${richest.money} 元），最紧巴的是 ${poorest.name}（${poorest.money} 元）`);
  }
  return { day, perAgent, highlights };
}

export function locationName(id: string): string {
  return LOCATION_NAMES[id] ?? id;
}
