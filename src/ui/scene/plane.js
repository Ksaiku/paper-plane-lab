// ============================================================
// 機体の3D（紙の質感・厚み・折り目・重りのクリップ）
// group の原点＝重心。軸は x＝機首, y＝上, z＝右翼（機体座標そのまま）。
// 紙は「ごく薄い厚みのある板」（上面・下面・縁の帯）で作る。形は aircraft.geometry から。
// ============================================================
import * as THREE from 'three';
import { keelDepthAt } from '../../core/aircraft.js';

const PAPER_COLOR = 0xfbf8ef;
const EDGE_COLOR = 0xd9d3c0;
const SHEET_H = 0.0004; // 紙の半分の厚み [m]（0.8mm の板）
const KEEL_Z = 0.0006; // 胴体の左右の紙の、中心からの距離
const KEEL_H = 0.0003;
const SPINE_HALF_W = 0.00095;
const SPINE_H = 0.00055;
const TEX_PER_M = 1 / 0.15; // 繊維の模様は 15cm で1周

// ---- 小さなベクトル計算（new を減らすため配列で） ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 決まった乱数（毎回同じ模様） */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 紙の繊維の模様（ごく薄い濃淡）。つなぎ目が見えないよう端でも描き足す */
function makePaperTexture() {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(247,246,242)';
  g.fillRect(0, 0, N, N);
  const r = rng(20240611);
  // ゆるい濃淡のむら
  for (let i = 0; i < 90; i++) {
    const x = r() * N, y = r() * N, rad = 20 + r() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    grad.addColorStop(0, dark ? 'rgba(150,140,120,0.02)' : 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
    }
  }
  // 繊維
  g.lineCap = 'round';
  for (let i = 0; i < 4200; i++) {
    const x = r() * N, y = r() * N, a = r() * Math.PI, l = 2 + r() * 9;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    const light = r() < 0.5;
    g.strokeStyle = light ? `rgba(255,255,255,${0.10 + r() * 0.2})` : `rgba(120,110,90,${0.025 + r() * 0.05})`;
    g.lineWidth = 0.5 + r() * 0.7;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const px = x + ox, py = y + oy;
      if (px < -30 || px > N + 30 || py < -30 || py > N + 30) continue;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py + dy); g.stroke();
    }
  }
  // 細かいざらつき
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 7;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** 銀色の金属が暗く沈まないための、ごく小さな空の反射用の画像（空は上が青、地面は緑） */
function makeSmallEnv() {
  const faces = [];
  const mk = (top, bot) => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, top); gr.addColorStop(0.5, bot[0]); gr.addColorStop(1, bot[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return c;
  };
  const side = mk('#4f86c9', ['#f4f7fa', '#3f4a34']);
  const up = mk('#4a82c8', ['#6a9bd6', '#6a9bd6']);
  const down = mk('#3f4a34', ['#3f4a34', '#3f4a34']);
  faces.push(side, side, up, down, side, side);
  const t = new THREE.CubeTexture(faces);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 形の部品を集める入れもの */
function newBuf() { return { pos: [], nrm: [], uv: [] }; }

function pushTri(b, a, bb, c, n, uva, uvb, uvc) {
  b.pos.push(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2]);
  b.nrm.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  b.uv.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
}

function toGeometry(b, withUv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  if (b.nrm && b.nrm.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  if (withUv && b.uv && b.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.computeBoundingSphere();
  return g;
}

/**
 * 薄い板を足す。pts は同一平面の凸多角形。hint は表の向き。h は厚みの半分。
 * 上面・下面は paper へ、縁の帯は edge へ、輪郭線は lines へ入れる。
 */
function addPlate(B, pts, hint, h, seed) {
  let n = cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]));
  if (len(n) < 1e-12) return null; // つぶれた板は作らない
  n = norm(n);
  let P = pts;
  if (dot(n, hint) < 0) n = mul(n, -1);
  if (dot(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0])), n) < 0) P = pts.slice().reverse();
  const e1 = norm(sub(P[1], P[0]));
  const e2 = cross(n, e1);
  const ou = (seed * 0.37) % 1, ov = (seed * 0.61) % 1;
  const uvOf = (p) => { const d = sub(p, P[0]); return [dot(d, e1) * TEX_PER_M + ou, dot(d, e2) * TEX_PER_M + ov]; };
  const nn = mul(n, -1);
  const up = P.map((p) => add(p, mul(n, h)));
  const dn = P.map((p) => add(p, mul(n, -h)));
  const uvs = P.map(uvOf);
  for (let i = 1; i < P.length - 1; i++) {
    pushTri(B.paper, up[0], up[i], up[i + 1], n, uvs[0], uvs[i], uvs[i + 1]);
    pushTri(B.paper, dn[0], dn[i + 1], dn[i], nn, uvs[0], uvs[i + 1], uvs[i]);
  }
  let acc = 0;
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    const d = sub(P[j], P[i]);
    const l = len(d);
    const sn = norm(cross(d, n));
    const u0 = acc * TEX_PER_M, u1 = (acc + l) * TEX_PER_M;
    pushTri(B.edge, up[i], dn[j], up[j], sn, [u0, 0], [u1, 1], [u1, 0]);
    pushTri(B.edge, up[i], dn[i], dn[j], sn, [u0, 0], [u0, 1], [u1, 1]);
    acc += l;
    B.lines.push(up[i][0], up[i][1], up[i][2], up[j][0], up[j][1], up[j][2]);
    B.lines.push(dn[i][0], dn[i][1], dn[i][2], dn[j][0], dn[j][1], dn[j][2]);
  }
  return { q: pts, n, h };
}

/** 板の上の点（s: p0→p1 方向の割合, t: p0→p3 方向の割合） */
function pointAt(plate, s, t) {
  const [p0, p1, p2, p3] = plate.q;
  const a = (1 - s) * (1 - t), b = s * (1 - t), c = s * t, d = (1 - s) * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

function pushRibbon(arr, a, b, normal, w) {
  const d = norm(sub(b, a));
  const side = mul(norm(cross(normal, d)), w / 2);
  const p0 = sub(a, side), p1 = add(a, side), p2 = add(b, side), p3 = sub(b, side);
  arr.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
}

/** 板の表と裏に、折り目の線（へこんだ影のように見える、うすい灰色の帯）を引く */
function addFold(B, plate, A, Bp) {
  if (!plate) return;
  for (const sign of [1, -1]) {
    const nrm = mul(plate.n, sign);
    const off = mul(nrm, plate.h + 0.00003);
    const a = add(A, off), b = add(Bp, off);
    pushRibbon(B.ribN, a, b, nrm, 0.0005);
    pushRibbon(B.ribW, a, b, nrm, 0.0020);
  }
}

export function createPlane() {
  const group = new THREE.Group();
  group.name = 'plane';

  const tex = makePaperTexture();
  const paperMat = new THREE.MeshStandardMaterial({
    color: PAPER_COLOR, map: tex, bumpMap: tex, bumpScale: 0.35,
    roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: EDGE_COLOR, map: tex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const foldNarrowMat = new THREE.MeshBasicMaterial({
    color: 0x6a6455, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const foldWideMat = new THREE.MeshBasicMaterial({
    color: 0x8a8472, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x5b5646, transparent: true, opacity: 0.5 });
  const clipMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 0.9, roughness: 0.34, envMap: makeSmallEnv(), envMapIntensity: 0.85 });

  const paperMesh = new THREE.Mesh(new THREE.BufferGeometry(), paperMat);
  const edgeMesh = new THREE.Mesh(new THREE.BufferGeometry(), edgeMat);
  const foldN = new THREE.Mesh(new THREE.BufferGeometry(), foldNarrowMat);
  const foldW = new THREE.Mesh(new THREE.BufferGeometry(), foldWideMat);
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
  for (const m of [paperMesh, edgeMesh]) { m.castShadow = true; m.receiveShadow = true; }
  foldN.renderOrder = 2; foldW.renderOrder = 1;
  group.add(paperMesh, edgeMesh, foldW, foldN, outline);

  // ---- 重りのクリップ ----
  const clip = new THREE.Group();
  clip.name = 'clip';
  group.add(clip);
  let clipKey = '';

  function stadiumPoints(w, v0, v1, z, closed) {
    // 上下が半円の、細長い輪（x–y 面。幅 2w、v0〜v1 の高さ）
    const pts = [];
    const n = 10;
    const cu = 0;
    const topC = v1 - w, botC = v0 + w;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push(new THREE.Vector3(cu + w * Math.cos(a), topC + w * Math.sin(a), z)); }
    for (let i = 0; i <= n; i++) { const a = Math.PI + (i / n) * Math.PI; pts.push(new THREE.Vector3(cu + w * Math.cos(a), botC + w * Math.sin(a), z)); }
    if (closed) {
      // 先頭と最後が同じ点にならないよう、重なる点を除く
      pts.pop();
    }
    return pts;
  }

  function buildClip(scale, height) {
    const key = scale.toFixed(3) + '|' + height.toFixed(4);
    if (key === clipKey) return;
    clipKey = key;
    while (clip.children.length) {
      const c = clip.children.pop();
      c.geometry.dispose();
    }
    const s = scale;
    const w = 0.0033 * s;
    const Z = 0.00175;
    const r = Math.max(0.0003, 0.0006 * s);
    const v0 = 0.0004;
    const H = Math.max(height, 2 * w + 0.002);
    const outerPts = stadiumPoints(w, v0, v0 + H, Z, true);
    const w2 = w * 0.55;
    const innerPts = stadiumPoints(w2, v0, v0 + Math.max(H * 0.72, 2 * w2 + 0.001), -Z, true);
    const curves = [
      new THREE.CatmullRomCurve3(outerPts, true, 'catmullrom', 0.5),
      new THREE.CatmullRomCurve3(innerPts, true, 'catmullrom', 0.5),
    ];
    // 紙の下の縁をまわってつなぐ半円
    const bridge = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      bridge.push(new THREE.Vector3(0, v0 - Z * Math.sin(a), Z * Math.cos(a)));
    }
    curves.push(new THREE.CatmullRomCurve3(bridge));
    for (const cv of curves) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 56, r, 6, cv.closed), clipMat);
      m.castShadow = true; m.receiveShadow = true;
      clip.add(m);
    }
  }

  function rebuild(aircraft) {
    const geo = aircraft.geometry;
    const cg = geo.cg;
    const P = (p) => [p[0] - cg[0], p[1] - cg[1], p[2] - cg[2]];
    const B = {
      paper: newBuf(), edge: newBuf(), lines: [], ribN: [], ribW: [],
    };
    const UP = [0, 1, 0];

    // 胴体：中央の折り目を境に、左右2枚が下へ垂れる
    const keel = geo.keel.map(P);
    const keelR = addPlate(B, keel.map((p) => [p[0], p[1], p[2] + KEEL_Z]), [0, 0, 1], KEEL_H, 1);
    const keelL = addPlate(B, keel.map((p) => [p[0], p[1], p[2] - KEEL_Z]), [0, 0, -1], KEEL_H, 2);
    // 背骨（折り目の盛り上がり）
    const L = geo.length;
    const spine = [[0, 0, -SPINE_HALF_W], [-L, 0, -SPINE_HALF_W], [-L, 0, SPINE_HALF_W], [0, 0, SPINE_HALF_W]]
      .map((p) => P([p[0], p[1], p[2]]));
    addPlate(B, spine, UP, SPINE_H, 3);
    // 胴体の折り重ねの線（深さの1/3あたり）
    for (const [plate, sg] of [[keelR, 1], [keelL, -1]]) {
      if (!plate) continue;
      const pt = (x) => P([x, -keelDepthAt(-x) * 0.36, 0]);
      const a = pt(-0.03), b = pt(-0.265);
      a[2] += sg * KEEL_Z; b[2] += sg * KEEL_Z;
      const nrm = mul([0, 0, 1], sg);
      const off = mul(nrm, KEEL_H + 0.00003);
      pushRibbon(B.ribN, add(a, off), add(b, off), nrm, 0.0005);
      pushRibbon(B.ribW, add(a, off), add(b, off), nrm, 0.0018);
      const off2 = mul(nrm, -(KEEL_H + 0.00003));
      // 内側の面にも（隙間からのぞいたとき用）
      pushRibbon(B.ribN, add(a, off2), add(b, off2), mul(nrm, -1), 0.0005);
    }

    // 主翼
    for (const side of ['right', 'left']) {
      const q = geo.wing[side].map(P);
      const plate = addPlate(B, q, UP, SHEET_H, side === 'right' ? 4 : 5);
      if (plate) {
        addFold(B, plate, pointAt(plate, 0.03, 0.02), pointAt(plate, 0.03, 0.98)); // 付け根の折り目
        addFold(B, plate, pointAt(plate, 0.03, 0.3), pointAt(plate, 0.9, 0.3)); // 翼の中ほどの折り目
        addFold(B, plate, pointAt(plate, 0.45, 0.0), pointAt(plate, 0.92, 0.55)); // 斜めの折り目
      }
    }
    // 水平尾翼
    for (const side of ['right', 'left']) {
      const q = geo.tail[side].map(P);
      const plate = addPlate(B, q, UP, SHEET_H * 0.85, side === 'right' ? 6 : 7);
      if (plate) addFold(B, plate, pointAt(plate, 0.04, 0.03), pointAt(plate, 0.04, 0.97));
    }
    // 垂直尾翼
    {
      const q = geo.fin.map(P);
      const plate = addPlate(B, q, [0, 0, 1], SHEET_H * 0.85, 8);
      if (plate) addFold(B, plate, pointAt(plate, 0.05, 0.75), pointAt(plate, 0.85, 0.75));
    }

    // 形を差し替える（古いものは捨てる）
    const swap = (mesh, g) => { mesh.geometry.dispose(); mesh.geometry = g; };
    swap(paperMesh, toGeometry(B.paper, true));
    swap(edgeMesh, toGeometry(B.edge, true));
    swap(foldN, toGeometry({ pos: B.ribN }, false));
    swap(foldW, toGeometry({ pos: B.ribW }, false));
    swap(outline, toGeometry({ pos: B.lines }, false));

    // 重りのクリップ
    const w = geo.weight;
    if (w && w.mass > 0) {
      const gram = w.mass * 1000;
      const scale = 0.7 + 0.3 * Math.sqrt(Math.min(4, Math.max(0.1, gram)));
      const x = w.pos[0];
      const depth = keelDepthAt(-x);
      buildClip(scale, Math.min(0.02 * scale, Math.max(0, depth - 0.0015)));
      clip.position.set(x - cg[0], -depth - cg[1], -cg[2]);
      clip.visible = true;
    } else {
      clip.visible = false;
    }
  }

  const q = new THREE.Quaternion();
  function setPose(pos, quat) {
    group.position.set(pos[0], pos[1], pos[2]);
    q.set(quat[1], quat[2], quat[3], quat[0]);
    group.quaternion.copy(q);
  }

  return { group, rebuild, setPose };
}
