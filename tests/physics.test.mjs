// 物理の計算のテスト（画面なしで走る）。実行: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, PARAMS, defaultSetup } from '../src/core/config.js';
import { buildAircraft, sanitizeSetup, getLimits, clampParam } from '../src/core/aircraft.js';
import { analyzeDesign } from '../src/core/aero.js';
import { simulate, initialState, sampleFlight, makeSample } from '../src/core/sim.js';
import { computeStats } from '../src/core/analysis.js';
import { makeComment } from '../src/core/comment.js';
import { PRESETS, presetSetup } from '../src/core/presets.js';

const D2R = Math.PI / 180;
const base = () => defaultSetup();
const quatMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

// ---------------------------------------------------------------
test('1. 翼がほぼない機体は、石のように落ちる', () => {
  const setup = { ...base(), wingSpan: 10, wingChord: 4, tailSpan: 4, finHeight: 0.5, throwSpeed: 5, throwPitch: 0, throwHeight: 4 };
  const ac = buildAircraft(setup);
  // テスト用に、空気を受ける面積を1万分の1にする（＝翼がほぼない）
  for (const e of ac.elements) { e.area *= 1e-4; e.damp *= 1e-4; }
  const rec = simulate(setup, { aircraft: ac });
  // 空気がないときの落下：高さ h を落ちる時間 t = √(2h/g)、その間に進む距離 = 速さ × t
  const lowest = Math.min(...ac.contacts.map((c) => c[1])); // 機体のいちばん低い点（重心から）
  const tFree = Math.sqrt((2 * (4 + lowest)) / PHYS.g);
  assert.ok(Math.abs(rec.result.airtime - tFree) / tFree < 0.02, `落下時間 ${rec.result.airtime} vs 自由落下 ${tFree}`);
  assert.ok(Math.abs(rec.result.distance - 5 * tFree) / (5 * tFree) < 0.02, `距離 ${rec.result.distance} vs ${5 * tFree}`);
  // ふつうの翼の機体は、同じ投げ方でずっと長く飛ぶ
  const normal = simulate({ ...base(), throwSpeed: 5, throwPitch: 0, throwHeight: 4 });
  assert.ok(normal.result.airtime > 3 * rec.result.airtime);
});

// ---------------------------------------------------------------
test('2. 風も上昇気流もないとき、高さと速さを合わせたエネルギーが増えない', () => {
  const cases = PRESETS.map((p) => presetSetup(p.id));
  cases.push({ ...base(), weightPos: 0 }, { ...base(), weightPos: 100 }, { ...base(), finHeight: 0.5, throwHeight: 12 });
  cases.push({ ...base(), throwSpeed: 14, throwPitch: 60 }, { ...base(), wingSpan: 40, wingChord: 4, paperThickness: 0.06, weightMass: 0 });
  for (const s of cases) {
    const rec = simulate({ ...s, windSpeed: 0, updraft: false });
    const E = rec.frames.energy;
    const E0 = E[0];
    for (let i = 1; i < rec.frames.n; i++) {
      // 数値誤差ぶん（初期エネルギーの100万分の1）だけ許す
      assert.ok(E[i] <= E[i - 1] + Math.abs(E0) * 1e-6, `エネルギーが増えた: コマ${i} ${E[i - 1]} → ${E[i]}`);
    }
    assert.ok(E[rec.frames.n - 1] < E0);
  }
});

// ---------------------------------------------------------------
test('3. 時間の刻みを半分にしても、着地点の差が5%以内', () => {
  for (const id of ['basic', 'speed', 'floaty']) {
    const s = presetSetup(id);
    const a = simulate(s, { dt: PHYS.dt });
    const b = simulate(s, { dt: PHYS.dt / 2 });
    const d = Math.hypot(a.result.landing[0] - b.result.landing[0], a.result.landing[2] - b.result.landing[2]);
    const rel = d / a.result.distance;
    assert.ok(rel < 0.05, `${id}: 着地点の差 ${d.toFixed(4)}m（${(rel * 100).toFixed(3)}%）`);
    assert.ok(Math.abs(a.result.airtime - b.result.airtime) / a.result.airtime < 0.05);
  }
});

// ---------------------------------------------------------------
test('4. 同じ条件で2回計算すると、結果が完全に一致する（風・揺らぎ・上昇気流つき）', () => {
  const s = { ...presetSetup('basic'), windSpeed: 3, windDir: 75, updraft: true, throwHeading: 12 };
  const a = simulate(s), b = simulate(s);
  assert.deepStrictEqual(a.result, b.result);
  assert.equal(a.frames.n, b.frames.n);
  for (const k of ['t', 'pos', 'quat', 'vel', 'omega', 'lift', 'drag', 'energy']) {
    assert.deepStrictEqual(Array.from(a.frames[k]), Array.from(b.frames[k]), `列 ${k} が一致しない`);
  }
  assert.deepStrictEqual(makeComment(a).text, makeComment(b).text);
  // 記録の間隔（＝画面に出す細かさ）を変えても、結果の数字は変わらない
  const c = simulate(s, { recordEvery: 1 });
  assert.equal(c.result.distance, a.result.distance);
  assert.equal(c.result.airtime, a.result.airtime);
});

// ---------------------------------------------------------------
test('5. 重りの位置を前・中央・後ろにすると、「急降下」「まっすぐ滑空」「波打つ失速」に分かれる', () => {
  const front = simulate({ ...presetSetup('basic'), weightPos: 0 });
  const center = simulate({ ...presetSetup('basic'), weightPos: 50 });
  const rear = simulate({ ...presetSetup('basic'), weightPos: 100 });
  const sf = computeStats(front), sc = computeStats(center), sr = computeStats(rear);
  // 前：失速せず、機首を大きく下げ、急な角度で短時間のうちに着地する
  assert.equal(sf.stallCount, 0);
  assert.ok(sf.minPitch < -20, `前: 機首の最低角 ${sf.minPitch}`);
  assert.ok(sf.finalDescentDeg > 20, `前: 降下角 ${sf.finalDescentDeg}`);
  assert.ok(front.result.distance < 0.6 * center.result.distance);
  assert.ok(front.result.airtime < 0.5 * center.result.airtime);
  // 中央：失速せず、機首はほぼ水平のまま、遠くまでまっすぐ飛ぶ
  assert.equal(sc.stallCount, 0);
  assert.ok(sc.minPitch > -20 && sc.maxPitch < 20);
  assert.ok(center.result.glideRatio > 3.5);
  assert.ok(Math.abs(sc.lateral) < 0.15 * center.result.distance);
  assert.ok(sc.maxBank < 10);
  // 後ろ：機首が上がって失速し、それを何度もくり返す（上がっては落ちる）
  assert.ok(sr.stallCount >= 3, `後ろ: 失速 ${sr.stallCount}回`);
  assert.ok(sr.maxPitch > 30, `後ろ: 機首の最高角 ${sr.maxPitch}`);
  assert.ok(rear.result.distance < 0.7 * center.result.distance);
  // 機首の角度が上下に何度も振れる（波打つ）：上向き→下向きの入れ替わりを数える
  let swings = 0, up = false;
  for (let i = 0; i < rear.frames.n; i++) {
    const p = rear.frames.pitch[i];
    if (!up && p > 15) { up = true; swings++; } else if (up && p < -5) up = false;
  }
  assert.ok(swings >= 2, `後ろ: 機首の振れ ${swings}回`);
  // 設計の性質：重心と中立点の位置関係が入れ替わる
  assert.ok(analyzeDesign(front.aircraft).staticMargin > 0.3);
  assert.ok(analyzeDesign(center.aircraft).staticMargin > 0.08 && analyzeDesign(center.aircraft).staticMargin < 0.22);
  assert.ok(analyzeDesign(rear.aircraft).staticMargin < 0);
  // 一言解説も3通りに分かれる
  assert.equal(makeComment(front).kind, 'dive');
  assert.equal(makeComment(center).kind, 'glide');
  assert.equal(makeComment(rear).kind, 'stall');
  assert.match(makeComment(rear).text, /重りを前へ/);
});

// ---------------------------------------------------------------
test('6. 上反角があると、傾いたあと水平に戻りやすい', () => {
  // 静かな空気の中で、右へ25°傾けた状態から滑空させ、傾きの変化を比べる
  const run = (dihedral) => {
    const s = { ...presetSetup('basic'), wingDihedral: dihedral, throwHeight: 12, throwSpeed: 3.8, throwPitch: -8 };
    const init = initialState(s);
    const h = (25 * D2R) / 2;
    init.quat = quatMul(init.quat, [Math.cos(h), Math.sin(h), 0, 0]);
    return simulate(s, { initial: init });
  };
  const bankAt = (rec, time) => sampleFlight(rec, time, makeSample()).bank;
  const flat = run(0), vee = run(10);
  // 上反角10°：2秒後には傾きが大きく減り、最後はほぼ水平
  assert.ok(Math.abs(bankAt(vee, 2.0)) < 10, `上反角10°: 2秒後の傾き ${bankAt(vee, 2.0)}`);
  const sv = computeStats(vee), sf = computeStats(flat);
  assert.ok(sv.lateBankAbs < 5, `上反角10°: 後半の平均の傾き ${sv.lateBankAbs}`);
  // 上反角0°：傾きが戻らず、曲がり続ける
  assert.ok(sf.lateBankAbs > 2 * sv.lateBankAbs + 5, `上反角0°: 後半の平均の傾き ${sf.lateBankAbs}`);
  assert.ok(Math.abs(sf.trackChangeDeg) > 2 * Math.abs(sv.trackChangeDeg));
  // 設計の性質としても、上反角が大きいほど復元力が大きい
  const r0 = analyzeDesign(buildAircraft({ ...base(), wingDihedral: 0 })).rollStability;
  const r10 = analyzeDesign(buildAircraft({ ...base(), wingDihedral: 10 })).rollStability;
  const r20 = analyzeDesign(buildAircraft({ ...base(), wingDihedral: 20 })).rollStability;
  assert.ok(r20 > r10 && r10 > r0);
  // 横風の中でも、戻り方が違う（判定基準5）
  const windy = (d) => computeStats(simulate({ ...presetSetup('basic'), wingDihedral: d, windSpeed: 2, windDir: 90 }));
  const w0 = windy(0), w10 = windy(10);
  assert.ok(w10.lateBankAbs < 4, `横風・上反角10°: 後半の傾き ${w10.lateBankAbs}`);
  assert.ok(w0.lateBankAbs > w10.lateBankAbs + 2, `横風・上反角0°: 後半の傾き ${w0.lateBankAbs}`);
});

// ---------------------------------------------------------------
test('7. お手本の機体の滑空比が、現実の紙飛行機として不自然でない範囲に入る', () => {
  // 根拠（docs/design.md）：紙飛行機の最大揚抗比は、解析・実験の報告でおよそ 3.3〜5.1。
  // 平板翼の風洞実験（低レイノルズ数）で 5〜7。→ 許容範囲を 2.5〜7.5 とする。
  const LO = 2.5, HI = 7.5;
  for (const id of ['basic', 'speed', 'floaty', 'stunt']) {
    const s = presetSetup(id);
    const ac = buildAircraft(s);
    const info = analyzeDesign(ac);
    assert.ok(info.trimSpeed > 0, `${id}: 釣り合う速さがある`);
    // 釣り合う速さ・釣り合う降下角で高さ30mから放し、後半の「進んだ距離÷下がった高さ」を測る
    const gamma = Math.atan(1 / info.trimGlide);
    const th = info.trimAlphaDeg * D2R - gamma;
    const init = {
      pos: [0, 30, 0],
      vel: [info.trimSpeed * Math.cos(gamma), -info.trimSpeed * Math.sin(gamma), 0],
      quat: [Math.cos(th / 2), 0, 0, Math.sin(th / 2)],
      omega: [0, 0, 0],
    };
    const rec = simulate(s, { aircraft: ac, initial: init });
    const fr = rec.frames;
    const i0 = Math.floor(fr.n * 0.4), i1 = fr.n - 1;
    const run = fr.pos[3 * i1] - fr.pos[3 * i0], drop = fr.pos[3 * i0 + 1] - fr.pos[3 * i1 + 1];
    const ratio = run / drop;
    assert.ok(ratio >= LO && ratio <= HI, `${id}: 定常滑空の滑空比 ${ratio.toFixed(2)}`);
    assert.ok(Math.abs(ratio - info.trimGlide) / info.trimGlide < 0.1, `${id}: 飛行 ${ratio.toFixed(2)} と設計値 ${info.trimGlide.toFixed(2)}`);
    // 飛ぶ速さも紙飛行機らしい範囲（毎秒2〜10m）
    assert.ok(info.trimSpeed > 2 && info.trimSpeed < 10, `${id}: 釣り合う速さ ${info.trimSpeed}`);
    // 重さも紙飛行機らしい範囲（3〜12g）
    assert.ok(ac.mass > 0.003 && ac.mass < 0.012, `${id}: 重さ ${ac.mass * 1000}g`);
  }
  // 結果表示の滑空比（最高点から着地まで）も、入門型・ゆったり型で同じ範囲に入る
  for (const id of ['basic', 'floaty']) {
    const r = simulate(presetSetup(id)).result;
    assert.ok(r.glideRatio >= LO && r.glideRatio <= HI, `${id}: 表示の滑空比 ${r.glideRatio}`);
  }
});

// ---------------------------------------------------------------
test('8. 風を強くすると、風下へ流される', () => {
  const drift = (w, dir = 90) => computeStats(simulate({ ...presetSetup('basic'), windSpeed: w, windDir: dir })).windDrift;
  // 無風では流されない。弱い横風で少し、強くすると大きく風下へ流される
  const d0 = drift(0), d1 = drift(1), d2 = drift(2);
  assert.ok(Math.abs(d0) < 1e-9);
  assert.ok(d1 > 1.5, `風1m/s: 風下へ ${d1}m`);
  assert.ok(d2 > d1 + 5, `風2m/s: 風下へ ${d2}m（風1m/sでは ${d1}m）`);
  // さらに強い風では機体が大きく傾いて飛行が乱れるが、必ず風下側へ10m以上流される
  for (const w of [3, 4, 5]) assert.ok(drift(w) > 10, `風${w}m/s: 風下へ ${drift(w)}m`);
  // 風の向きを逆（左から）にすると、流される向きも逆（右へ）になる
  const left = computeStats(simulate({ ...presetSetup('basic'), windSpeed: 2, windDir: 270 }));
  assert.ok(left.lateral > 5 && left.windDrift > 5);
  const right = computeStats(simulate({ ...presetSetup('basic'), windSpeed: 2, windDir: 90 }));
  assert.ok(right.lateral < -5);
  // 追い風は飛距離を伸ばし、向かい風は縮める（同じ対気速度になるよう投げる速さを合わせる）
  const tail = simulate({ ...presetSetup('basic'), windSpeed: 1.5, windDir: 180, throwSpeed: 6 });
  const head = simulate({ ...presetSetup('basic'), windSpeed: 1.5, windDir: 0, throwSpeed: 3 });
  assert.ok(tail.result.distance > head.result.distance + 8, `追い風 ${tail.result.distance} / 向かい風 ${head.result.distance}`);
});

// ---------------------------------------------------------------
test('9. 垂直尾翼が小さすぎると、向きが安定せず、くるくる回る', () => {
  const small = { ...presetSetup('basic'), finHeight: 0.5, throwHeight: 12 };
  const normal = { ...presetSetup('basic'), throwHeight: 12 };
  assert.ok(analyzeDesign(buildAircraft(small)).yawStability < 0, '小さい垂直尾翼では風見鶏の効きが負');
  assert.ok(analyzeDesign(buildAircraft(normal)).yawStability > 0.03);
  const ss = computeStats(simulate(small)), sn = computeStats(simulate(normal));
  assert.ok(ss.yawTurns > 2, `小さい垂直尾翼: ${ss.yawTurns}回転`);
  assert.ok(sn.yawTurns < 0.2 && sn.maxBank < 10);
  assert.equal(makeComment(simulate(small)).kind, 'spin');
  assert.match(makeComment(simulate(small)).text, /垂直尾翼を大きく/);
});

// ---------------------------------------------------------------
test('10. お手本の5種類は、それぞれ飛び方が違う', () => {
  for (const p of PRESETS) assert.deepStrictEqual(sanitizeSetup(presetSetup(p.id)), presetSetup(p.id), `${p.id} は範囲内`);
  const recs = Object.fromEntries(PRESETS.map((p) => [p.id, simulate(presetSetup(p.id))]));
  const st = Object.fromEntries(Object.entries(recs).map(([k, r]) => [k, computeStats(r)]));
  const kinds = Object.fromEntries(Object.entries(recs).map(([k, r]) => [k, makeComment(r).kind]));
  assert.deepStrictEqual(kinds, { basic: 'glide', speed: 'fast', floaty: 'float', stunt: 'loop', fail: 'stall' });
  // スピード型：いちばん速く、入門型より遠くへ
  for (const k of ['basic', 'floaty', 'stunt', 'fail']) assert.ok(st.speed.avgSpeed > 1.5 * st[k].avgSpeed);
  assert.ok(recs.speed.result.distance > recs.basic.result.distance);
  // ゆったり型：いちばん長く浮かび、いちばん遅い
  for (const k of ['basic', 'speed', 'stunt', 'fail']) assert.ok(recs.floaty.result.airtime > recs[k].result.airtime);
  for (const k of ['basic', 'speed', 'stunt']) assert.ok(st.floaty.avgSpeed < st[k].avgSpeed);
  // 曲芸型：宙返りする
  assert.ok(st.stunt.loops >= 1);
  for (const k of ['basic', 'speed', 'floaty', 'fail']) assert.equal(st[k].loops, 0);
  // 失敗例：失速をくり返し、遠くへ飛ばない。解説に直し方がある
  assert.ok(st.fail.stallCount >= 2);
  assert.ok(recs.fail.result.distance < 0.5 * recs.basic.result.distance);
  assert.match(makeComment(recs.fail).text, /重心が後ろすぎ/);
  assert.match(makeComment(recs.fail).text, /重りを前へずらしてみましょう/);
  // 入門型：投げ方が多少ちがっても安定して飛ぶ（だれが投げても）
  for (const v of [3.5, 4.5, 5.5]) for (const pitch of [-5, 3, 12]) {
    const r = simulate({ ...presetSetup('basic'), throwSpeed: v, throwPitch: pitch });
    const s = computeStats(r);
    assert.ok(s.stallCount <= 1 && s.maxBank < 15 && r.result.distance > 12, `入門型 v=${v} pitch=${pitch}: 距離${r.result.distance.toFixed(1)} 失速${s.stallCount}`);
  }
});

// ---------------------------------------------------------------
test('11. 左右対称：投げのブレを左右逆にすると、飛び方も左右逆になる', () => {
  const s = { ...presetSetup('basic'), weightPos: 100 }; // 失速して翼が落ちる、いちばん難しい場合
  const a = simulate(s);
  const init = initialState(s);
  // 四元数 (w,x,y,z) を z→-z の鏡に映す：x, y 成分の符号が変わる
  init.quat = [init.quat[0], -init.quat[1], -init.quat[2], init.quat[3]];
  const b = simulate(s, { initial: init });
  assert.ok(Math.abs(a.result.landing[0] - b.result.landing[0]) < 1e-6);
  assert.ok(Math.abs(a.result.landing[2] + b.result.landing[2]) < 1e-6);
  assert.ok(Math.abs(a.result.airtime - b.result.airtime) < 1e-9);
});

// ---------------------------------------------------------------
test('12. 物理的に作れない形は選べない／どんな設計でも計算が壊れない', () => {
  // 範囲の外の値は範囲に収まる
  const s = sanitizeSetup({ wingSpan: 0, wingChord: -3, tailSpan: 999, finHeight: 0, paperThickness: 0, weightMass: -1 });
  for (const p of PARAMS) {
    if (p.type === 'bool') continue;
    assert.ok(s[p.key] >= p.min && s[p.key] <= p.max, `${p.key}=${s[p.key]}`);
  }
  // 主翼と水平尾翼が重ならない／翼端が後端を越えない
  const big = sanitizeSetup({ wingChord: 12, tailSpan: 18, wingSpan: 40, wingSweep: 45 });
  const g = buildAircraft(big).geometry;
  assert.ok(g.wing.right[3][0] > g.tail.right[0][0], '主翼の後縁が尾翼の前縁より前');
  assert.ok(g.wing.right[2][0] >= -g.length - 1e-9, '翼端の後縁が胴体の後端を越えない');
  const lim = getLimits({ ...base(), tailSpan: 18 });
  assert.ok(lim.wingChord.max < 12);
  assert.equal(clampParam({ ...base(), tailSpan: 18 }, 'wingChord', 12), lim.wingChord.max);
  // すべての項目の最小・最大の組み合わせ（端だけ）で、計算が有限の値で終わる
  const keys = PARAMS.filter((p) => p.type !== 'bool').map((p) => p.key);
  let count = 0;
  for (let mask = 0; mask < 1 << keys.length; mask += 37) {
    const t = {};
    keys.forEach((k, i) => { const p = PARAMS.find((x) => x.key === k); t[k] = mask & (1 << i) ? p.max : p.min; });
    t.updraft = mask % 2 === 0;
    const rec = simulate(t, { maxTime: 20 });
    const r = rec.result;
    assert.ok(Number.isFinite(r.distance) && Number.isFinite(r.airtime) && Number.isFinite(r.maxHeight), JSON.stringify(t));
    assert.notEqual(r.endReason, 'error', JSON.stringify(t));
    assert.ok(buildAircraft(t).mass > 0);
    const c = makeComment(rec);
    assert.ok(c.text.length > 10 && !/NaN|undefined|null/.test(c.text), c.text);
    count++;
  }
  assert.ok(count > 1000);
});

// ---------------------------------------------------------------
test('13. 上昇気流があると、滞空時間が伸びる', () => {
  const off = simulate({ ...presetSetup('basic'), updraft: false });
  const on = simulate({ ...presetSetup('basic'), updraft: true });
  assert.ok(on.result.airtime > off.result.airtime * 1.3);
  assert.equal(makeComment(on).kind, 'float');
});

// ---------------------------------------------------------------
test('14. 記録の再生：途中の時刻の状態が、前後のコマの間になめらかに入る', () => {
  const rec = simulate(presetSetup('basic'));
  const s = makeSample();
  sampleFlight(rec, 0, s);
  assert.deepStrictEqual(s.pos, [0, 4, 0]);
  sampleFlight(rec, rec.result.airtime + 5, s);
  assert.ok(Math.abs(s.pos[0] - rec.result.landing[0]) < 1e-9);
  const t = rec.frames.t[10] * 0.5 + rec.frames.t[11] * 0.5;
  sampleFlight(rec, t, s);
  assert.ok(Math.abs(s.pos[0] - 0.5 * (rec.frames.pos[30] + rec.frames.pos[33])) < 1e-9);
  const qn = Math.hypot(...s.quat);
  assert.ok(Math.abs(qn - 1) < 1e-9);
});
