import { BUILD, AERO, PHYS } from '../../src/core/config.js';
import { polar } from './polar.mjs';
import { run } from './explore.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
for (const k in args) {
  const v = Number(args[k]);
  if (k in BUILD) BUILD[k] = v; else if (k in AERO) AERO[k] = v; else if (k in PHYS) PHYS[k] = v;
}
const over = {};
for (const k in args) if (!(k in BUILD) && !(k in AERO) && !(k in PHYS)) over[k] = Number(args[k]);
polar(over, false);
for (const wp of [0, 25, 50, 75, 100]) run('wp ' + wp, { ...over, weightPos: wp });
