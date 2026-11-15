import { defaultSetup } from '../../src/core/config.js';
import { simulate } from '../../src/core/sim.js';
import { computeStats } from '../../src/core/analysis.js';
const res = [];
for (const wingSpan of [14, 16, 18])
for (const wingChord of [10, 12])
for (const wingSweep of [30, 40])
for (const weightMass of [1.5, 2.5, 3.5])
for (const paperThickness of [0.12, 0.16])
for (const weightPos of [50, 60, 70])
for (const tailAngle of [3, 5, 7])
for (const tailSpan of [6, 8])
for (const throwSpeed of [11, 13]) {
  const s = { ...defaultSetup(), wingSpan, wingChord, wingSweep, wingDihedral: 4, tailSpan, tailAngle, finHeight: 3, weightPos, weightMass, paperThickness, throwSpeed, throwPitch: 2 };
  const rec = simulate(s);
  const st = computeStats(rec);
  if (st.stallCount > 0 || st.maxPitch > 22 || st.minPitch < -25) continue;
  res.push({ d: rec.result.distance, t: rec.result.airtime, v: st.avgSpeed, mp: st.maxPitch, s: JSON.stringify({ wingSpan, wingChord, wingSweep, weightMass, paperThickness, weightPos, tailAngle, tailSpan, throwSpeed }) });
}
res.sort((a, b) => b.d - a.d);
for (const r of res.slice(0, 15)) console.log(r.d.toFixed(1), r.t.toFixed(2), r.v.toFixed(1), r.mp.toFixed(0), r.s);
