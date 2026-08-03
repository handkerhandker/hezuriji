/** 放大镜：阿浪和菲菲的第 50 天，逐小时看他们在干嘛。 */
import { Sim } from '../src/engine/sim';

const sim = new Sim(20260802);
sim.runUntilDay(50);

const track = ['alang', 'feifei'];
console.log('D50 逐小时状态：');
for (let t = 0; t < 24 * 6; t++) {
  sim.stepTick();
  const w = sim.world;
  if (w.minute < 10) {
    const parts = track.map(id => {
      const a = sim.agentById(id)!;
      return `${a.name}[${a.location.slice(0, 2)} ${a.activity ? a.activity.verb : '闲'} 饿${Math.round(a.hunger)} 累${Math.round(a.energy)} 心情${Math.round(a.mood)} 钱${a.money}${a.slackToday ? ' 摆烂' : ''}]`;
    });
    console.log(`${String(w.hour).padStart(2, '0')}:00`, parts.join('  '));
  }
}
