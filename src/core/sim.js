// ============================================================
// 飛行の計算（6自由度：移動3方向＋回転3方向）。
// 固定の時間刻み dt で、4次のルンゲ＝クッタ法（RK4）により運動方程式を解く。
// 飛行は「投げた瞬間に最後まで計算」し、画面はその記録を再生する。
// → 画面のコマ数に結果が左右されず、同じ条件なら結果が完全に一致する。
// 座標：世界座標は x=前（投げる正面）, y=上, z=右。機体座標も同じ向き（x=機首, y=上, z=右翼）。
// ============================================================
import { PHYS } from './config.js';
import { buildAircraft } from './aircraft.js';
import { aeroForces, makeAeroOut } from './aero.js';
import { makeWind, groundHeight } from './wind.js';

const D2R = Math.PI / 180;

function quatMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
const axisAngle = (x, y, z, ang) => {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), x * s, y * s, z * s];
};

/** 投げた瞬間の状態（位置・速度・向き・回転） */
export function initialState(setup) {
  const th = setup.throwPitch * D2R;
  const ps = setup.throwHeading * D2R;
  const V = setup.throwSpeed;
  const dir = [Math.cos(th) * Math.cos(ps), Math.sin(th), Math.cos(th) * Math.sin(ps)];
  // 向き：右へ ps 回す（y軸まわりに -ps）→ 機首を th 上げる（z軸まわりに +th）→ 投げのブレ
  let q = quatMul(axisAngle(0, 1, 0, -ps), axisAngle(0, 0, 1, th));
  q = quatMul(q, axisAngle(0, 1, 0, -PHYS.throwYawErrorDeg * D2R));
  q = quatMul(q, axisAngle(1, 0, 0, PHYS.throwRollErrorDeg * D2R));
  return {
    pos: [0, setup.throwHeight, 0],
    vel: [V * dir[0], V * dir[1], V * dir[2]],
    quat: q,
    omega: [0, 0, 0],
  };
}

/** 1コマぶんの記録の列の名前と幅 */
const COLS = {
  t: 1, pos: 3, quat: 4, vel: 3, omega: 3, lift: 3, drag: 3, wind: 3,
  speed: 1, alpha: 1, stall: 1, pitch: 1, bank: 1, heading: 1, energy: 1,
};

/**
 * 飛行を最後まで計算する。
 * @param setupIn 設計＋投げ方＋環境（画面の単位）
 * @param opts { dt, aircraft, initial, maxTime, recordEvery }（テスト用の上書き）
 * @returns 飛行の記録 { setup, aircraft, frames, result }
 */
export function simulate(setupIn, opts = {}) {
  const ac = opts.aircraft || buildAircraft(setupIn);
  const setup = ac.setup;
  const dt = opts.dt || PHYS.dt;
  const recEvery = opts.recordEvery || Math.max(1, Math.round((PHYS.dt * PHYS.recordEvery) / dt));
  const maxTime = opts.maxTime || PHYS.maxTime;
  const wind = makeWind(setup);
  const init = opts.initial || initialState(setup);
  const m = ac.mass, g = PHYS.g;
  const I = ac.I, Ii = ac.Iinv;
  const contacts = ac.contacts;
  const aero = makeAeroOut();
  const W = [0, 0, 0];

  // 状態：位置3, 速度3, 向き（四元数 w,x,y,z）4, 角速度（機体座標）3
  let s = new Float64Array(13);
  s.set(init.pos, 0); s.set(init.vel, 3); s.set(init.quat, 6); s.set(init.omega, 10);
  const k1 = new Float64Array(13), k2 = new Float64Array(13), k3 = new Float64Array(13), k4 = new Float64Array(13);
  const tmp = new Float64Array(13);
  const R = new Float64Array(9);

  function rotation(st) {
    let qw = st[6], qx = st[7], qy = st[8], qz = st[9];
    const n = 1 / Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
    qw *= n; qx *= n; qy *= n; qz *= n;
    R[0] = 1 - 2 * (qy * qy + qz * qz); R[1] = 2 * (qx * qy - qw * qz); R[2] = 2 * (qx * qz + qw * qy);
    R[3] = 2 * (qx * qy + qw * qz); R[4] = 1 - 2 * (qx * qx + qz * qz); R[5] = 2 * (qy * qz - qw * qx);
    R[6] = 2 * (qx * qz - qw * qy); R[7] = 2 * (qy * qz + qw * qx); R[8] = 1 - 2 * (qx * qx + qy * qy);
  }

  /** 運動方程式：状態 st と時刻 t から、状態の変化の速さ d を求める */
  function deriv(st, t, d) {
    rotation(st);
    const vx = st[3], vy = st[4], vz = st[5];
    const wx = st[10], wy = st[11], wz = st[12];
    let ax = vx, ay = vy, az = vz;
    if (wind) {
      wind(st[0], st[1], st[2], t, W);
      ax -= W[0]; ay -= W[1]; az -= W[2];
    } else {
      W[0] = 0; W[1] = 0; W[2] = 0;
    }
    // 空気に対する速度を機体座標へ
    const bx = R[0] * ax + R[3] * ay + R[6] * az;
    const by = R[1] * ax + R[4] * ay + R[7] * az;
    const bz = R[2] * ax + R[5] * ay + R[8] * az;
    aeroForces(ac, bx, by, bz, wx, wy, wz, aero);
    const F = aero.F, M = aero.M;
    // 位置の変化＝速度
    d[0] = vx; d[1] = vy; d[2] = vz;
    // 速度の変化＝（空気力＋重力）÷質量
    d[3] = (R[0] * F[0] + R[1] * F[1] + R[2] * F[2]) / m;
    d[4] = (R[3] * F[0] + R[4] * F[1] + R[5] * F[2]) / m - g;
    d[5] = (R[6] * F[0] + R[7] * F[1] + R[8] * F[2]) / m;
    // 向きの変化（四元数）
    const qw = st[6], qx = st[7], qy = st[8], qz = st[9];
    d[6] = -0.5 * (qx * wx + qy * wy + qz * wz);
    d[7] = 0.5 * (qw * wx + qy * wz - qz * wy);
    d[8] = 0.5 * (qw * wy + qz * wx - qx * wz);
    d[9] = 0.5 * (qw * wz + qx * wy - qy * wx);
    // 角速度の変化（オイラーの運動方程式）：I ω' = M - ω × (I ω)
    const hx = I[0] * wx + I[1] * wy + I[2] * wz;
    const hy = I[3] * wx + I[4] * wy + I[5] * wz;
    const hz = I[6] * wx + I[7] * wy + I[8] * wz;
    const tx = M[0] - (wy * hz - wz * hy);
    const ty = M[1] - (wz * hx - wx * hz);
    const tz = M[2] - (wx * hy - wy * hx);
    d[10] = Ii[0] * tx + Ii[1] * ty + Ii[2] * tz;
    d[11] = Ii[3] * tx + Ii[4] * ty + Ii[5] * tz;
    d[12] = Ii[6] * tx + Ii[7] * ty + Ii[8] * tz;
  }

  /** 機体のいちばん低い点と地面とのすき間 */
  function clearance(st) {
    rotation(st);
    let minC = Infinity;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const x = st[0] + R[0] * c[0] + R[1] * c[1] + R[2] * c[2];
      const y = st[1] + R[3] * c[0] + R[4] * c[1] + R[5] * c[2];
      const z = st[2] + R[6] * c[0] + R[7] * c[1] + R[8] * c[2];
      const cl = y - groundHeight(x, z);
      if (cl < minC) minC = cl;
    }
    return minC;
  }

  // ---- 記録 ----
  const cols = {};
  for (const k in COLS) cols[k] = [];
  function record(st, t) {
    deriv(st, t, tmp); // 力・風などを、この瞬間の値として取り直す
    const F = aero;
    cols.t.push(t);
    cols.pos.push(st[0], st[1], st[2]);
    const n = 1 / Math.sqrt(st[6] * st[6] + st[7] * st[7] + st[8] * st[8] + st[9] * st[9]);
    cols.quat.push(st[6] * n, st[7] * n, st[8] * n, st[9] * n);
    cols.vel.push(st[3], st[4], st[5]);
    cols.omega.push(st[10], st[11], st[12]);
    const L = F.lift, D = F.drag;
    cols.lift.push(R[0] * L[0] + R[1] * L[1] + R[2] * L[2], R[3] * L[0] + R[4] * L[1] + R[5] * L[2], R[6] * L[0] + R[7] * L[1] + R[8] * L[2]);
    cols.drag.push(R[0] * D[0] + R[1] * D[1] + R[2] * D[2], R[3] * D[0] + R[4] * D[1] + R[5] * D[2], R[6] * D[0] + R[7] * D[1] + R[8] * D[2]);
    cols.wind.push(W[0], W[1], W[2]);
    const ax = st[3] - W[0], ay = st[4] - W[1], az = st[5] - W[2];
    cols.speed.push(Math.sqrt(ax * ax + ay * ay + az * az));
    cols.alpha.push(F.wingAlpha / D2R);
    cols.stall.push(F.wingStall);
    // 機首の上下角・左右の傾き・向き
    const fy = R[3];
    cols.pitch.push(Math.asin(fy > 1 ? 1 : fy < -1 ? -1 : fy) / D2R);
    cols.bank.push(Math.atan2(-R[5], R[4]) / D2R);
    cols.heading.push(Math.atan2(R[6], R[0]) / D2R);
    const wx = st[10], wy = st[11], wz = st[12];
    const rot = 0.5 * (wx * (I[0] * wx + I[1] * wy + I[2] * wz) + wy * (I[3] * wx + I[4] * wy + I[5] * wz) + wz * (I[6] * wx + I[7] * wy + I[8] * wz));
    cols.energy.push(m * g * st[1] + 0.5 * m * (st[3] * st[3] + st[4] * st[4] + st[5] * st[5]) + rot);
  }

  // ---- 時間を進める ----
  let t = 0, step = 0;
  let endReason = 'timeout';
  let cPrev = clearance(s);
  record(s, 0);
  const prev = new Float64Array(13);
  const maxSteps = Math.ceil(maxTime / dt);
  const h2 = dt / 2, h6 = dt / 6;
  while (step < maxSteps) {
    prev.set(s);
    deriv(s, t, k1);
    for (let i = 0; i < 13; i++) tmp[i] = s[i] + h2 * k1[i];
    deriv(tmp, t + h2, k2);
    for (let i = 0; i < 13; i++) tmp[i] = s[i] + h2 * k2[i];
    deriv(tmp, t + h2, k3);
    for (let i = 0; i < 13; i++) tmp[i] = s[i] + dt * k3[i];
    deriv(tmp, t + dt, k4);
    for (let i = 0; i < 13; i++) s[i] += h6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    const qn = 1 / Math.sqrt(s[6] * s[6] + s[7] * s[7] + s[8] * s[8] + s[9] * s[9]);
    s[6] *= qn; s[7] *= qn; s[8] *= qn; s[9] *= qn;
    step++;
    const c = clearance(s);
    if (c <= 0) {
      // 着地：刻みの途中で地面に触れた瞬間まで戻す
      const f = cPrev > 0 ? cPrev / (cPrev - c) : 0;
      for (let i = 0; i < 13; i++) s[i] = prev[i] + f * (s[i] - prev[i]);
      const n2 = 1 / Math.sqrt(s[6] * s[6] + s[7] * s[7] + s[8] * s[8] + s[9] * s[9]);
      s[6] *= n2; s[7] *= n2; s[8] *= n2; s[9] *= n2;
      t = (step - 1) * dt + f * dt;
      endReason = 'ground';
      break;
    }
    cPrev = c;
    t = step * dt;
    if (!Number.isFinite(s[0] + s[1] + s[2] + s[10] + s[11] + s[12])) { endReason = 'error'; break; }
    if (s[0] * s[0] + s[2] * s[2] > PHYS.maxRange * PHYS.maxRange) { endReason = 'range'; break; }
    if (step % recEvery === 0) record(s, t);
  }
  if (cols.t[cols.t.length - 1] !== t && endReason !== 'error') record(s, t);

  const frames = { n: cols.t.length };
  for (const k in COLS) frames[k] = Float64Array.from(cols[k]);

  // ---- 結果の数字 ----
  const n = frames.n;
  const p = frames.pos;
  const x0 = p[0], y0 = p[1], z0 = p[2];
  const xl = p[3 * (n - 1)], yl = p[3 * (n - 1) + 1], zl = p[3 * (n - 1) + 2];
  let iMax = 0;
  for (let i = 1; i < n; i++) if (p[3 * i + 1] > p[3 * iMax + 1]) iMax = i;
  const maxHeight = p[3 * iMax + 1];
  const drop = maxHeight - yl;
  const run = Math.hypot(xl - p[3 * iMax], zl - p[3 * iMax + 2]);
  const result = {
    distance: Math.hypot(xl - x0, zl - z0), // 飛距離：投げた点の真下から着地点までの水平距離 [m]
    airtime: t, // 滞空時間 [s]
    maxHeight, // 最高の高さ [m]
    glideRatio: drop > 0.05 ? run / drop : null, // 滑空比：最高点から着地までに、1m下がる間に進んだ水平距離
    landing: [xl, yl, zl],
    launch: [x0, y0, z0],
    endReason, // 'ground' 着地 / 'timeout' 時間切れ / 'range' 遠くへ飛び去った
    steps: step,
  };
  return { setup, aircraft: ac, dt, frames, result };
}

/**
 * 記録から、時刻 time の状態を取り出す（コマの間はなめらかに補う）。
 * out: { pos[3], quat[4], vel[3], lift[3], drag[3], wind[3], speed, alpha, stall, pitch, bank, heading, t, index }
 */
export function sampleFlight(rec, time, out) {
  const fr = rec.frames;
  const n = fr.n;
  const tt = fr.t;
  let i;
  if (time <= 0) i = 0;
  else if (time >= tt[n - 1]) i = n - 2;
  else {
    // ほぼ等間隔なので、見当をつけてから前後に動かす
    const step = n > 1 ? tt[1] - tt[0] : 1;
    i = Math.min(n - 2, Math.max(0, Math.floor(time / step)));
    while (i > 0 && tt[i] > time) i--;
    while (i < n - 2 && tt[i + 1] <= time) i++;
  }
  if (n < 2) i = 0;
  const j = Math.min(n - 1, i + 1);
  const span = tt[j] - tt[i];
  let f = span > 0 ? (time - tt[i]) / span : 0;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const lerp3 = (arr, o) => {
    for (let k = 0; k < 3; k++) o[k] = arr[3 * i + k] + f * (arr[3 * j + k] - arr[3 * i + k]);
  };
  lerp3(fr.pos, out.pos); lerp3(fr.vel, out.vel); lerp3(fr.lift, out.lift); lerp3(fr.drag, out.drag); lerp3(fr.wind, out.wind);
  // 向きは最短の回り方で補う
  const q = fr.quat;
  let dot = 0;
  for (let k = 0; k < 4; k++) dot += q[4 * i + k] * q[4 * j + k];
  const sgn = dot < 0 ? -1 : 1;
  let nn = 0;
  for (let k = 0; k < 4; k++) {
    out.quat[k] = q[4 * i + k] + f * (sgn * q[4 * j + k] - q[4 * i + k]);
    nn += out.quat[k] * out.quat[k];
  }
  nn = 1 / Math.sqrt(nn);
  for (let k = 0; k < 4; k++) out.quat[k] *= nn;
  const l1 = (arr) => arr[i] + f * (arr[j] - arr[i]);
  out.speed = l1(fr.speed); out.alpha = l1(fr.alpha); out.stall = l1(fr.stall);
  out.pitch = l1(fr.pitch); out.bank = f < 0.5 ? fr.bank[i] : fr.bank[j]; out.heading = f < 0.5 ? fr.heading[i] : fr.heading[j];
  out.t = Math.min(Math.max(time, 0), tt[n - 1]);
  out.index = i;
  return out;
}

export function makeSample() {
  return {
    pos: [0, 0, 0], quat: [1, 0, 0, 0], vel: [0, 0, 0], lift: [0, 0, 0], drag: [0, 0, 0], wind: [0, 0, 0],
    speed: 0, alpha: 0, stall: 0, pitch: 0, bank: 0, heading: 0, t: 0, index: 0,
  };
}
