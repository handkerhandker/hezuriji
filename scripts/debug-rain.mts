import { Sim } from '../src/engine/sim';

const sim = new Sim(20260802);
sim.runUntilDay(31);
const weather = sim.world.events.filter(e => e.kind === 'weather');
console.log('30 天天气事件数:', weather.length);
for (const e of weather.slice(0, 8)) {
  console.log(`  D${e.day} ${String(e.hour).padStart(2, '0')}:${String(e.min).padStart(2, '0')} ${e.text}`);
}
process.exit(weather.length > 0 ? 0 : 1);
