import { defaultSetup } from '../../src/core/config.js';
import { simulate } from '../../src/core/sim.js';
import { computeStats } from '../../src/core/analysis.js';
const res = [];
for (const wingSpan of [18, 22])
for (const wingChord of [9, 11])
for (const tailSpan of [9, 12, 15])
for (const tailAngle of [5, 7, 9, 11])
for (const weightPos of [30, 40, 50])
for (const weightMass of [0.8, 1.5])
for (const throwSpeed of [11, 12.5, 14])
for (const throwPitch of [10, 25]) {
  const s = { ...defaultSetup(), wingSpan, wingChord, wingSweep: 15, wingDihedral: 6, tailSpan, tailAngle, finHeight: 5, weightPos, weightMass, throwSpeed, throwPitch };
  const rec = simulate(s);
  const st = computeStats(rec);
  if (st.loops < 1 || st.tumbles > 0 || st.spinTurns > 0.5) continue;
  res.push({ loops: st.loops, stalls: st.stallCount, d: rec.result.distance, t: rec.result.airtime, lat: st.lateral, s: JSON.stringify({ wingSpan, wingChord, tailSpan, tailAngle, weightPos, weightMass, throwSpeed, throwPitch }) });
}
res.sort((a, b) => b.loops - a.loops || a.stalls - b.stalls || b.d - a.d);
for (const r of res.slice(0, 20)) console.log(r.loops, r.stalls, r.d.toFixed(1), r.t.toFixed(2), r.lat.toFixed(1), r.s);
console.log(res.length);
