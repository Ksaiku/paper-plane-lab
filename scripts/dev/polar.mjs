import { defaultSetup, PHYS } from '../../src/core/config.js';
import { buildAircraft } from '../../src/core/aircraft.js';
import { aeroForces, makeAeroOut, analyzeDesign } from '../../src/core/aero.js';
export function polar(over = {}, verbose = true) {
  const ac = buildAircraft({ ...defaultSetup(), ...over });
  const info = analyzeDesign(ac);
  const out = makeAeroOut();
  const V = 4, q = 0.5 * PHYS.rho * V * V, S = ac.wingArea;
  let best = 0, bestA = 0;
  const rows = [];
  for (let deg = -4; deg <= 40; deg += 2) {
    const a = deg * Math.PI / 180;
    aeroForces(ac, V * Math.cos(a), -V * Math.sin(a), 0, 0, 0, 0, out);
    const L = out.F[1] * Math.cos(a) + out.F[0] * Math.sin(a), D = -out.F[0] * Math.cos(a) + out.F[1] * Math.sin(a);
    const cm = out.M[2] / (q * S * ac.mac);
    rows.push(`${String(deg).padStart(3)}  CL=${(L / (q * S)).toFixed(3)} CD=${(D / (q * S)).toFixed(3)} L/D=${(L / D).toFixed(2)} Cm=${cm.toFixed(3)} eps=${(out.eps * 57.3).toFixed(1)} stall=${out.wingStall.toFixed(2)}`);
    if (L / D > best) { best = L / D; bestA = deg; }
  }
  if (verbose) console.log(rows.join('\n'));
  console.log(`mass=${(ac.mass * 1000).toFixed(2)}g paper=${(ac.paperMass * 1000).toFixed(2)}g cg=${(-ac.cg[0] * 100).toFixed(1)}cm np=${(info.neutralFromNose * 100).toFixed(1)}cm cgY=${(ac.cg[1] * 1000).toFixed(1)}mm SM=${(info.staticMargin * 100).toFixed(0)}% AR=${ac.wingAR.toFixed(2)} S=${(S * 1e4).toFixed(0)}cm2 mac=${(ac.mac * 100).toFixed(1)} LDmax=${best.toFixed(2)}@${bestA} I=[${ac.I[0].toExponential(2)},${ac.I[4].toExponential(2)},${ac.I[8].toExponential(2)}] WL=${info.wingLoading.toFixed(2)}N/m2`);
}
if (process.argv[1].endsWith('polar.mjs')) polar();
