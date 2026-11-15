// ============================================================
// 風・揺らぎ・上昇気流・地面の高さ。乱数の種は固定なので、同じ条件なら毎回同じ風になる。
// ============================================================
import { PHYS, ENV } from './config.js';

const D2R = Math.PI / 180;

/** 種を決めると毎回同じ並びを返す乱数（mulberry32） */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 地面の高さ [m]。半径 ENV.flatRadius の内側は平ら、その外はゆるやかな丘。 */
export function groundHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const R = ENV.flatRadius;
  if (r <= R) return 0;
  const u = Math.min(1, (r - R) / 260);
  const rise = u * u * (3 - 2 * u);
  const h =
    26 +
    16 * Math.sin(x * 0.0061 + 1.3) * Math.cos(z * 0.0053 - 0.4) +
    9 * Math.sin(x * 0.0127 - z * 0.0101 + 2.1) +
    5 * Math.cos(x * 0.021 + z * 0.017);
  return rise * Math.max(0, h);
}

/** 平均の風ベクトル（基準の高さでの値）。windDir は「吹いてくる向き」：0°=正面、90°=右 */
export function meanWindVector(setup) {
  const U = setup.windSpeed;
  const d = setup.windDir * D2R;
  return [-U * Math.cos(d), 0, -U * Math.sin(d)];
}

/**
 * 風の場を作る。返り値 wind(x, y, z, t, out) は、その場所・時刻の空気の速度を out[0..2] に書く。
 * 風も上昇気流もないときは null（静かな空気）。
 */
export function makeWind(setup) {
  const U = setup.windSpeed;
  const updraft = !!setup.updraft;
  if (!(U > 0) && !updraft) return null;
  const [mx, , mz] = meanWindVector(setup);

  // 揺らぎ：いくつかの波の重ね合わせ。波の向き・位相は固定の種から決める
  const rng = makeRng(PHYS.seed);
  const waves = [];
  const lengths = [31, 17, 9.5, 5.2, 2.9];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < lengths.length; i++) {
      const lam = lengths[i];
      const th = rng() * Math.PI * 2;
      const el = (rng() - 0.5) * 0.8;
      const k = (2 * Math.PI) / lam;
      waves.push({
        c,
        kx: k * Math.cos(th) * Math.cos(el),
        ky: k * Math.sin(el),
        kz: k * Math.sin(th) * Math.cos(el),
        ph: rng() * Math.PI * 2,
        amp: Math.pow(lam / lengths[0], 1 / 3),
      });
    }
  }
  // 振幅を「合計の標準偏差 = 1」にそろえる
  for (let c = 0; c < 3; c++) {
    let s2 = 0;
    for (const w of waves) if (w.c === c) s2 += 0.5 * w.amp * w.amp;
    const n = 1 / Math.sqrt(s2);
    for (const w of waves) if (w.c === c) w.amp *= n;
  }
  const gust = ENV.gustIntensity * U;
  const thermals = updraft ? ENV.thermals : [];

  return function wind(x, y, z, t, out) {
    let wx = 0, wy = 0, wz = 0;
    if (U > 0) {
      const h = y < 0.1 ? 0.1 : y;
      let shear = Math.pow(h / ENV.windRefHeight, ENV.windShearExp);
      if (shear > 1.3) shear = 1.3;
      wx = mx * shear;
      wz = mz * shear;
      // 揺らぎは平均の風に乗って流れる
      const ax = x - mx * t, az = z - mz * t;
      let g0 = 0, g1 = 0, g2 = 0;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const v = w.amp * Math.sin(w.kx * ax + w.ky * y + w.kz * az + w.ph);
        if (w.c === 0) g0 += v; else if (w.c === 1) g1 += v; else g2 += v;
      }
      // 地面のすぐ上では上下の揺らぎは小さくなる
      const vdamp = h < 1 ? h : 1;
      wx += gust * g0 * shear;
      wy += gust * 0.6 * g1 * vdamp;
      wz += gust * g2 * shear;
    }
    for (let i = 0; i < thermals.length; i++) {
      const th = thermals[i];
      const dx = x - th.x, dz = z - th.z;
      const r2 = (dx * dx + dz * dz) / (th.r * th.r);
      if (r2 < 9) {
        let hf = y / ENV.thermalFullHeight;
        if (hf > 1) hf = 1; else if (hf < 0) hf = 0;
        wy += th.w * Math.exp(-r2) * hf;
      }
    }
    out[0] = wx; out[1] = wy; out[2] = wz;
    return out;
  };
}
