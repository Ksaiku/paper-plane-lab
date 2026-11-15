// ============================================================
// 設計（画面の数値）から、機体の形・重さ・空気力を受ける面を作る。
// 座標：機体座標は x=前, y=上, z=右。原点は機首。胴体は x=0（機首）から x=-L（後端）。
// DOM も Three.js も使わない。
// ============================================================
import { PHYS, AERO, BUILD, PARAMS, defaultSetup } from './config.js';

const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PARAM_MAP = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/** 胴体（下向きの折り返し）の深さ。s は機首からの距離 [m] */
export function keelDepthAt(s) {
  const L = BUILD.fuselageLength;
  const sd = BUILD.keelDeepest * L;
  if (s <= 0) return 0;
  if (s < sd) return (BUILD.keelDepth * s) / sd;
  const u = clamp((s - sd) / (L - sd), 0, 1);
  return BUILD.keelDepth * (1 + (BUILD.keelTailDepth - 1) * u);
}

/**
 * いまの設計のもとで、各項目が取れる範囲を返す（物理的に作れない形を選べなくする）。
 * - 主翼の後縁が水平尾翼の前縁に重ならない
 * - 翼端が胴体の後端より後ろへはみ出さない
 */
export function getLimits(setup) {
  const L = BUILD.fuselageLength;
  const lim = {};
  for (const p of PARAMS) if (p.type !== 'bool') lim[p.key] = { min: p.min, max: p.max };
  const floorStep = (v, step) => Math.floor(v / step + 1e-9) * step;

  const tailChord = (BUILD.tailChordRatio * setup.tailSpan) / 100;
  const chordRoom = L - BUILD.wingRootLE - BUILD.minGap;
  // 翼弦：尾翼に重ならない
  lim.wingChord.max = Math.min(lim.wingChord.max, floorStep((chordRoom - tailChord) * 100, PARAM_MAP.wingChord.step));
  // 水平尾翼：主翼に重ならない
  lim.tailSpan.max = Math.min(
    lim.tailSpan.max,
    floorStep(((chordRoom - setup.wingChord / 100) / BUILD.tailChordRatio) * 100, PARAM_MAP.tailSpan.step)
  );
  // 後退角・翼幅：翼端の後縁が胴体の後端を越えない
  const cr = setup.wingChord / 100;
  const room = L - BUILD.wingRootLE - 0.25 * cr - 0.75 * BUILD.wingTaper * cr;
  const half = setup.wingSpan / 200;
  const maxSweep = (Math.atan2(Math.max(room, 0), half) / D2R);
  lim.wingSweep.max = Math.min(lim.wingSweep.max, floorStep(maxSweep, PARAM_MAP.wingSweep.step));
  const t = Math.tan(setup.wingSweep * D2R);
  if (t > 1e-6) {
    lim.wingSpan.max = Math.min(lim.wingSpan.max, floorStep((room / t) * 200, PARAM_MAP.wingSpan.step));
  }
  for (const k in lim) if (lim[k].max < lim[k].min) lim[k].max = lim[k].min;
  return lim;
}

/** 1つの項目を、いまの設計で許される範囲に収めた値にして返す */
export function clampParam(setup, key, value) {
  const p = PARAM_MAP[key];
  if (!p) return value;
  if (p.type === 'bool') return !!value;
  let v = Number(value);
  if (!Number.isFinite(v)) v = p.def;
  const lim = getLimits({ ...setup, [key]: v })[key];
  v = clamp(v, lim.min, lim.max);
  // 刻みに合わせる（保存データの手書き変更などで端数が入っても物理は動くが、表示をそろえる）
  const n = Math.round((v - p.min) / p.step);
  v = p.min + n * p.step;
  v = clamp(v, lim.min, lim.max);
  return Number(v.toFixed(4));
}

/** 設定全体を、作れる形に直して返す（保存データやお手本の読み込み時に使う） */
export function sanitizeSetup(input) {
  const s = { ...defaultSetup() };
  if (input && typeof input === 'object') {
    for (const p of PARAMS) {
      if (input[p.key] === undefined || input[p.key] === null) continue;
      if (p.type === 'bool') s[p.key] = !!input[p.key];
      else {
        const v = Number(input[p.key]);
        if (Number.isFinite(v)) s[p.key] = clamp(v, p.min, p.max);
      }
    }
  }
  // 互いに関係する項目は決まった順に収める
  for (const key of ['tailSpan', 'wingChord', 'wingSpan', 'wingSweep']) {
    s[key] = clampParam(s, key, s[key]);
  }
  for (const p of PARAMS) if (p.type !== 'bool') s[p.key] = clampParam(s, p.key, s[p.key]);
  return s;
}

/** 有限翼の揚力傾斜（ヘルムボルトの式。後退角つき）[1/rad] */
export function liftSlope(AR, sweepRad = 0) {
  const t = Math.tan(sweepRad);
  return (2 * Math.PI * AR) / (2 + Math.sqrt(4 + AR * AR * (1 + t * t)));
}

function stallAngle(AR) {
  return clamp(AERO.stallBaseDeg + AERO.stallPerInvAR / AR, AERO.stallMinDeg, AERO.stallMaxDeg) * D2R;
}

function liftDragFactor(a, AR) {
  // 揚力にともなう抗力の係数 k（CD = cd0 + k*CL^2）
  // 前縁吸引力がない板：k = 1/a（力が板に垂直にしか働かない）
  // 完全に働く翼：k = 1/(π e AR)
  return (1 - AERO.leSuction) / a + AERO.leSuction / (Math.PI * AERO.oswald * AR);
}

/**
 * 設計から機体を作る。
 * 返り値の位置はすべて「重心を原点とした機体座標」（geometry だけは機首原点）。
 */
export function buildAircraft(setupIn) {
  const setup = sanitizeSetup(setupIn);
  const L = BUILD.fuselageLength;

  // ---- 寸法（SI単位） ----
  const b = setup.wingSpan / 100;
  const cr = setup.wingChord / 100;
  const ct = cr * BUILD.wingTaper;
  const sweep = setup.wingSweep * D2R;
  const dih = setup.wingDihedral * D2R;
  const half = b / 2;
  const tSpan = setup.tailSpan / 100;
  const tHalf = tSpan / 2;
  const tcr = BUILD.tailChordRatio * tSpan;
  const tct = tcr * BUILD.tailTaper;
  const tUp = setup.tailAngle * D2R; // 後ろ上がり（＋で機首上げ）
  const fH = setup.finHeight / 100;
  const fcr = BUILD.finChordRatio * fH;
  const fct = fcr * BUILD.finTaper;
  const sigma = BUILD.paperDensity * (setup.paperThickness / 1000); // 紙1枚の面密度 [kg/m^2]
  const wMass = setup.weightMass / 1000;
  const wS = (setup.weightPos / 100) * L;

  const sinD = Math.sin(dih), cosD = Math.cos(dih);
  const tanS = Math.tan(sweep), sinS = Math.sin(sweep), cosS = Math.cos(sweep);

  // ---- 主翼の形 ----
  const wingQcRootX = -(BUILD.wingRootLE + 0.25 * cr);
  const chordAt = (eta) => cr + (ct - cr) * (eta / half);
  const qcX = (eta) => wingQcRootX - eta * tanS;
  // 翼面上の点（eta=付け根からの距離, f=前縁からの割合）→ 機首原点の座標。side=+1 右, -1 左
  const wingPoint = (eta, f, side) => {
    const c = chordAt(eta);
    return [qcX(eta) + (0.25 - f) * c, eta * sinD, side * eta * cosD];
  };
  const wingArea = half * (cr + ct); // 両翼
  const AR = (b * b) / wingArea;
  const mac = ((2 / 3) * cr * (1 + BUILD.wingTaper + BUILD.wingTaper ** 2)) / (1 + BUILD.wingTaper);

  // ---- 水平尾翼の形（後縁はまっすぐ、後端にそろえる。前縁の付け根を軸に後ろ上がりに傾ける） ----
  const tailHingeX = -L + tcr;
  const sinT = Math.sin(tUp), cosT = Math.cos(tUp);
  const tailChordAt = (eta) => tcr + (tct - tcr) * (eta / tHalf);
  // d = 軸（付け根前縁の線）から後ろへの距離
  const tailPoint = (eta, f, side) => {
    const c = tailChordAt(eta);
    const d = tcr - c + f * c; // 後縁がそろうので、翼端の前縁は軸より後ろにある
    return [tailHingeX - d * cosT, d * sinT, side * eta];
  };
  const tailArea = tHalf * (tcr + tct);
  const tailAR = (tSpan * tSpan) / tailArea;

  // ---- 垂直尾翼の形（後縁は垂直、後端にそろえる） ----
  const finChordAt = (h) => fcr + (fct - fcr) * (h / fH);
  const finPoint = (h, f) => {
    const c = finChordAt(h);
    return [-L + c - f * c, h, 0];
  };
  const finArea = (fH * (fcr + fct)) / 2;
  const finAR = (2 * fH * fH) / finArea; // 胴体が鏡の役をするので見かけのアスペクト比は2倍

  // ---- 質点の集まりとして重さを数える ----
  const pts = []; // {m, x, y, z}
  const addPlate = (pointFn, area, layers, nu, nv) => {
    const m = (sigma * layers * area) / (nu * nv);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const p = pointFn((i + 0.5) / nu, (j + 0.5) / nv);
      pts.push({ m, x: p[0], y: p[1], z: p[2] });
    }
  };
  const N = BUILD.wingStrips;
  for (const side of [1, -1]) {
    for (let i = 0; i < N; i++) {
      const eta = ((i + 0.5) / N) * half;
      const area = chordAt(eta) * (half / N);
      addPlate((u, v) => wingPoint(eta, v, side), area, BUILD.wingLayers, 1, 3);
    }
    for (let i = 0; i < 2; i++) {
      const eta = ((i + 0.5) / 2) * tHalf;
      const area = tailChordAt(eta) * (tHalf / 2);
      addPlate((u, v) => tailPoint(eta, v, side), area, BUILD.tailLayers, 1, 2);
    }
  }
  for (let i = 0; i < 2; i++) {
    const h = ((i + 0.5) / 2) * fH;
    addPlate((u, v) => finPoint(h, v), finChordAt(h) * (fH / 2), BUILD.finLayers, 1, 2);
  }
  const NK = 28;
  let keelArea = 0;
  for (let i = 0; i < NK; i++) {
    const s = ((i + 0.5) / NK) * L;
    const d = keelDepthAt(s);
    const layers = BUILD.keelLayersFront + (BUILD.keelLayersRear - BUILD.keelLayersFront) * (s / L);
    const a = d * (L / NK);
    keelArea += a;
    pts.push({ m: sigma * layers * a, x: -s, y: -d / 2, z: 0 });
  }
  const paperMass = pts.reduce((acc, p) => acc + p.m, 0);
  const weightPosBody = [-wS, -keelDepthAt(wS) / 2, 0];
  if (wMass > 0) pts.push({ m: wMass, x: weightPosBody[0], y: weightPosBody[1], z: 0 });

  // ---- 全体の重さ・重心・慣性モーメント ----
  let mass = 0, cx = 0, cy = 0, cz = 0;
  for (const p of pts) { mass += p.m; cx += p.m * p.x; cy += p.m * p.y; cz += p.m * p.z; }
  cx /= mass; cy /= mass; cz /= mass;
  let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
  for (const p of pts) {
    const x = p.x - cx, y = p.y - cy, z = p.z - cz;
    Ixx += p.m * (y * y + z * z);
    Iyy += p.m * (x * x + z * z);
    Izz += p.m * (x * x + y * y);
    Ixy -= p.m * x * y;
    Ixz -= p.m * x * z;
    Iyz -= p.m * y * z;
  }
  // 紙の厚みや折り目のふくらみによる最小の慣性（数値の安定のため。ごく小さい値）
  const Imin = mass * 1e-6;
  Ixx += Imin; Iyy += Imin; Izz += Imin;
  const I = [Ixx, Ixy, Ixz, Ixy, Iyy, Iyz, Ixz, Iyz, Izz];
  const Iinv = invert3(I);

  // ---- 空気力を受ける面（要素）----
  // pos: 1/4翼弦点、c: 翼弦方向（前縁向き）、n: 面の法線、s: 翼幅方向。すべて単位ベクトル。
  const elements = [];
  const aWing = liftSlope(AR, sweep);
  const wingStall = stallAngle(AR);
  const kWing = liftDragFactor(aWing, AR);
  for (const side of [1, -1]) {
    // 翼幅方向（外向き）と面の法線
    const ox = 0, oy = sinD, oz = side * cosD; // 後退角0のときの外向き
    const nrm = [0, cosD, -side * sinD];
    // 後退角：1/4翼弦線に沿う向き s と、それに直角な翼弦方向 c
    const sv = [-sinS, cosS * oy, cosS * oz];
    const cv = [cosS, sinS * oy, sinS * oz];
    for (let i = 0; i < N; i++) {
      const eta = ((i + 0.5) / N) * half;
      const c = chordAt(eta);
      const area = c * (half / N);
      const p = wingPoint(eta, 0.25, side);
      elements.push(makeElement({
        kind: 'wing', pos: p, c: cv, n: nrm, s: sv,
        area, chord: c * cosS, span: half / N / cosS,
        slope: aWing / cosS, stall: wingStall / cosS, cd0: AERO.cd0Surface, k: kWing * cosS * cosS,
      }));
    }
  }
  const nWing = elements.length;
  const aTail = liftSlope(tailAR, 0);
  const kTail = liftDragFactor(aTail, tailAR);
  for (const side of [1, -1]) {
    const eta = tHalf / 2;
    const c = tailChordAt(eta);
    const p = tailPoint(eta, 0.25, side);
    elements.push(makeElement({
      kind: 'tail', pos: p, c: [cosT, -sinT, 0], n: [sinT, cosT, 0], s: [0, 0, side],
      area: tailArea / 2, chord: c, span: tHalf,
      slope: aTail, stall: stallAngle(tailAR), cd0: AERO.cd0Surface, k: kTail, downwash: true,
    }));
  }
  {
    const h = fH / 2;
    const c = finChordAt(h);
    const aFin = liftSlope(finAR, 0);
    elements.push(makeElement({
      kind: 'fin', pos: finPoint(h, 0.25), c: [1, 0, 0], n: [0, 0, 1], s: [0, 1, 0],
      area: finArea, chord: c, span: fH,
      slope: aFin, stall: stallAngle(finAR), cd0: AERO.cd0Surface, k: liftDragFactor(aFin, finAR),
    }));
  }
  {
    // 胴体の側面（細長い板）。細長物体の理論：傾斜 = πAR/2、横風成分は平板の抗力
    const meanDepth = keelArea / L;
    const kAR = (2 * meanDepth * meanDepth) / keelArea; // 主翼が鏡の役をする
    const aK = (Math.PI * kAR) / 2;
    // 面積の中心（横風による力のかかる位置）
    let sc = 0;
    for (let i = 0; i < NK; i++) {
      const s = ((i + 0.5) / NK) * L;
      sc += s * keelDepthAt(s) * (L / NK);
    }
    sc /= keelArea;
    elements.push(makeElement({
      kind: 'body', pos: [-0.25 * L, -meanDepth / 2, 0], c: [1, 0, 0], n: [0, 0, 1], s: [0, 1, 0],
      area: keelArea, chord: L, span: meanDepth,
      slope: aK, stall: 0, cd0: AERO.cd0Body, k: 0, slender: true, centroidFrac: sc / L,
    }));
  }
  // 重心を原点に直す
  for (const e of elements) { e.rx -= cx; e.ry -= cy; e.rz -= cz; }

  // ---- 地面に触れる点（重心基準）----
  const contactsNose = [
    [0, 0, 0], [-L, 0, 0], [-BUILD.keelDeepest * L, -BUILD.keelDepth, 0], [-L, -BUILD.keelDepth * BUILD.keelTailDepth, 0],
    wingPoint(half, 0, 1), wingPoint(half, 1, 1), wingPoint(half, 0, -1), wingPoint(half, 1, -1),
    finPoint(fH, 0), finPoint(fH, 1), tailPoint(tHalf, 1, 1), tailPoint(tHalf, 1, -1),
  ];
  const contacts = contactsNose.map((p) => [p[0] - cx, p[1] - cy, p[2] - cz]);

  // ---- 描画用の形（機首原点）----
  const geometry = {
    length: L,
    wing: {
      right: [wingPoint(0, 0, 1), wingPoint(half, 0, 1), wingPoint(half, 1, 1), wingPoint(0, 1, 1)],
      left: [wingPoint(0, 0, -1), wingPoint(half, 0, -1), wingPoint(half, 1, -1), wingPoint(0, 1, -1)],
    },
    tail: {
      right: [tailPoint(0, 0, 1), tailPoint(tHalf, 0, 1), tailPoint(tHalf, 1, 1), tailPoint(0, 1, 1)],
      left: [tailPoint(0, 0, -1), tailPoint(tHalf, 0, -1), tailPoint(tHalf, 1, -1), tailPoint(0, 1, -1)],
    },
    fin: [finPoint(0, 0), finPoint(fH, 0), finPoint(fH, 1), finPoint(0, 1)],
    keel: keelOutline(),
    weight: { pos: weightPosBody, mass: wMass },
    cg: [cx, cy, cz],
  };

  const ac = {
    setup, mass, paperMass, cg: [cx, cy, cz], I, Iinv,
    elements, nWing, wingArea, wingAR: AR, mac, tailArea, finArea, keelArea,
    contacts, geometry,
  };
  ac.info = null; // analyzeDesign() が必要なときに計算する
  return ac;
}

function keelOutline() {
  const L = BUILD.fuselageLength;
  return [
    [0, 0, 0],
    [-BUILD.keelDeepest * L, -BUILD.keelDepth, 0],
    [-L, -BUILD.keelDepth * BUILD.keelTailDepth, 0],
    [-L, 0, 0],
  ];
}

function makeElement(o) {
  const a = o.slope;
  return {
    kind: o.kind,
    rx: o.pos[0], ry: o.pos[1], rz: o.pos[2],
    cx: o.c[0], cy: o.c[1], cz: o.c[2],
    nx: o.n[0], ny: o.n[1], nz: o.n[2],
    sx: o.s[0], sy: o.s[1], sz: o.s[2],
    area: o.area, chord: o.chord, span: o.span,
    a, stall: o.stall, stallW: AERO.stallWidthDeg * D2R,
    cd0: o.cd0, k: o.k,
    downwash: !!o.downwash, slender: !!o.slender, centroidFrac: o.centroidFrac || 0.5,
    // 翼弦まわりの回転を弱める力（薄翼理論：M = -(π/8) ρ V c^3 × 回転の速さ、有限翼の割合で補正）
    damp: (Math.PI / 8) * PHYS.rho * o.chord ** 3 * o.span * Math.min(1, a / (2 * Math.PI)),
  };
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const id = 1 / det;
  return [
    A * id, (c * h - b * i) * id, (b * f - c * e) * id,
    B * id, (a * i - c * g) * id, (c * d - a * f) * id,
    C * id, (b * g - a * h) * id, (a * e - b * d) * id,
  ];
}
