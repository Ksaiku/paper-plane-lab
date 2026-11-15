import { run } from './explore.mjs';
import { polar } from './polar.mjs';
const P = {
  basic: {},
  speed: { wingSpan: 15, wingChord: 12, wingSweep: 40, wingDihedral: 4, tailSpan: 6, tailAngle: 2, finHeight: 3, weightPos: 30, weightMass: 1.5, paperThickness: 0.12, throwSpeed: 10, throwPitch: 6 },
  floaty: { wingSpan: 36, wingChord: 8, wingSweep: 0, wingDihedral: 12, tailSpan: 11, tailAngle: 4, finHeight: 4.5, weightPos: 40, weightMass: 0.5, paperThickness: 0.07, throwSpeed: 3, throwPitch: 0 },
  stunt: { wingSpan: 20, wingChord: 11, wingSweep: 15, wingDihedral: 6, tailSpan: 12, tailAngle: 10, finHeight: 5, weightPos: 55, weightMass: 0.8, throwSpeed: 11, throwPitch: 20 },
  fail: { weightPos: 95, weightMass: 1.5 },
};
for (const k in P) { polar(P[k], false); run(k, P[k]); }
