// 開発用：設計を変えて飛ばし、挙動の数字を一覧する
import { defaultSetup } from '../../src/core/config.js';
import { buildAircraft } from '../../src/core/aircraft.js';
import { analyzeDesign } from '../../src/core/aero.js';
import { simulate } from '../../src/core/sim.js';

export function run(label, over = {}, opts = {}) {
  const setup = { ...defaultSetup(), ...over };
  const ac = buildAircraft(setup);
  const info = analyzeDesign(ac);
  const t0 = performance.now();
  const rec = simulate(setup, { aircraft: ac, ...opts });
  const ms = performance.now() - t0;
  const fr = rec.frames, r = rec.result;
  let stallN = 0, was = false, minP = 1e9, maxP = -1e9, maxBank = 0, maxStall = 0;
  let peaks = 0;
  for (let i = 0; i < fr.n; i++) {
    const st = fr.stall[i];
    if (!was && st > 0.6) { stallN++; was = true; } else if (was && st < 0.3) was = false;
    minP = Math.min(minP, fr.pitch[i]); maxP = Math.max(maxP, fr.pitch[i]);
    maxBank = Math.max(maxBank, Math.abs(fr.bank[i])); maxStall = Math.max(maxStall, st);
    if (i > 1 && i < fr.n - 1 && fr.pos[3 * i + 1] > fr.pos[3 * (i - 1) + 1] && fr.pos[3 * i + 1] >= fr.pos[3 * (i + 1) + 1]) peaks++;
  }
  const f = (v, d = 2) => (v === null || v === undefined ? ' -- ' : v.toFixed(d));
  console.log(
    `${label.padEnd(16)} m=${f(ac.mass * 1000, 1)}g SM=${f(info.staticMargin * 100, 0)}% trimA=${f(info.trimAlphaDeg, 1)} Vt=${f(info.trimSpeed, 1)} LD=${f(info.trimGlide, 1)} Cn=${f(info.yawStability, 3)} Cl=${f(info.rollStability, 3)} | dist=${f(r.distance, 1)} t=${f(r.airtime, 2)} hmax=${f(r.maxHeight, 2)} GR=${f(r.glideRatio, 1)} stalls=${stallN} pk=${peaks} pitch[${f(minP, 0)},${f(maxP, 0)}] bank=${f(maxBank, 0)} z=${f(r.landing[2], 1)} end=${r.endReason} ${ms.toFixed(0)}ms`
  );
  return rec;
}
if (process.argv[1].endsWith('explore.mjs')) {
  run('default');
  run('w front', { weightPos: 0 });
  run('w center', { weightPos: 50 });
  run('w rear', { weightPos: 100 });
  for (const wp of [0, 20, 30, 40, 50, 60, 70, 80, 100]) run('wp ' + wp, { weightPos: wp });
  run('dih0', { wingDihedral: 0 });
  run('fin0.5', { finHeight: 0.5 });
  run('h10', { throwHeight: 10 });
}
