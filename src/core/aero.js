// ============================================================
// 空気力の計算。機体を「小さな平板の集まり」とみなし、
// 1枚ごとに、その場所の空気の当たり方（速さと角度）から揚力と抗力を求めて合計する。
// 「失速」「急降下」「上反角の復元」などは、この計算の結果として起きる（特別扱いなし）。
// ============================================================
import { PHYS, AERO } from './config.js';

const RHO = PHYS.rho;
const CD90 = AERO.cd90;

/** 失速の進み具合 0（付着流）〜1（完全に剥がれた流れ） */
function stallBlend(absAlpha, stall, width) {
  const x = (absAlpha - stall) / width;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/**
 * 機体にかかる空気力と、重心まわりのモーメントを求める（すべて機体座標）。
 * @param ac     buildAircraft() の機体
 * @param vbx..  空気に対する重心の速度（機体座標）[m/s]
 * @param wx..   角速度（機体座標）[rad/s]
 * @param out    結果を書き込むオブジェクト
 *   F[3] 力, M[3] モーメント, lift[3] 揚力の合計, drag[3] 抗力の合計,
 *   wingAlpha 主翼の迎角の平均 [rad], wingStall 主翼の失速の割合 0〜1, eps 吹き下ろし角 [rad]
 */
export function aeroForces(ac, vbx, vby, vbz, wx, wy, wz, out) {
  const els = ac.elements;
  const nWing = ac.nWing;
  let Fx = 0, Fy = 0, Fz = 0, Mx = 0, My = 0, Mz = 0;
  let Lx = 0, Ly = 0, Lz = 0, Dx = 0, Dy = 0, Dz = 0;
  let wingLift = 0, wingAlphaSum = 0, wingStallSum = 0;
  let eps = 0;
  const V2inf = vbx * vbx + vby * vby + vbz * vbz;

  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (i === nWing) {
      // 主翼の揚力から、尾翼の位置での吹き下ろし角を決める
      if (V2inf > 0.09) {
        const CLw = wingLift / (0.5 * RHO * V2inf * ac.wingArea);
        eps = (AERO.downwash * CLw) / (Math.PI * ac.wingAR);
        if (eps > AERO.maxDownwashRad) eps = AERO.maxDownwashRad;
        else if (eps < -AERO.maxDownwashRad) eps = -AERO.maxDownwashRad;
      }
    }
    // --- 1) 1/4翼弦点での空気の当たり方から、力のかかる位置（圧力中心）を決める ---
    let rx = e.rx, ry = e.ry, rz = e.rz;
    let vx = vbx + (wy * rz - wz * ry);
    let vy = vby + (wz * rx - wx * rz);
    let vz = vbz + (wx * ry - wy * rx);
    let u = vx * e.cx + vy * e.cy + vz * e.cz; // 翼弦方向の速さ（＋が前進）
    let w = -(vx * e.nx + vy * e.ny + vz * e.nz); // 面に下から当たる速さ
    let alpha = Math.atan2(w, u < 0 ? -u : u);
    const epsHere = e.downwash && u > 0 ? eps : 0;
    let shift;
    if (e.slender) {
      // 細長い胴体：角度に比例する力は前寄り（1/4）、横風の抗力は面積の中心にかかる
      const sa = Math.sin(alpha), ca = Math.cos(alpha);
      const pot = Math.abs(e.a * sa * ca), cross = CD90 * sa * sa;
      const frac = pot + cross > 1e-12 ? (0.25 * pot + e.centroidFrac * cross) / (pot + cross) : 0.25;
      shift = (u >= 0 ? frac - 0.25 : 0.75 - frac) * e.chord;
    } else {
      const a0 = alpha - epsHere;
      const sig0 = stallBlend(a0 < 0 ? -a0 : a0, e.stall, e.stallW);
      // 付着流では前縁から1/4、完全に剥がれると真ん中（1/2）。後ろ向きに進むときは後縁側から数える
      shift = (u >= 0 ? 0.25 * sig0 : 0.5 - 0.25 * sig0) * e.chord;
    }
    if (shift !== 0) {
      rx -= e.cx * shift; ry -= e.cy * shift; rz -= e.cz * shift;
      vx = vbx + (wy * rz - wz * ry);
      vy = vby + (wz * rx - wx * rz);
      vz = vbz + (wx * ry - wy * rx);
      u = vx * e.cx + vy * e.cy + vz * e.cz;
      w = -(vx * e.nx + vy * e.ny + vz * e.nz);
    }
    // --- 2) 圧力中心での速度から力を求める（力の向きはこの速度に対して決めるので、空気力は必ずエネルギーを奪う側に働く）---
    const Vp2 = u * u + w * w;
    const Vfull2 = vx * vx + vy * vy + vz * vz;
    if (Vfull2 < 1e-10) continue;
    const Vp = Math.sqrt(Vp2);
    const au = u < 0 ? -u : u;
    alpha = Math.atan2(w, au);
    const aEff = alpha - (e.downwash && u > 0 ? eps : 0);
    const sa = Math.sin(aEff), ca = Math.cos(aEff);
    let CL, CDl, sig;
    if (e.slender) {
      const CN = e.a * sa * ca + CD90 * sa * (sa < 0 ? -sa : sa);
      CL = CN * ca;
      CDl = CN * sa;
      sig = 0;
    } else {
      sig = stallBlend(aEff < 0 ? -aEff : aEff, e.stall, e.stallW);
      const clLin = e.a * aEff;
      CL = (1 - sig) * clLin + sig * CD90 * sa * ca;
      CDl = (1 - sig) * e.k * clLin * clLin + sig * CD90 * sa * sa;
    }
    const qS = 0.5 * RHO * Vp2 * e.area;
    let fx = 0, fy = 0, fz = 0;
    if (Vp > 1e-6) {
      const su = u >= 0 ? 1 : -1;
      const Lmag = qS * CL, Dmag = qS * CDl;
      // 揚力の向き：流れに直角で面の表側、抗力の向き：流れと逆
      const lc = (su * w) / Vp, ln = au / Vp;
      const dc = -u / Vp, dn = w / Vp;
      const lfx = Lmag * (lc * e.cx + ln * e.nx), lfy = Lmag * (lc * e.cy + ln * e.ny), lfz = Lmag * (lc * e.cz + ln * e.nz);
      const dfx = Dmag * (dc * e.cx + dn * e.nx), dfy = Dmag * (dc * e.cy + dn * e.ny), dfz = Dmag * (dc * e.cz + dn * e.nz);
      fx = lfx + dfx; fy = lfy + dfy; fz = lfz + dfz;
      Lx += lfx; Ly += lfy; Lz += lfz;
      Dx += dfx; Dy += dfy; Dz += dfz;
      if (i < nWing) {
        wingLift += Lmag;
        wingAlphaSum += alpha * e.area;
        wingStallSum += sig * e.area;
      }
    }
    // 摩擦・形の抵抗（翼幅方向の流れも含めた全速度に対して働く）
    const Vfull = Math.sqrt(Vfull2);
    const pk = 0.5 * RHO * Vfull * e.area * e.cd0;
    const pfx = -pk * vx, pfy = -pk * vy, pfz = -pk * vz;
    fx += pfx; fy += pfy; fz += pfz;
    Dx += pfx; Dy += pfy; Dz += pfz;

    Fx += fx; Fy += fy; Fz += fz;
    Mx += ry * fz - rz * fy;
    My += rz * fx - rx * fz;
    Mz += rx * fy - ry * fx;
    // 翼弦まわりの回転を弱めるモーメント
    const ws = wx * e.sx + wy * e.sy + wz * e.sz;
    const dm = -e.damp * Vp * ws;
    Mx += dm * e.sx; My += dm * e.sy; Mz += dm * e.sz;
  }
  out.F[0] = Fx; out.F[1] = Fy; out.F[2] = Fz;
  out.M[0] = Mx; out.M[1] = My; out.M[2] = Mz;
  out.lift[0] = Lx; out.lift[1] = Ly; out.lift[2] = Lz;
  out.drag[0] = Dx; out.drag[1] = Dy; out.drag[2] = Dz;
  out.wingAlpha = wingAlphaSum / (ac.wingArea);
  out.wingStall = wingStallSum / (ac.wingArea);
  out.eps = eps;
  return out;
}

export function makeAeroOut() {
  return { F: [0, 0, 0], M: [0, 0, 0], lift: [0, 0, 0], drag: [0, 0, 0], wingAlpha: 0, wingStall: 0, eps: 0 };
}

/**
 * 設計そのものの性質を調べる（飛ばさずに分かること）。
 * - 中立点（ここより重心が後ろだと、機首の上下が不安定になる点）と静安定余裕
 * - 釣り合う迎角・速さ・そのときの滑空比
 * - 左右の向きの安定（風見鶏の効き）、上反角の効き
 */
export function analyzeDesign(ac) {
  if (ac.info) return ac.info;
  const out = makeAeroOut();
  const V = 4;
  const q = 0.5 * RHO * V * V;
  const S = ac.wingArea;
  const at = (alpha, beta = 0) => {
    // 迎角 alpha：空気が下から当たる → 機体座標での速度は (cos, -sin) 方向
    const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
    aeroForces(ac, V * ca * cb, -V * sa * cb, V * sb, 0, 0, 0, out);
    // 風軸の揚力・抗力
    const lift = out.F[1] * ca + out.F[0] * sa;
    const drag = -out.F[0] * ca + out.F[1] * sa;
    return { lift, drag, Fy: out.F[1], Mz: out.M[2], My: out.M[1], Mx: out.M[0], Fz: out.F[2] };
  };
  const d = 0.5 * Math.PI / 180;
  // 中立点：迎角を少し変えたときの (モーメントの変化)/(法線力の変化)
  const p0 = at(2 * d), m0 = at(-2 * d);
  const dM = p0.Mz - m0.Mz, dN = p0.Fy - m0.Fy;
  const xNpRel = dN !== 0 ? dM / dN : 0; // 重心から見た中立点の位置（＋が前）
  const staticMargin = -xNpRel / ac.mac; // ＋なら安定（中立点が重心より後ろ）
  // 釣り合う迎角（-4°〜+30°で、モーメントが＋から－へ変わる点）
  let trimAlpha = null;
  let prev = at(-4 * 2 * d);
  for (let deg = -3.5; deg <= 30; deg += 0.5) {
    const cur = at(deg * 2 * d);
    if (prev.Mz > 0 && cur.Mz <= 0) {
      const f = prev.Mz / (prev.Mz - cur.Mz);
      trimAlpha = (deg - 0.5 + 0.5 * f) * 2 * d;
      break;
    }
    prev = cur;
  }
  let trimCL = null, trimSpeed = null, trimGlide = null;
  if (trimAlpha !== null) {
    const t = at(trimAlpha);
    trimCL = t.lift / (q * S);
    if (trimCL > 0.02) {
      trimSpeed = Math.sqrt((2 * ac.mass * PHYS.g) / (RHO * S * trimCL));
      trimGlide = t.lift / t.drag;
    }
  }
  // 左右の向きの安定：右から風（beta>0）を受けたとき、機首を右へ向ける（y軸まわりに負）なら安定
  const a0 = trimAlpha !== null ? trimAlpha : 4 * 2 * d;
  const bp = at(a0, 4 * d), bm = at(a0, -4 * d);
  const yawStability = -(bp.My - bm.My) / (8 * d) / (q * S * (ac.setup.wingSpan / 100));
  // 上反角の効き：右から風を受けたとき、左へ傾く（x軸まわりに負）なら復元力あり
  const rollStability = -(bp.Mx - bm.Mx) / (8 * d) / (q * S * (ac.setup.wingSpan / 100));
  const cgFromNose = -ac.cg[0];
  ac.info = {
    mass: ac.mass,
    cgFromNose,
    neutralFromNose: cgFromNose - xNpRel,
    staticMargin,
    trimAlphaDeg: trimAlpha !== null ? trimAlpha / (Math.PI / 180) : null,
    trimCL, trimSpeed, trimGlide,
    yawStability, rollStability,
    wingLoading: (ac.mass * PHYS.g) / S,
    aspectRatio: ac.wingAR,
  };
  return ac.info;
}
