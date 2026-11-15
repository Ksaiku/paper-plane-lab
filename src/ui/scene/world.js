// 3Dの世界（背景）：空・光と影・草原・草むら・距離の目盛り・投げ台・木と丘・雲。
// 単位は m。x＝前（投げる正面）、y＝上、z＝右。原点は投げ台の足もとの地面。
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundHeight, makeRng } from '../../core/wind.js';
import { ENV } from '../../core/config.js';
import { makeTextTexture } from './label.js';

const D2R = Math.PI / 180;
const col = (hex) => new THREE.Color(hex);

// ---- 見た目の基本設定 ----
const SKY = { zenith: '#2c7ad6', mid: '#5fa6e6', horizon: '#cfe5f4', sunHaze: '#fff1d6', sunCol: '#fff0d2' };
const SUN_DIR = new THREE.Vector3(0.38, 0.70, -0.60).normalize(); // 左の斜め上から
const FOG_DENSITY = 0.00105; // 100mで約1%、400mで約17%、1000mで約70%
const SHADOW_HALF = 7;       // 影の箱の半分 [m]
const SHADOW_SIZE = 2048;

// 草むら
const GRASS_CELL = 0.18, GRASS_GRID = 110, GRASS_RADIUS = 9.5;
const FLOWER_CELL = 1.05, FLOWER_GRID = 26;

// ============================================================
// GLSL の共通部品（ノイズ。地面と草で同じ色むらを使う → つなぎ目が見えない）
// ============================================================
const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
vec3 macroTint(vec2 p){
  float n = fbm(p * 0.011);
  float m = fbm(p * 0.055 + 5.0);
  vec3 lush = vec3(0.90, 1.04, 0.84);
  vec3 dry  = vec3(1.28, 1.10, 0.60);
  vec3 t = mix(lush, dry, smoothstep(0.52, 0.74, n));
  return t * (0.86 + 0.28 * m);
}
`;

// ============================================================
// キャンバスで作るテクスチャ
// ============================================================
function wrapDraw(S, x, y, r, fn) {
  const xs = [0], ys = [0];
  if (x - r < 0) xs.push(S); else if (x + r > S) xs.push(-S);
  if (y - r < 0) ys.push(S); else if (y + r > S) ys.push(-S);
  for (const dx of xs) for (const dy of ys) fn(x + dx, y + dy);
}

/** 継ぎ目のない草の地面テクスチャ（1枚で約 5m 四方に貼る） */
function makeGrassTexture() {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(2024);
  g.fillStyle = '#5a7b2c'; g.fillRect(0, 0, S, S);
  const blob = (n, rmin, rmax, colors, amin, amax) => {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = rmin + rng() * (rmax - rmin);
      const cl = colors[(rng() * colors.length) | 0], a = amin + rng() * (amax - amin);
      wrapDraw(S, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(${cl},${a})`); gr.addColorStop(1, `rgba(${cl},0)`);
        g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
  };
  blob(70, 90, 220, ['70,100,34', '104,130,46', '58,86,28', '130,142,60'], 0.16, 0.30);
  blob(260, 30, 90, ['52,80,26', '112,134,50', '86,112,38', '138,150,66', '40,62,20'], 0.14, 0.28);
  // 細かい葉の筋
  const strokes = (n, cols, alpha, lmin, lmax, wid) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, a = (-0.5 + rng()) * 1.6 - Math.PI / 2, l = lmin + rng() * (lmax - lmin);
      const cl = cols[(rng() * cols.length) | 0];
      g.strokeStyle = `rgba(${cl},${alpha * (0.5 + rng() * 0.7)})`; g.lineWidth = wid * (0.7 + rng() * 0.6);
      wrapDraw(S, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
    }
  };
  strokes(7000, ['28,50,16', '38,64,20'], 0.6, 6, 16, 1.6);   // 影の葉
  strokes(12000, ['104,138,46', '128,156,58', '156,172,76'], 0.5, 6, 16, 1.4); // 明るい葉
  strokes(1500, ['170,185,80', '196,190,96'], 0.4, 6, 12, 1.3);   // 枯れ草
  strokes(900, ['30,40,16'], 0.5, 3, 8, 2.2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  // 平均色（遠くでは細部を消してこの色にする）
  const m = document.createElement('canvas'); m.width = m.height = 1;
  const mg = m.getContext('2d'); mg.drawImage(c, 0, 0, 1, 1);
  const d = mg.getImageData(0, 0, 1, 1).data;
  const mean = new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
  return { texture: t, mean };
}

/** 雲1枚分の絵（やわらかい積雲。底は平ら） */
function makeCloudTexture(seed) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  const puffs = [];
  const N = 44;
  for (let i = 0; i < N; i++) {
    const t = rng();
    const dome = Math.sin(t * Math.PI);
    const r = 14 + rng() * 22 + dome * 26;
    puffs.push({ x: W * (0.12 + 0.76 * t), y: H * 0.70 - dome * H * 0.30 * (0.35 + rng() * 0.8) - rng() * 10, r });
  }
  const draw = (p, dx, dy, rs, stops) => {
    const r = p.r * rs, x = p.x + dx, y = p.y + dy;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, cl] of stops) gr.addColorStop(o, cl);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const p of puffs) draw(p, 0, p.r * 0.30, 1.05, [[0, 'rgba(120,145,185,0.75)'], [0.6, 'rgba(135,158,196,0.45)'], [1, 'rgba(140,162,200,0)']]);
  for (const p of puffs) draw(p, -p.r * 0.05, -p.r * 0.04, 1.0, [[0, 'rgba(252,252,254,1)'], [0.6, 'rgba(246,249,253,0.8)'], [1, 'rgba(240,244,252,0)']]);
  for (const p of puffs) draw(p, -p.r * 0.18, -p.r * 0.26, 0.62, [[0, 'rgba(255,253,248,0.85)'], [1, 'rgba(255,253,248,0)']]);
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, 0, H);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.60, 'rgba(0,0,0,1)'); m.addColorStop(0.80, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 投げ台の足もとの、踏み固めた土 */
function makeDirtTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = makeRng(99);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(112,92,64,1)'); gr.addColorStop(0.62, 'rgba(108,92,62,0.96)'); gr.addColorStop(1, 'rgba(100,96,56,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const a = rng() * 6.283, r = Math.sqrt(rng()) * S * 0.46;
    const v = 70 + rng() * 70;
    g.fillStyle = `rgba(${v + 10},${v},${v - 30},${0.25 + rng() * 0.3})`;
    g.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1.5 + rng() * 3, 1.5 + rng() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ============================================================
// 木材の部材（角材）をまとめて1つの形にする
// ============================================================
function newBuf() { return { p: [], n: [], c: [] }; }

function addQuad(b, v0, v1, v2, v3, n, color) {
  // 外向きになるよう、巻き順を確かめる
  const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
  const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
  const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
  const flip = fx * n[0] + fy * n[1] + fz * n[2] < 0;
  const order = flip ? [v0, v3, v2, v0, v2, v1] : [v0, v1, v2, v0, v2, v3];
  for (const v of order) {
    b.p.push(v[0], v[1], v[2]); b.n.push(n[0], n[1], n[2]);
    // 地面に近いほど少し暗く（接地の陰）。下向きの面も少し暗く
    const ao = (0.70 + 0.30 * Math.min(1, Math.max(0, v[1] / 1.2))) * (n[1] < -0.5 ? 0.78 : 1);
    b.c.push(color.r * ao, color.g * ao, color.b * ao);
  }
}

/** 点 a→b を結ぶ、断面 w×h の角材 */
function addBeam(b, ax, ay, az, bx, by, bz, w, h, color) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dy, dz) || 1e-6;
  const d = [dx / L, dy / L, dz / L];
  const u = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let s = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const sl = Math.hypot(s[0], s[1], s[2]); s = [s[0] / sl, s[1] / sl, s[2] / sl];
  const up = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]];
  const sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const off = sg.map(([sx, sy]) => [s[0] * sx * w / 2 + up[0] * sy * h / 2, s[1] * sx * w / 2 + up[1] * sy * h / 2, s[2] * sx * w / 2 + up[2] * sy * h / 2]);
  const A = off.map((o) => [ax + o[0], ay + o[1], az + o[2]]);
  const B = off.map((o) => [bx + o[0], by + o[1], bz + o[2]]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    let n = [off[i][0] + off[j][0], off[i][1] + off[j][1], off[i][2] + off[j][2]];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
    addQuad(b, A[i], A[j], B[j], B[i], n, color);
  }
  addQuad(b, A[0], A[1], A[2], A[3], [-d[0], -d[1], -d[2]], color);
  addQuad(b, B[0], B[1], B[2], B[3], d, color);
}

function bufToGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  g.computeBoundingSphere();
  return g;
}

const WOOD = {
  leg: col('#6a4a2c'), beam: col('#85603a'), brace: col('#7a5733'), joist: col('#6f4f31'),
  plank: col('#b3875a'), ladder: col('#b99467'), stone: col('#a39d8e'), rail: col('#dcd5c4'), railDark: col('#a89a80'),
};
const vary = (c, rng, amt = 0.14) => { const k = 1 - amt / 2 + rng() * amt; return new THREE.Color(c.r * k, c.g * k, c.b * k); };

/** 投げ台の櫓。てっぺんの床の上面が y = throwHeight − 0.25 */
function buildTowerGeometry(H) {
  const b = newBuf();
  const rng = makeRng(1000 + Math.round(H * 10));
  const Hs = Math.max(0.2, H - 0.25);          // 床の上面の高さ
  const yTop = Hs - 0.04;                       // 脚の上端（床板の下）
  const tB = -0.80, tF = 0.26, tZ = 0.36;      // 上端の四角（x後ろ, x前, z半幅）
  const tall = Hs >= 0.7;
  const bExt = tall ? Math.min(2.4, 0.14 * Hs) : 0;    // 後ろ脚は後ろへ広げる（前＝飛行の進路はあけておく）
  const fExt = tall ? Math.min(0.12, 0.010 * Hs) : 0;
  const sExt = tall ? Math.min(0.75, 0.05 * Hs) : 0;
  const legW = Hs < 0.7 ? 0.05 : Hs < 6 ? 0.075 : 0.095;
  // t=0（地面）〜1（上端）での4隅
  const corner = (ix, iz, t) => [
    ix ? tF + fExt * (1 - t) : tB - bExt * (1 - t),
    t * yTop,
    iz * (tZ + sExt * (1 - t)),
  ];
  const C = (ix, iz, t) => corner(ix, iz, t);

  // 脚
  for (const ix of [0, 1]) for (const iz of [-1, 1]) {
    const a = C(ix, iz, 0), z = C(ix, iz, 1);
    addBeam(b, a[0], a[1], a[2], z[0], z[1], z[2], legW, legW, vary(WOOD.leg, rng));
    // 足もとの石
    if (tall) addBeam(b, a[0], -0.05, a[2], a[0], 0.12, a[2], 0.15, 0.15, vary(WOOD.stone, rng, 0.2));
  }
  const nSeg = Hs < 0.9 ? 0 : Math.max(1, Math.round(Hs / 1.6));
  const ring = (t, w, color) => {
    const y = t * yTop;
    const p = [C(0, -1, t), C(1, -1, t), C(1, 1, t), C(0, 1, t)];
    for (let i = 0; i < 4; i++) { const a = p[i], z = p[(i + 1) % 4]; addBeam(b, a[0], a[1], a[2], z[0], z[1], z[2], w, w, vary(color, rng)); }
    return y;
  };
  if (nSeg === 0) {
    ring(Hs < 0.5 ? 0.45 : 0.4, 0.03, WOOD.brace);
  } else {
    for (let k = 1; k < nSeg; k++) ring(k / nSeg, 0.05, WOOD.beam);
    ring(0.0, 0.06, WOOD.beam); // 地面すれすれの土台
    // X字の筋交い
    const faces = [[[0, -1], [0, 1]], [[1, -1], [1, 1]], [[0, -1], [1, -1]], [[0, 1], [1, 1]]];
    for (let k = 0; k < nSeg; k++) {
      const t0 = k / nSeg, t1 = (k + 1) / nSeg;
      for (const [fa, fb] of faces) {
        const a0 = C(fa[0], fa[1], t0), b0 = C(fb[0], fb[1], t0), a1 = C(fa[0], fa[1], t1), b1 = C(fb[0], fb[1], t1);
        addBeam(b, a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], 0.032, 0.032, vary(WOOD.brace, rng));
        addBeam(b, b0[0], b0[1], b0[2], a1[0], a1[1], a1[2], 0.032, 0.032, vary(WOOD.brace, rng));
      }
    }
  }
  // 床の根太（x方向）と前後の受け材
  const xb0 = tB - 0.05, xf0 = tF + 0.05;
  for (const z of [-0.33, 0, 0.33]) addBeam(b, xb0, Hs - 0.075, z, xf0, Hs - 0.075, z, 0.05, 0.06, vary(WOOD.joist, rng));
  for (const x of [tB - 0.02, tF + 0.02]) addBeam(b, x, Hs - 0.075, -tZ - 0.02, x, Hs - 0.075, tZ + 0.02, 0.06, 0.07, vary(WOOD.beam, rng));
  // 床板（z方向に渡す）
  const nPl = 10, plW = (xf0 - xb0 + 0.02) / nPl;
  for (let i = 0; i < nPl; i++) {
    const x = xb0 - 0.01 + plW * (i + 0.5);
    addBeam(b, x, Hs - 0.02, -tZ - 0.045, x, Hs - 0.02, tZ + 0.045, plW - 0.008, 0.04, vary(WOOD.plank, rng, 0.18));
  }
  // はしご（左側面）
  if (Hs >= 0.9) {
    const lz = (t) => -(tZ + sExt * (1 - t)) - 0.05;
    const lx = (t, u) => { const xb = tB - bExt * (1 - t), xf = tF + fExt * (1 - t); return xb + (xf - xb) * u; };
    for (const u of [0.3, 0.7]) {
      const a = [lx(0, u), 0.0, lz(0)], z = [lx(1, u), yTop, lz(1)];
      addBeam(b, a[0], a[1], a[2], z[0], z[1], z[2], 0.04, 0.03, vary(WOOD.ladder, rng, 0.1));
      addBeam(b, z[0], z[1], z[2], z[0], Hs + 0.38, z[2], 0.04, 0.03, vary(WOOD.ladder, rng, 0.1)); // 床の上へ出る手すり
    }
    const nR = Math.max(2, Math.floor((yTop - 0.2) / 0.3));
    for (let i = 0; i <= nR; i++) {
      const t = (0.2 + (yTop - 0.2) * (i / nR)) / yTop;
      addBeam(b, lx(t, 0.3), t * yTop, lz(t), lx(t, 0.7), t * yTop, lz(t), 0.03, 0.03, vary(WOOD.ladder, rng, 0.1));
    }
  }
  return bufToGeometry(b);
}

/** 発射レール（x＝向いている方向、原点＝機体の位置）。床の上面は y = −0.25 */
function buildRailGeometry() {
  const b = newBuf();
  const c = col('#8a7a62'), d = col('#6f6150');
  addBeam(b, -0.175, -0.0675, 0, 0.175, -0.0675, 0, 0.015, 0.015, c);        // 上面 y = −0.06
  addBeam(b, -0.15, -0.25, 0, -0.15, -0.075, 0, 0.015, 0.015, d);            // 後ろの支柱
  addBeam(b, 0.15, -0.25, 0, 0.15, -0.075, 0, 0.015, 0.015, d);              // 前の支柱
  return bufToGeometry(b);
}

// ============================================================
// 草・花の形
// ============================================================
function makeTuftGeometry() {
  const rng = makeRng(77);
  const cBase = col('#1f3410'), cMid = col('#487620'), cTip = col('#a3b84a');
  const pos = [], colr = [], nor = [];
  const push = (p, c) => { pos.push(p[0], p[1], p[2]); colr.push(c.r, c.g, c.b); nor.push(0, 1, 0); };
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const ang = (i / blades + (rng() - 0.5) * 0.25) * Math.PI * 2;
    const rad = 0.02 + rng() * 0.06;
    const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
    const h = 0.045 + rng() * 0.04, w = 0.0055 + rng() * 0.003, lean = 0.012 + rng() * 0.03;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const j = (rng() - 0.5) * 0.7;
    const tx = -dz * Math.cos(j) + dx * Math.sin(j), tz = dx * Math.cos(j) + dz * Math.sin(j);
    const tint = 0.85 + rng() * 0.3;
    const c0 = cBase.clone(), c1 = cMid.clone().multiplyScalar(tint), c2 = cTip.clone().multiplyScalar(tint);
    const P = [
      [bx - tx * w, 0, bz - tz * w], [bx + tx * w, 0, bz + tz * w],
      [bx + dx * lean * 0.28 - tx * w * 0.72, h * 0.5, bz + dz * lean * 0.28 - tz * w * 0.72],
      [bx + dx * lean * 0.28 + tx * w * 0.72, h * 0.5, bz + dz * lean * 0.28 + tz * w * 0.72],
      [bx + dx * lean, h, bz + dz * lean],
    ];
    push(P[0], c0); push(P[1], c0); push(P[2], c1);
    push(P[1], c0); push(P[3], c1); push(P[2], c1);
    push(P[2], c1); push(P[3], c1); push(P[4], c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function makeFlowerGeometry() {
  const pos = [], colr = [], nor = [];
  const push = (p, c) => { pos.push(p[0], p[1], p[2]); colr.push(c.r, c.g, c.b); nor.push(0, 1, 0); };
  const stem = col('#3b6b1c'), petal = new THREE.Color(1, 1, 1), center = col('#e8a00c');
  const h = 0.13, w = 0.0025;
  // 茎（十字の細い板）
  for (const a of [0, Math.PI / 2]) {
    const tx = Math.cos(a) * w, tz = Math.sin(a) * w;
    push([-tx, 0, -tz], stem); push([tx, 0, tz], stem); push([-tx * 0.7, h, -tz * 0.7], stem);
    push([tx, 0, tz], stem); push([tx * 0.7, h, tz * 0.7], stem); push([-tx * 0.7, h, -tz * 0.7], stem);
  }
  // 花びら：やや横向きに傾けた円盤（横からも見える）
  const tilt = 0.9; // 水平からの傾き
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const hp = (r, a) => [Math.cos(a) * r * ct, h + Math.cos(a) * r * st * 0 + Math.sin(a) * r * st, Math.sin(a) * r * 0 + Math.cos(a) * r * 0 + 0].map((v, i) => v);
  // 局所座標：円盤の平面 (u,v)、法線は (0,ct,-st) 側へ傾く
  const P = (r, a) => {
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    return [u, h + v * ct, v * st * -1 * -1 + 0].map((x, i) => x); // x=u, y=h+v*ct, z=v*st
  };
  const nP = 7;
  for (let i = 0; i < nP; i++) {
    const a0 = (i / nP) * Math.PI * 2, a1 = ((i + 0.5) / nP) * Math.PI * 2, a2 = ((i + 1) / nP) * Math.PI * 2;
    const c = [0, h, 0];
    const p0 = P(0.007, a0), p1 = P(0.018, a1), p2 = P(0.007, a2);
    push(c, petal); push(p0, petal); push(p1, petal);
    push(c, petal); push(p1, petal); push(p2, petal);
  }
  const nC = 6;
  for (let i = 0; i < nC; i++) {
    const a0 = (i / nC) * Math.PI * 2, a1 = ((i + 1) / nC) * Math.PI * 2;
    const o = [0, 0.0025, 0];
    const p0 = P(0.005, a0), p1 = P(0.005, a1);
    push([0, h + 0.003, 0.0015], center); push([p0[0], p0[1] + 0.003, p0[2] + 0.0015], center); push([p1[0], p1[1] + 0.003, p1[2] + 0.0015], center);
  }
  void hp;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// ============================================================
// 木の形（幹＋葉のかたまり）
// ============================================================
function leafBlob(cx, cy, cz, r, seed, squash = 0.85) {
  let g = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const rng = makeRng(seed);
  const k = [rng() * 6, rng() * 6, rng() * 6];
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.20 * Math.sin(x * 3.1 + k[0]) * Math.cos(z * 2.7 + k[1]) + 0.12 * Math.sin(y * 4.3 + k[2] + x * 2.0);
    p.setXYZ(i, cx + x * r * n, cy + y * r * n * squash, cz + z * r * n);
    const shade = 0.55 + 0.55 * (y * 0.5 + 0.5) ** 0.9;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function mergeGeos(list) {
  // どれも index あり・position/normal/color のみにそろえて結合
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), Cc = new Float32Array(vc * 3), I = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); Cc.set(g.attributes.color.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) I[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

function makeRoundCrown() {
  const blobs = [
    leafBlob(0, 0.66, 0, 0.30, 1), leafBlob(0.17, 0.55, 0.06, 0.21, 2), leafBlob(-0.15, 0.58, -0.08, 0.22, 3),
    leafBlob(0.04, 0.50, -0.17, 0.19, 4), leafBlob(-0.06, 0.52, 0.17, 0.2, 5),
    leafBlob(0.06, 0.84, 0.02, 0.2, 6), leafBlob(-0.12, 0.76, 0.08, 0.16, 7),
  ];
  return mergeGeos(blobs);
}

function makeConiferCrown() {
  const parts = [];
  const tiers = [[0.26, 0.17, 0.40], [0.205, 0.38, 0.34], [0.15, 0.58, 0.30], [0.095, 0.78, 0.26]];
  tiers.forEach(([r, y0, hgt], i) => {
    let g = new THREE.ConeGeometry(r, hgt, 9, 1, false);
    g.deleteAttribute('uv');
    g.translate(0, y0 + hgt / 2, 0);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) - y0) / hgt;
      const s = 0.5 + 0.6 * t * t + 0.1 * i / 3;
      colors[v * 3] = colors[v * 3 + 1] = colors[v * 3 + 2] = s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });
  return mergeGeos(parts);
}

// ============================================================
// 本体
// ============================================================
export function createWorld() {
  const scene = new THREE.Scene();
  const horizonColor = col(SKY.horizon);
  scene.fog = new THREE.FogExp2(horizonColor, FOG_DENSITY);

  // ---- 共通の uniform（風・時刻・注目点）----
  const U = {
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector3() },
    uWindDir: { value: new THREE.Vector2(0, -1) },   // 風が進む向き（x,z）の単位ベクトル
    uWindSpeed: { value: 0 },
  };
  const wind = { speed: 0, dirX: 0, dirZ: -1, tSpeed: 0, tDirX: 0, tDirZ: -1 };

  // ---- 光 ----
  const hemi = new THREE.HemisphereLight(col('#c4d8f0'), col('#b4b996'), 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(col('#fff1dc'), 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = 150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.position.copy(SUN_DIR).multiplyScalar(70);
  scene.add(sun, sun.target);
  // 影カメラの向き（画素の大きさ単位で位置を丸めるための軸）
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const lightY = new THREE.Vector3().crossVectors(SUN_DIR, lightX).normalize();
  const texel = (SHADOW_HALF * 2) / SHADOW_SIZE;

  // ---- 空 ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uZenith: { value: col(SKY.zenith) }, uMid: { value: col(SKY.mid) }, uHorizon: { value: horizonColor.clone() },
      uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: col(SKY.sunCol) }, uHaze: { value: col(SKY.sunHaze) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uZenith, uMid, uHorizon, uSunDir, uSunCol, uHaze;
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float t = pow(h, 0.55);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.42, t));
        c = mix(c, uZenith, smoothstep(0.30, 1.0, t));
        float s = max(dot(d, uSunDir), 0.0);
        float hazeBand = 1.0 - smoothstep(0.0, 0.35, h);
        c = mix(c, uHaze, 0.38 * pow(s, 3.0) * hazeBand);
        c += uSunCol * (0.16 * pow(s, 5.0) + 0.45 * pow(s, 48.0) + 9.0 * pow(s, 1400.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), skyMat);
  sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);

  // ---- 地面 ----
  const grassTex = makeGrassTexture();
  const groundMat = new THREE.MeshLambertMaterial({ map: grassTex.texture, color: 0xffffff });
  groundMat.customProgramCacheKey = () => 'world-ground';
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMean = { value: grassTex.mean.clone() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform vec3 uMean;\n' + GLSL_NOISE)
      .replace('#include <map_fragment>', /* glsl */`
        {
          vec2 q = vWP.xz;
          vec3 ta = texture2D(map, q / 5.0).rgb;
          vec3 tb = texture2D(map, mat2(0.866, 0.5, -0.5, 0.866) * q / 17.3 + 0.37).rgb;
          vec3 tex = mix(ta, tb, 0.42);
          float dist = distance(vWP, cameraPosition);
          float detail = 1.0 - smoothstep(30.0, 260.0, dist);
          tex = mix(uMean, tex, detail);
          vec3 c = tex * macroTint(q);
          c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.82), smoothstep(4.0, 40.0, vWP.y));
          diffuseColor.rgb *= c;
        }`);
  };
  const ground = (() => {
    const radii = [0, 4, 10, 20, 36, 60, 95, 140, 195, 255, 320, 370, 400];
    for (let r = 420; r <= 900; r += 20) radii.push(r);
    for (let r = 960; r <= 2000; r += 60) radii.push(r);
    const NA = 144, NR = radii.length;
    const pos = new Float32Array(NR * NA * 3), nor = new Float32Array(NR * NA * 3);
    const e = 2.0;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i];
      const k = (i * NA + j) * 3;
      pos[k] = x; pos[k + 1] = groundHeight(x, z); pos[k + 2] = z;
      const hx = groundHeight(x + e, z) - groundHeight(x - e, z), hz = groundHeight(x, z + e) - groundHeight(x, z - e);
      const nl = Math.hypot(hx / (2 * e), 1, hz / (2 * e));
      nor[k] = -hx / (2 * e) / nl; nor[k + 1] = 1 / nl; nor[k + 2] = -hz / (2 * e) / nl;
    }
    const idx = [];
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      const a = i * NA + j, b = i * NA + j2, c = (i + 1) * NA + j, d = (i + 1) * NA + j2;
      // 上から見て反時計まわり（法線が＋y）
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = true; m.frustumCulled = false;
    return m;
  })();
  scene.add(ground);

  // 投げ台の足もとの土
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(2.0, 40),
    new THREE.MeshLambertMaterial({ map: makeDirtTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(-0.4, 0.004, 0); dirt.receiveShadow = true;
  scene.add(dirt);

  // ---- 草むら（位置は全部 GPU で決める。CPU は毎コマ何もしない）----
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grassMat.customProgramCacheKey = () => 'world-grass';
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uCell = { value: GRASS_CELL }; sh.uniforms.uGrid = { value: GRASS_GRID }; sh.uniforms.uRadius = { value: GRASS_RADIUS };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCell;
        uniform vec3 uFocus; uniform vec2 uWindDir; uniform float uTime, uWindSpeed, uCell, uGrid, uRadius;
        ${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        {
          vec2 base = floor(uFocus.xz / uCell);
          vec2 wc = base + mod(aCell - base + uGrid * 0.5, uGrid) - uGrid * 0.5;
          vec2 hA = hash22(wc * 1.37 + 11.0), hB = hash22(wc * 0.77 + 3.1);
          vec2 warp = vec2(vnoise(wc * 0.31), vnoise(wc * 0.31 + 7.7)) - 0.5;
          vec2 p = (wc + 0.5 + (hA - 0.5) * 1.0 + warp * 0.9) * uCell;
          float d = distance(p, uFocus.xz);
          float rO = length(p);
          float fade = 1.0 - smoothstep(uRadius - 6.5, uRadius, d);
          fade *= 1.0 - smoothstep(380.0, 398.0, rO);
          fade *= smoothstep(0.9, 2.0, rO + (p.x > 0.0 ? 0.0 : 0.4));
          // 距離の線のまわりは短く刈る（チョークが埋もれない）
          float sp = rO < 102.5 ? 5.0 : (rO < 205.0 ? 10.0 : 50.0);
          float rd = abs(rO - sp * floor(rO / sp + 0.5));
          float hw = 0.06 + 0.0016 * rO;
          float mow = p.x > 0.0 ? smoothstep(hw, hw + 0.25, rd) : 1.0;
          float pat = vnoise(p * 0.33);
          float s = (0.78 + 0.45 * hB.x) * (0.85 + 0.3 * pat) * fade * mix(0.18, 1.0, mow);
          float yaw = hB.y * 6.2831853;
          float cy = cos(yaw), sy = sin(yaw);
          vec3 lp = transformed;
          float hf = clamp(lp.y / 0.1, 0.0, 1.0);
          lp.xz = vec2(cy * lp.x - sy * lp.z, sy * lp.x + cy * lp.z);
          // 風：進む向きに倒れ、波のように強弱がつく。風0でもごく小さくゆれる
          float ph = dot(p, uWindDir) * 0.42 - uTime * (1.3 + 0.5 * uWindSpeed);
          float gust = 0.5 + 0.5 * sin(ph + 1.6 * sin(dot(p, vec2(-uWindDir.y, uWindDir.x)) * 0.23));
          float lean = 0.003 + 0.006 * uWindSpeed;
          float amp = lean * (0.55 + 0.9 * gust);
          float fl = sin(uTime * (2.1 + 0.4 * uWindSpeed) + hA.x * 40.0) * (0.0015 + 0.0012 * uWindSpeed);
          vec2 disp = (uWindDir * amp + vec2(-uWindDir.y, uWindDir.x) * fl + uWindDir * 0.001 * sin(uTime * 0.9 + hA.y * 30.0)) * hf * hf;
          float dl = length(disp);
          lp = lp * s;
          lp.y -= dl * hf * 0.6 * s;
          transformed = vec3(p.x + lp.x + disp.x * s, lp.y, p.y + lp.z + disp.y * s);
          // 色：ひとつずつ少し違う＋地面と同じ色むら
          vec3 tint = mix(vec3(0.82, 0.94, 0.70), vec3(1.14, 1.06, 0.86), hB.y);
          vColor.rgb *= tint * macroTint(p);
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;');
  };
  const ident = new THREE.Matrix4();
  const makeCellAttr = (grid) => {
    const a = new Float32Array(grid * grid * 2);
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) { a[(j * grid + i) * 2] = i; a[(j * grid + i) * 2 + 1] = j; }
    return new THREE.InstancedBufferAttribute(a, 2);
  };
  const tuftGeo = makeTuftGeometry();
  tuftGeo.setAttribute('aCell', makeCellAttr(GRASS_GRID));
  const grass = new THREE.InstancedMesh(tuftGeo, grassMat, GRASS_GRID * GRASS_GRID);
  for (let i = 0; i < grass.count; i++) grass.setMatrixAt(i, ident);
  grass.frustumCulled = false; grass.receiveShadow = true;
  scene.add(grass);

  // ---- 花 ----
  const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  flowerMat.customProgramCacheKey = () => 'world-flower';
  flowerMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uCell = { value: FLOWER_CELL }; sh.uniforms.uGrid = { value: FLOWER_GRID }; sh.uniforms.uRadius = { value: GRASS_RADIUS };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCell;
        uniform vec3 uFocus; uniform vec2 uWindDir; uniform float uTime, uWindSpeed, uCell, uGrid, uRadius;
        ${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        {
          vec2 base = floor(uFocus.xz / uCell);
          vec2 wc = base + mod(aCell - base + uGrid * 0.5, uGrid) - uGrid * 0.5;
          vec2 hA = hash22(wc * 1.91 + 5.0), hB = hash22(wc * 0.63 + 9.1);
          vec2 p = (wc + 0.5 + (hA - 0.5) * 0.9) * uCell;
          float d = distance(p, uFocus.xz);
          float rO = length(p);
          float fade = 1.0 - smoothstep(uRadius - 4.0, uRadius, d);
          fade *= 1.0 - smoothstep(380.0, 398.0, rO);
          fade *= smoothstep(2.0, 3.2, rO);
          // 花は群れて咲く
          float cl = vnoise(p * 0.16 + 40.0);
          float on = step(0.52, cl) * step(hB.x, 0.25 + 0.7 * smoothstep(0.52, 0.75, cl));
          float sp = rO < 102.5 ? 5.0 : (rO < 205.0 ? 10.0 : 50.0);
          float rd = abs(rO - sp * floor(rO / sp + 0.5));
          on *= (p.x > 0.0 ? step(0.5, rd) : 1.0);
          float s = on * fade * (0.75 + 0.55 * hB.y);
          float yaw = hA.y * 6.2831853;
          float cy = cos(yaw), sy = sin(yaw);
          vec3 lp = transformed;
          float hf = clamp(lp.y / 0.13, 0.0, 1.0);
          lp.xz = vec2(cy * lp.x - sy * lp.z, sy * lp.x + cy * lp.z);
          float ph = dot(p, uWindDir) * 0.42 - uTime * (1.3 + 0.5 * uWindSpeed);
          float gust = 0.5 + 0.5 * sin(ph + 1.6 * sin(dot(p, vec2(-uWindDir.y, uWindDir.x)) * 0.23));
          float amp = (0.004 + 0.008 * uWindSpeed) * (0.55 + 0.9 * gust);
          float fl = sin(uTime * (1.9 + 0.3 * uWindSpeed) + hA.x * 40.0) * (0.003 + 0.002 * uWindSpeed);
          vec2 disp = (uWindDir * amp + vec2(-uWindDir.y, uWindDir.x) * fl) * hf * hf;
          transformed = vec3(p.x + (lp.x + disp.x) * s, lp.y * s, p.y + (lp.z + disp.y) * s);
          float yellow = step(0.5, hB.x);
          float isPetal = step(0.9, min(vColor.r, min(vColor.g, vColor.b)));
          vColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.80, 0.16), yellow * isPetal);
          vColor.rgb *= (1.0 - isPetal) * macroTint(p) + isPetal;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;');
  };
  const flowerGeo = makeFlowerGeometry();
  flowerGeo.setAttribute('aCell', makeCellAttr(FLOWER_GRID));
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWER_GRID * FLOWER_GRID);
  for (let i = 0; i < flowers.count; i++) flowers.setMatrixAt(i, ident);
  flowers.frustumCulled = false; flowers.receiveShadow = true;
  scene.add(flowers);

  // ---- 距離の目盛り（円弧のチョーク線＋地面に寝かせた数字）----
  const rings = [];
  for (let r = 5; r <= 100; r += (r < 60 ? 5 : 10)) rings.push(r);
  for (let r = 110; r <= 200; r += 10) rings.push(r);
  for (let r = 250; r <= 350; r += 50) rings.push(r);
  const lineGeo = (() => {
    const pos = [], colr = [], idx = [];
    const n1 = (x, seed) => { // なめらかな1次元ノイズ（チョークのかすれ）
      const i = Math.floor(x), f = x - i, w = f * f * (3 - 2 * f);
      const h = (k) => { const s = Math.sin((k + seed * 17.3) * 12.9898) * 43758.5453; return s - Math.floor(s); };
      return h(i) * (1 - w) + h(i + 1) * w;
    };
    rings.forEach((r, ri) => {
      const major = r % 10 === 0 || r > 100;
      const hw = (0.035 + 0.0012 * r) * (major ? 1 : 0.55);
      const baseA = major ? 0.62 : 0.40;
      const arc = Math.PI * r;
      const n = Math.max(24, Math.ceil(arc / (0.30 * Math.sqrt(r))));
      const v0 = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / n;
        const edge = 1 - Math.min(1, Math.max(0, (Math.abs(a) / (Math.PI / 2) - 0.86) / 0.14));
        const alpha = baseA * (0.62 + 0.38 * n1(i * (0.45 + 0.1 * Math.sqrt(r) / 3), ri + 1)) * edge;
        for (const rr of [r - hw, r + hw]) {
          pos.push(Math.cos(a) * rr, 0.012, Math.sin(a) * rr);
          colr.push(1.5, 1.5, 1.45, alpha);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = v0 + i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4));
    g.setIndex(idx);
    return g;
  })();
  const lines = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  lines.renderOrder = 2; lines.frustumCulled = false;
  scene.add(lines);

  // 数字（1枚の絵にまとめて1回で描く）
  const labelDist = [];
  for (let d = 10; d <= 100; d += 10) labelDist.push(d);
  for (let d = 150; d <= 350; d += 50) labelDist.push(d);
  const labels = (() => {
    const CW = 256, CH = 128, COLS = 4, ROWS = 4;
    const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
    const cg = cv.getContext('2d');
    const pos = [], uv = [], idx = [];
    labelDist.forEach((d, i) => {
      const { canvas, aspect } = makeTextTexture(`${d}m`, { fontSize: 88, color: '#ffffff', weight: 700, padding: 0.12 });
      const fit = Math.min((CW * 0.96) / canvas.width, (CH * 0.9) / canvas.height);
      const col_ = i % COLS, row = Math.floor(i / COLS);
      const w = canvas.width * fit, h = canvas.height * fit;
      cg.drawImage(canvas, col_ * CW + (CW - w) / 2, row * CH + (CH - h) / 2, w, h);
      // 地面に寝かせる：文字の右＝+z、文字の上＝+x
      const hgt = 1.05 + 0.004 * d;          // 札の高さ [m]（文字は約半分）
      const wid = hgt * (CW / CH);
      const cx = d - 0.5 - 0.002 * d, zc = 0.8 + wid * 0.25;
      const u0 = col_ / COLS, u1 = (col_ + 1) / COLS, v1 = 1 - row / ROWS, v0 = v1 - 1 / ROWS;
      const k = pos.length / 3;
      const P = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const [u, v] of P) {
        pos.push(cx + (v - 0.5) * hgt, 0.02, (u - 0.5) * wid + zc);
        uv.push(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v);
      }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.55, color: new THREE.Color(1.5, 1.5, 1.45), depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    m.renderOrder = 3; m.frustumCulled = false;
    return m;
  })();
  scene.add(labels);

  // ---- 投げ台 ----
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tower = new THREE.Mesh(new THREE.BufferGeometry(), woodMat);
  tower.castShadow = true; tower.receiveShadow = true;
  const railGroup = new THREE.Group();
  const rail = new THREE.Mesh(buildRailGeometry(), woodMat);
  rail.castShadow = true; rail.receiveShadow = true;
  railGroup.add(rail);
  scene.add(tower, railGroup);
  let curH = null;
  function setLaunch(setup) {
    const H = Math.min(15, Math.max(0.5, Number(setup?.throwHeight ?? 4)));
    const heading = Number(setup?.throwHeading ?? 0);
    if (H !== curH) {
      tower.geometry.dispose();
      tower.geometry = buildTowerGeometry(H);
      curH = H;
    }
    railGroup.position.set(0, H, 0);
    railGroup.rotation.set(0, -heading * D2R, 0); // +が右（+z）
  }
  setLaunch({ throwHeight: 4, throwHeading: 0 });

  // ---- 木 ----
  const treeGroup = (() => {
    const grp = new THREE.Group();
    const rng = makeRng(321);
    const items = [];
    const okPos = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 160 || r > 380) return false;
      return Math.abs(Math.atan2(z, x)) >= 35 * D2R; // 飛行の通り道（＋x軸から±30°）には置かない
    };
    for (let g = 0; g < 20; g++) {
      const a = (35 + rng() * 290) * D2R, r = 175 + rng() * 195;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const n = 3 + Math.floor(rng() * 7);
      const kind = rng() < 0.35 ? 1 : 0; // 群れごとに針葉樹が多いか広葉樹が多いか
      for (let i = 0; i < n; i++) {
        const aa = rng() * 6.283, rr = Math.sqrt(rng()) * 24;
        const x = cx + Math.cos(aa) * rr, z = cz + Math.sin(aa) * rr;
        if (!okPos(x, z)) continue;
        items.push({ x, z, conifer: rng() < (kind ? 0.75 : 0.18), h: 9 + rng() * 7, w: 0.8 + rng() * 0.4, yaw: rng() * 6.283, tone: rng() });
      }
    }
    const nRound = items.filter((t) => !t.conifer).length, nCon = items.length - nRound;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 1, 7, 1, true);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: col('#5a4128') });
    const crownMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, items.length);
    const roundM = new THREE.InstancedMesh(makeRoundCrown(), crownMat, nRound);
    const conM = new THREE.InstancedMesh(makeConiferCrown(), crownMat, nCon);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let ir = 0, ic = 0;
    items.forEach((t, i) => {
      const y = groundHeight(t.x, t.z);
      q.setFromAxisAngle(up, t.yaw);
      p3.set(t.x, y - 0.3, t.z);
      const tw = t.h * 0.06 * t.w;
      sc3.set(tw, t.h * (t.conifer ? 0.28 : 0.42), tw);
      m4.compose(p3, q, sc3); trunks.setMatrixAt(i, m4);
      p3.set(t.x, y - 0.3, t.z);
      sc3.set(t.h * 0.62 * t.w, t.h, t.h * 0.62 * t.w);
      m4.compose(p3, q, sc3);
      if (t.conifer) {
        conM.setMatrixAt(ic, m4);
        c.setHSL(0.40 + (t.tone - 0.5) * 0.05, 0.38, 0.17 + t.tone * 0.07); conM.setColorAt(ic, c); ic++;
      } else {
        roundM.setMatrixAt(ir, m4);
        c.setHSL(0.24 + (t.tone - 0.5) * 0.09, 0.45, 0.25 + t.tone * 0.09); roundM.setColorAt(ir, c); ir++;
      }
    });
    for (const m of [trunks, roundM, conM]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; grp.add(m); }
    return grp;
  })();
  scene.add(treeGroup);

  // ---- 雲 ----
  const cloudTex = [11, 22, 33, 44].map(makeCloudTexture);
  const CLOUD_R = 1000;
  const clouds = (() => {
    const rng = makeRng(555);
    const list = [];
    const N = 22;
    for (let i = 0; i < N; i++) {
      const front = rng() < 0.65;
      const az = front ? (rng() - 0.5) * 2.4 : rng() * Math.PI * 2;
      const dist = 450 + rng() * 650;
      const w = 220 + rng() * 260;
      const mat = new THREE.SpriteMaterial({ map: cloudTex[i % 4], transparent: true, depthWrite: false, opacity: 0.92, color: new THREE.Color(1.22, 1.22, 1.25) });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(w, w * 0.5, 1);
      sp.renderOrder = -50;
      sp.frustumCulled = false;
      scene.add(sp);
      list.push({ sp, x: Math.cos(az) * dist, z: Math.sin(az) * dist, y: 70 + rng() * 200, mat });
    }
    return list;
  })();
  let cloudCX = 0, cloudCZ = 0;

  // ---- 風 ----
  function setWind(setup) {
    const sp = Math.min(6, Math.max(0, Number(setup?.windSpeed ?? 0)));
    const dir = Number(setup?.windDir ?? 0) * D2R;
    // windDir は「風が吹いてくる向き」。0°＝+x側から → 進む向きは −x、90°＝+z側から → 進む向きは −z
    wind.tSpeed = sp; wind.tDirX = -Math.cos(dir); wind.tDirZ = -Math.sin(dir);
  }
  setWind({ windSpeed: 0, windDir: 90 });
  wind.speed = wind.tSpeed; wind.dirX = wind.tDirX; wind.dirZ = wind.tDirZ;

  // ---- 毎コマ ----
  const tmpT = new THREE.Vector3();
  function update(dt, time, focus, camera) {
    // 風をなめらかに
    const k = Math.min(1, dt * 3);
    wind.speed += (wind.tSpeed - wind.speed) * k;
    wind.dirX += (wind.tDirX - wind.dirX) * k; wind.dirZ += (wind.tDirZ - wind.dirZ) * k;
    const dl = Math.hypot(wind.dirX, wind.dirZ) || 1;
    U.uWindDir.value.set(wind.dirX / dl, wind.dirZ / dl);
    U.uWindSpeed.value = wind.speed;
    U.uTime.value = time;
    U.uFocus.value.copy(focus);

    // 空はカメラに追従
    if (camera) {
      sky.position.copy(camera.position);
      const R = Math.min(1500, (camera.far || 3000) * 0.92);
      sky.scale.setScalar(R);
    }

    // 影：影マップの画素の大きさ単位で位置を丸める（ちらつき防止）
    const u = Math.round(focus.dot(lightX) / texel) * texel;
    const v = Math.round(focus.dot(lightY) / texel) * texel;
    const w = focus.dot(SUN_DIR);
    tmpT.copy(lightX).multiplyScalar(u).addScaledVector(lightY, v).addScaledVector(SUN_DIR, w);
    sun.target.position.copy(tmpT);
    sun.position.copy(tmpT).addScaledVector(SUN_DIR, 70);

    // 雲を風下へ流し、注目点の周りで回り込ませる（端ではすっと薄くなる）
    const spd = 4 + 6 * wind.speed;
    const vx = wind.dirX / dl * spd * dt, vz = wind.dirZ / dl * spd * dt;
    cloudCX = focus.x; cloudCZ = focus.z;
    const R2 = CLOUD_R * 2;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x += vx; c.z += vz;
      let dx = c.x - cloudCX, dz = c.z - cloudCZ;
      dx = ((((dx + CLOUD_R) % R2) + R2) % R2) - CLOUD_R;
      dz = ((((dz + CLOUD_R) % R2) + R2) % R2) - CLOUD_R;
      c.x = cloudCX + dx; c.z = cloudCZ + dz;
      const e = Math.max(Math.abs(dx), Math.abs(dz)) / CLOUD_R;
      const f = 1 - Math.min(1, Math.max(0, (e - 0.78) / 0.2));
      c.mat.opacity = 0.92 * f;
      c.sp.visible = f > 0.01;
      c.sp.position.set(c.x, c.y, c.z);
    }
  }

  return { scene, sun, setLaunch, setWind, update };
}
