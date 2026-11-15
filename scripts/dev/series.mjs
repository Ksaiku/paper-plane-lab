import { defaultSetup } from '../../src/core/config.js';
import { simulate } from '../../src/core/sim.js';
export function series(label, over = {}, every = 0.25, opts = {}) {
  const rec = simulate({ ...defaultSetup(), ...over }, opts);
  const fr = rec.frames;
  console.log(`--- ${label}: dist=${rec.result.distance.toFixed(1)} t=${rec.result.airtime.toFixed(2)} end=${rec.result.endReason}`);
  let next = 0;
  for (let i = 0; i < fr.n; i++) {
    if (fr.t[i] + 1e-9 >= next || i === fr.n - 1) {
      next += every;
      console.log(`t=${fr.t[i].toFixed(2)} x=${fr.pos[3 * i].toFixed(1)} y=${fr.pos[3 * i + 1].toFixed(2)} z=${fr.pos[3 * i + 2].toFixed(2)} V=${fr.speed[i].toFixed(1)} a=${fr.alpha[i].toFixed(0)} st=${fr.stall[i].toFixed(1)} pitch=${fr.pitch[i].toFixed(0)} bank=${fr.bank[i].toFixed(0)} hdg=${fr.heading[i].toFixed(0)}`);
    }
  }
  return rec;
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const every = Number(args.every || 0.25); delete args.every;
const over = {}; for (const k in args) over[k] = args[k] === 'true' ? true : Number(args[k]);
if (process.argv[1].endsWith('series.mjs')) series(JSON.stringify(over), over, every);
