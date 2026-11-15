// ============================================================
// 飛行の記録を調べて、「どう飛んだか」の特徴を数える（一言解説は comment.js）。
// ============================================================
import { meanWindVector } from './wind.js';

const D2R = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/** 飛行の記録から、飛び方の特徴を数える */
export function computeStats(rec) {
  const fr = rec.frames, n = fr.n, setup = rec.setup;
  const t = fr.t, p = fr.pos, v = fr.vel, om = fr.omega;
  const dur = t[n - 1];

  let stallCount = 0, stalled = false, stallTime = 0;
  let cumPitch = 0, markUp = 0, markDown = 0, winStallT = 0, winT = 0;
  let loops = 0, tumbles = 0;
  let cumYaw = 0, spinYaw = 0, maxAbsYawRate = 0;
  let cumRoll = 0;
  let maxBank = 0, minPitch = Infinity, maxPitch = -Infinity;
  let speedSum = 0, pathLen = 0;
  let bankSum = 0, bankAbsLate = 0, lateT = 0;
  let trackPrev = null, trackCum = 0;
  let maxSpeed = 0;

  for (let i = 0; i < n; i++) {
    const dtI = i < n - 1 ? t[i + 1] - t[i] : 0;
    const st = fr.stall[i];
    if (!stalled && st > 0.6) { stalled = true; stallCount++; } else if (stalled && st < 0.3) stalled = false;
    if (st > 0.5) stallTime += dtI;
    // 機首の上下の回転を積み上げる（宙返り・後ろ向きの回転を数える）
    cumPitch += om[3 * i + 2] * dtI;
    winT += dtI;
    if (st > 0.5) winStallT += dtI;
    if (cumPitch - markUp >= TWO_PI) {
      if (winT > 0 && winStallT / winT < 0.5) loops++; else tumbles++;
      markUp += TWO_PI; markDown = Math.max(markDown, markUp - TWO_PI); winT = 0; winStallT = 0;
    } else if (cumPitch - markDown <= -TWO_PI) {
      if (winT > 0 && winStallT / winT < 0.5) loops++; else tumbles++;
      markDown -= TWO_PI; markUp = Math.min(markUp, markDown + TWO_PI); winT = 0; winStallT = 0;
    }
    // 左右の向きの回転
    const wy = om[3 * i + 1];
    cumYaw += wy * dtI;
    if (st > 0.5) spinYaw += wy * dtI;
    if (Math.abs(wy) > maxAbsYawRate) maxAbsYawRate = Math.abs(wy);
    cumRoll += om[3 * i] * dtI;
    const bank = fr.bank[i], pitch = fr.pitch[i];
    if (Math.abs(bank) > maxBank && Math.abs(pitch) < 60) maxBank = Math.abs(bank);
    if (pitch < minPitch) minPitch = pitch;
    if (pitch > maxPitch) maxPitch = pitch;
    speedSum += fr.speed[i] * dtI;
    if (fr.speed[i] > maxSpeed) maxSpeed = fr.speed[i];
    if (t[i] > dur * 0.6) { bankAbsLate += Math.abs(bank) * dtI; bankSum += bank * dtI; lateT += dtI; }
    if (i < n - 1) pathLen += Math.hypot(p[3 * i + 3] - p[3 * i], p[3 * i + 4] - p[3 * i + 1], p[3 * i + 5] - p[3 * i + 2]);
    // 進む向き（水平）の変化を積み上げる
    const hx = v[3 * i], hz = v[3 * i + 2];
    if (hx * hx + hz * hz > 0.25) {
      const tr = Math.atan2(hz, hx);
      if (trackPrev !== null) {
        let d = tr - trackPrev;
        if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
        trackCum += d;
      }
      trackPrev = tr;
    }
  }

  // 高さの波（山の数）。0.12m 以上の上下だけを数える
  let waves = 0;
  {
    const TH = 0.12;
    let dir = 0, hi = p[1], lo = p[1], ext = p[1];
    for (let i = 1; i < n; i++) {
      const y = p[3 * i + 1];
      if (dir === 0) {
        if (y > hi) hi = y;
        if (y < lo) lo = y;
        if (y - lo > TH) { dir = 1; ext = y; } else if (hi - y > TH) { dir = -1; ext = y; }
      } else if (dir === 1) {
        if (y > ext) ext = y;
        else if (ext - y > TH) { waves++; dir = -1; ext = y; }
      } else {
        if (y < ext) ext = y;
        else if (y - ext > TH) { dir = 1; ext = y; }
      }
    }
  }
  // 上昇気流の中にいた時間
  let liftTime = 0, maxUp = 0;
  for (let i = 0; i < n - 1; i++) {
    const wy = fr.wind[3 * i + 1];
    if (wy > 0.3) liftTime += t[i + 1] - t[i];
    if (wy > maxUp) maxUp = wy;
  }

  // 投げた向きを基準にした、前への距離と横へのずれ
  const ps = setup.throwHeading * D2R;
  const fx = Math.cos(ps), fz = Math.sin(ps);
  const dx = p[3 * (n - 1)] - p[0], dz = p[3 * (n - 1) + 2] - p[2];
  const downrange = dx * fx + dz * fz;
  const lateral = -dx * fz + dz * fx; // ＋が右
  // 風下へどれだけ流されたか（風の向きの成分）
  const [wxm, , wzm] = meanWindVector(setup);
  const wmag = Math.hypot(wxm, wzm);
  const windDrift = wmag > 0 ? (dx * wxm + dz * wzm) / wmag : 0;
  // 風の横成分（投げた向きに対して）による横ずれ
  const windCross = wmag > 0 ? -wxm * fz + wzm * fx : 0; // ＋なら右へ流す風

  // 着地の直前（最後の0.3秒）の降下の角度
  let iA = n - 1;
  while (iA > 0 && t[n - 1] - t[iA] < 0.3) iA--;
  const ddx = Math.hypot(p[3 * (n - 1)] - p[3 * iA], p[3 * (n - 1) + 2] - p[3 * iA + 2]);
  const ddy = p[3 * iA + 1] - p[3 * (n - 1) + 1];
  const finalDescentDeg = Math.atan2(ddy, ddx) / D2R;

  return {
    duration: dur,
    stallCount, stallTime, stallFraction: dur > 0 ? stallTime / dur : 0,
    loops, tumbles,
    waves,
    yawTurns: Math.abs(cumYaw) / TWO_PI,
    spinTurns: Math.abs(spinYaw) / TWO_PI,
    rollTurns: Math.abs(cumRoll) / TWO_PI,
    trackChangeDeg: trackCum / D2R, // 進む向きが合計でどれだけ変わったか（＋が右回り）
    maxBank,
    lateBankAbs: lateT > 0 ? bankAbsLate / lateT : 0,
    lateBank: lateT > 0 ? bankSum / lateT : 0,
    minPitch, maxPitch,
    impactPitch: fr.pitch[n - 1],
    impactSpeed: fr.speed[n - 1],
    finalDescentDeg,
    avgSpeed: dur > 0 ? speedSum / dur : 0,
    maxSpeed,
    pathLength: pathLen,
    downrange, lateral, windDrift, windCross,
    liftTime, maxUp,
    launchAirspeed: fr.speed[0],
  };
}
