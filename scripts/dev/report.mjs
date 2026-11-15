import { defaultSetup } from '../../src/core/config.js';
import { PRESETS, presetSetup } from '../../src/core/presets.js';
import { simulate } from '../../src/core/sim.js';
import { makeComment } from '../../src/core/comment.js';
const f = (v, d = 1) => (v === null || v === undefined ? '--' : v.toFixed(d));
export function report(label, setup) {
  const rec = simulate(setup);
  const c = makeComment(rec), r = rec.result, s = c.stats, i = c.info;
  console.log(`\n■ ${label}  dist=${f(r.distance)}m t=${f(r.airtime, 2)}s hmax=${f(r.maxHeight, 2)} GR=${f(r.glideRatio)} | SM=${f(i.staticMargin * 100, 0)}% trimA=${f(i.trimAlphaDeg)} Vt=${f(i.trimSpeed)} Cn=${f(i.yawStability, 3)} | stalls=${s.stallCount}(${f(s.stallFraction * 100, 0)}%) loops=${s.loops} tumb=${s.tumbles} waves=${s.waves} spin=${f(s.spinTurns)} yaw=${f(s.yawTurns)} track=${f(s.trackChangeDeg, 0)} maxBank=${f(s.maxBank, 0)} lateBank=${f(s.lateBankAbs, 0)} pitch[${f(s.minPitch, 0)},${f(s.maxPitch, 0)}] imp=${f(s.impactPitch, 0)} fd=${f(s.finalDescentDeg, 0)} Vavg=${f(s.avgSpeed)} lat=${f(s.lateral)} drift=${f(s.windDrift)}`);
  console.log(`  [${c.kind}] ${c.headline}： ${c.text}`);
  return rec;
}
if (process.argv[1].endsWith('report.mjs')) {
  for (const p of PRESETS) report(p.name, presetSetup(p.id));
  const d = defaultSetup();
  report('入門 重り前端', { ...d, weightPos: 0 });
  report('入門 重り中央', { ...d, weightPos: 50 });
  report('入門 重り後端', { ...d, weightPos: 100 });
  report('横風2 上反角10', { ...d, windSpeed: 2, windDir: 90, wingDihedral: 10 });
  report('横風2 上反角0', { ...d, windSpeed: 2, windDir: 90, wingDihedral: 0 });
  report('横風4', { ...d, windSpeed: 4, windDir: 90 });
  report('向かい風3', { ...d, windSpeed: 3, windDir: 0 });
  report('追い風3', { ...d, windSpeed: 3, windDir: 180 });
  report('垂直尾翼0.5', { ...d, finHeight: 0.5 });
  report('垂直尾翼0.5 高さ12', { ...d, finHeight: 0.5, throwHeight: 12 });
  report('上昇気流', { ...d, updraft: true });
  report('速すぎ', { ...d, throwSpeed: 10, throwPitch: 20 });
  report('下向き', { ...d, throwPitch: -20 });
  report('遅すぎ', { ...d, throwSpeed: 2 });
}
