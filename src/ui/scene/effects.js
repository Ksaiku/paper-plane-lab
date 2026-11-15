// 3Dの効果：風の粒・上昇気流の見える化・着地の目印。
// 風の動きは core/wind.js の風の場（makeWind）をそのまま使う。見た目のための別の風は作らない。
// 描画命令は最大 12 本（風の筋1・綿毛1・上昇気流3・目印の地面1・旗と棒1・文字ラベル最大4）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeWind, meanWindVector, makeRng } from '../../core/wind.js';
import { ENV } from '../../core/config.js';
import { makeLabelSprite } from './label.js';

// ---- 調整値 ----
const STREAKS = 560;          // 風の筋の本数
const BOX_H = 12;             // 筋の箱：focus から水平 ±12m
const BOX_Y0 = 0.2, BOX_Y1 = 9;
const STREAK_SEC = 0.12;      // 筋の長さ ＝ 風の速さ × この秒数
const STREAK_MIN = 0.14;      // ごく弱い風でも見える最小の長さ [m]
const FLAKES = 32;            // 綿毛・葉のかけら
const FLAKE_BOX = 8;
const FLAKE_Y0 = 0.3, FLAKE_Y1 = 6;
const TH_PARTICLES = 64;      // 上昇気流1本あたりの粒
const TH_HEIGHT = 12;         // 粒が上る高さ [m]
const TH_COLUMN = 15;         // 光の柱の高さ [m]
const MAX_MARKERS = 4;
const FLAG_SEG = 6;
const VERT_PER_MARKER = 8 + (FLAG_SEG + 1) * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

function darken(hex, k) {
  const c = new THREE.Color(hex);
  const to = (v) => Math.round(Math.pow(v * k, 1 / 2.2) * 255).toString(16).padStart(2, '0');
  return '#' + to(c.r) + to(c.g) + to(c.b);
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createEffects(scene) {
  const root = new THREE.Group();
  root.name = 'effects';
  scene.add(root);

  const rng = makeRng(20240611);
  const out = [0, 0, 0];
  let now = 0;
  let setup = { windSpeed: 0, windDir: 0, updraft: false };
  let wind = null;
  let windOn = false;
  let thermalOn = false;
  let needInit = true;
  const lastFocus = new THREE.Vector3(1e9, 0, 0);
  const pxScale = { value: 900 };

  // =========================================================
  // 1. 風の筋
  // =========================================================
  const sPos = new Float32Array(STREAKS * 3);        // 筋の先頭の位置（正本）
  const sSeed = new Float32Array(STREAKS);
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const lineAlpha = new THREE.BufferAttribute(new Float32Array(STREAKS * 2), 1).setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('position', linePos);
  lineGeo.setAttribute('aAlpha', lineAlpha);
  for (let i = 0; i < STREAKS; i++) sSeed[i] = 0.5 + 0.5 * rng();
  const lineMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(1.0, 1.0, 1.0) }, uOpacity: { value: 1.0 } },
    vertexShader: `attribute float aAlpha; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        vA = aAlpha * smoothstep(0.3, 1.4, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  lines.visible = false;
  root.add(lines);

  // 綿毛（板ポリゴンが回りながら流れる）
  const fluffTex = canvasTexture(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2.2; g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
      g.lineTo(Math.cos(a) * 54, Math.sin(a) * 54); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.arc(Math.cos(a) * 54, Math.sin(a) * 54, 3.2, 0, 7); g.fill();
    }
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 20);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill();
  });
  const flakeMat = new THREE.MeshBasicMaterial({
    map: fluffTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9, alphaTest: 0.01,
  });
  const flakes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flakeMat, FLAKES);
  flakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flakes.frustumCulled = false;
  flakes.visible = false;
  flakes.renderOrder = 3;
  root.add(flakes);
  const fPos = new Float32Array(FLAKES * 3);
  const fRot = new Float32Array(FLAKES * 3);
  const fSpin = new Float32Array(FLAKES * 3);
  const fSize = new Float32Array(FLAKES);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < FLAKES; i++) {
    fSize[i] = 0.16 + 0.14 * rng();
    for (let k = 0; k < 3; k++) { fRot[i * 3 + k] = rng() * 6.28; fSpin[i * 3 + k] = (rng() - 0.5) * 5; }
  }

  function initParticles(focus) {
    for (let i = 0; i < STREAKS; i++) {
      sPos[i * 3] = focus.x + (rng() * 2 - 1) * BOX_H;
      sPos[i * 3 + 1] = BOX_Y0 + Math.pow(rng(), 1.5) * (BOX_Y1 - BOX_Y0);
      sPos[i * 3 + 2] = focus.z + (rng() * 2 - 1) * BOX_H;
    }
    for (let i = 0; i < FLAKES; i++) {
      fPos[i * 3] = focus.x + (rng() * 2 - 1) * FLAKE_BOX;
      fPos[i * 3 + 1] = FLAKE_Y0 + rng() * (FLAKE_Y1 - FLAKE_Y0);
      fPos[i * 3 + 2] = focus.z + (rng() * 2 - 1) * FLAKE_BOX;
    }
  }

  function updateWind(dt, time, focus) {
    const U = setup.windSpeed;
    const strength = 0.6 + 0.4 * Math.min(1, U / 3);      // 弱い風ではうすく
    const fx = focus.x, fz = focus.z;
    for (let i = 0; i < STREAKS; i++) {
      const o = i * 3;
      let x = sPos[o], y = sPos[o + 1], z = sPos[o + 2];
      wind(x, y, z, time, out);
      const vx = out[0], vy = out[1], vz = out[2];
      x += vx * dt; y += vy * dt; z += vz * dt;
      let dx = x - fx, dz = z - fz;
      while (dx > BOX_H) { dx -= 2 * BOX_H; x -= 2 * BOX_H; }
      while (dx < -BOX_H) { dx += 2 * BOX_H; x += 2 * BOX_H; }
      while (dz > BOX_H) { dz -= 2 * BOX_H; z -= 2 * BOX_H; }
      while (dz < -BOX_H) { dz += 2 * BOX_H; z += 2 * BOX_H; }
      if (y < BOX_Y0 || y > BOX_Y1) {
        y = BOX_Y0 + Math.pow(rng(), 1.5) * (BOX_Y1 - BOX_Y0);
        x = fx + (rng() * 2 - 1) * BOX_H; z = fz + (rng() * 2 - 1) * BOX_H;
        dx = x - fx; dz = z - fz;
      }
      sPos[o] = x; sPos[o + 1] = y; sPos[o + 2] = z;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      let len = sp * STREAK_SEC;
      if (len < STREAK_MIN) len = STREAK_MIN;
      const inv = sp > 1e-4 ? len / sp : 0;
      const k = i * 6;
      const pa = linePos.array;
      pa[k] = x; pa[k + 1] = y; pa[k + 2] = z;
      pa[k + 3] = x - vx * inv; pa[k + 4] = y - vy * inv; pa[k + 5] = z - vz * inv;
      // 箱のふちと、地面・上端の近くでは消えて、ぱっと現れない
      const ax = (BOX_H - Math.abs(dx)) / 3, az = (BOX_H - Math.abs(dz)) / 3;
      let f = ax < az ? ax : az;
      const fy0 = (y - BOX_Y0) / 0.8, fy1 = (BOX_Y1 - y) / 1.8;
      if (fy0 < f) f = fy0;
      if (fy1 < f) f = fy1;
      f = smooth(f);
      const a = f * sSeed[i] * strength * (0.78 + 0.22 * Math.sin(time * 1.7 + i * 1.3));
      lineAlpha.array[i * 2] = a;
      lineAlpha.array[i * 2 + 1] = a * 0.12;           // しっぽはうすく
    }
    linePos.needsUpdate = true;
    lineAlpha.needsUpdate = true;
    lineMat.uniforms.uOpacity.value = 0.75 + 0.25 * Math.min(1, U / 3);

    for (let i = 0; i < FLAKES; i++) {
      const o = i * 3;
      let x = fPos[o], y = fPos[o + 1], z = fPos[o + 2];
      wind(x, y, z, time, out);
      x += out[0] * dt; y += (out[1] - 0.08) * dt; z += out[2] * dt;
      let dx = x - fx, dz = z - fz;
      while (dx > FLAKE_BOX) { dx -= 2 * FLAKE_BOX; x -= 2 * FLAKE_BOX; }
      while (dx < -FLAKE_BOX) { dx += 2 * FLAKE_BOX; x += 2 * FLAKE_BOX; }
      while (dz > FLAKE_BOX) { dz -= 2 * FLAKE_BOX; z -= 2 * FLAKE_BOX; }
      while (dz < -FLAKE_BOX) { dz += 2 * FLAKE_BOX; z += 2 * FLAKE_BOX; }
      if (y < FLAKE_Y0 || y > FLAKE_Y1) {
        y = FLAKE_Y0 + rng() * (FLAKE_Y1 - FLAKE_Y0);
        x = fx + (rng() * 2 - 1) * FLAKE_BOX; z = fz + (rng() * 2 - 1) * FLAKE_BOX;
        dx = x - fx; dz = z - fz;
      }
      fPos[o] = x; fPos[o + 1] = y; fPos[o + 2] = z;
      const rr = fRot[o] += fSpin[o] * dt * 0.6 * (0.4 + U * 0.3);
      fRot[o + 1] += fSpin[o + 1] * dt * 0.6 * (0.4 + U * 0.3);
      fRot[o + 2] += fSpin[o + 2] * dt * 0.6 * (0.4 + U * 0.3);
      const ax = (FLAKE_BOX - Math.abs(dx)) / 2.5, az = (FLAKE_BOX - Math.abs(dz)) / 2.5;
      let f = ax < az ? ax : az;
      const fy0 = (y - FLAKE_Y0) / 0.6, fy1 = (FLAKE_Y1 - y) / 1.2;
      if (fy0 < f) f = fy0;
      if (fy1 < f) f = fy1;
      const s = fSize[i] * smooth(f);
      dummy.position.set(x, y, z);
      dummy.rotation.set(rr, fRot[o + 1], fRot[o + 2]);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      flakes.setMatrixAt(i, dummy.matrix);
    }
    flakes.instanceMatrix.needsUpdate = true;
  }

  // =========================================================
  // 2. 上昇気流
  // =========================================================
  const thermals = ENV.thermals;
  const thGroup = new THREE.Group();
  thGroup.visible = false;
  root.add(thGroup);

  const discTex = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const rho = Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2;   // 0..1（四角の内接円）
      const d = rho * 2;                                                      // 半径 r を 1 とした距離
      let a = Math.exp(-d * d * 1.1) * 0.8;
      a += 0.35 * Math.exp(-Math.pow((d - 1.0) / 0.07, 2));                   // うすい輪（柱の半径）
      a *= 1 - smooth((rho - 0.85) / 0.15);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.min(1, a) * 255;
    }
    g.putImageData(img, 0, 0);
  });
  const discGeos = [], colGeos = [];
  for (const th of thermals) {
    const pg = new THREE.PlaneGeometry(th.r * 4, th.r * 4);
    pg.rotateX(-Math.PI / 2);
    pg.translate(th.x, 0.012, th.z);
    discGeos.push(pg);
    const cg = new THREE.CylinderGeometry(th.r * 0.8, th.r * 0.8, TH_COLUMN, 28, 1, true);
    cg.translate(th.x, TH_COLUMN / 2, th.z);
    colGeos.push(cg);
  }
  const discMat = new THREE.MeshBasicMaterial({
    map: discTex, color: new THREE.Color(1.0, 0.62, 0.28), transparent: true, opacity: 0.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false,
  });
  const discs = new THREE.Mesh(mergeGeometries(discGeos), discMat);
  discs.frustumCulled = false; discs.renderOrder = 1;
  thGroup.add(discs);

  const colMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.78, 0.45) }, uOpacity: { value: 0.3 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalMatrix * normal;
        vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        float vert = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.5);
        gl_FragColor = vec4(uColor, uOpacity * vert * pow(f, 1.7)); }`,
  });
  const columns = new THREE.Mesh(mergeGeometries(colGeos), colMat);
  columns.frustumCulled = false; columns.renderOrder = 2;
  thGroup.add(columns);

  const TP = thermals.length * TH_PARTICLES;
  const tAng = new Float32Array(TP), tRho = new Float32Array(TP), tY = new Float32Array(TP), tSize = new Float32Array(TP), tPh = new Float32Array(TP);
  for (let i = 0; i < TP; i++) {
    tAng[i] = rng() * 6.283; tRho[i] = 0.12 + 0.9 * Math.sqrt(rng()); tY[i] = rng() * TH_HEIGHT;
    tSize[i] = 0.09 + 0.08 * rng(); tPh[i] = rng();
  }
  const tGeo = new THREE.BufferGeometry();
  const tPos = new THREE.BufferAttribute(new Float32Array(TP * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const tAlpha = new THREE.BufferAttribute(new Float32Array(TP), 1).setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tPos);
  tGeo.setAttribute('aAlpha', tAlpha);
  tGeo.setAttribute('aSize', new THREE.BufferAttribute(tSize, 1));
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.74, 0.3) }, uScale: pxScale },
    vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        float d = max(-mv.z, 0.1);
        float world = aSize * (1.0 + d / 18.0);
        gl_PointSize = clamp(world * uScale / d, 2.0, 48.0);
        vA = aAlpha * smoothstep(0.4, 1.5, d);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d); a *= a;
        gl_FragColor = vec4(uColor, a * vA * 0.95); }`,
  });
  const tPoints = new THREE.Points(tGeo, tMat);
  tPoints.frustumCulled = false; tPoints.renderOrder = 2;
  thGroup.add(tPoints);

  function updateThermal(dt, time) {
    for (let k = 0; k < thermals.length; k++) {
      const th = thermals[k];
      for (let j = 0; j < TH_PARTICLES; j++) {
        const i = k * TH_PARTICLES + j;
        const rho = tRho[i];
        const hf = Math.min(1, tY[i] / ENV.thermalFullHeight);
        const vUp = th.w * Math.exp(-rho * rho) * Math.max(hf, 0.35);     // 実際の上昇速度に合わせる
        let y = tY[i] + vUp * dt;
        if (y > TH_HEIGHT) y -= TH_HEIGHT;
        tY[i] = y;
        const ang = tAng[i] += dt * 0.75 * (1.15 - rho * 0.6);
        const rad = rho * th.r * (0.92 + 0.06 * Math.sin(time * 0.8 + tPh[i] * 6.28));
        const o = i * 3;
        tPos.array[o] = th.x + Math.cos(ang) * rad;
        tPos.array[o + 1] = y + 0.1;
        tPos.array[o + 2] = th.z + Math.sin(ang) * rad;
        tAlpha.array[i] = smooth(y / 1.2) * smooth((TH_HEIGHT - y) / 3) * (0.5 + 0.5 * tPh[i]);
      }
    }
    tPos.needsUpdate = true;
    tAlpha.needsUpdate = true;
    discMat.opacity = 0.46 + 0.06 * Math.sin(time * 1.1);
  }

  // =========================================================
  // 3. 着地の目印
  // =========================================================
  // 地面：1枚のメッシュに、輪＋波紋2枚 × 4個ぶんの四角をまとめる
  const QUADS = MAX_MARKERS * 3;
  const gPos = new THREE.BufferAttribute(new Float32Array(QUADS * 12), 3).setUsage(THREE.DynamicDrawUsage);
  const gUv = new THREE.BufferAttribute(new Float32Array(QUADS * 8), 2);
  const gCol = new THREE.BufferAttribute(new Float32Array(QUADS * 16), 4).setUsage(THREE.DynamicDrawUsage);
  const gIdx = [];
  for (let q = 0; q < QUADS; q++) {
    const b = q * 4;
    gIdx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    const half = q % 3 === 0 ? 0 : 0.5;                 // 左半分＝輪＋塗り、右半分＝輪だけ（波紋用）
    const u0 = half, u1 = half + 0.5;
    gUv.setXY(b, u0, 0); gUv.setXY(b + 1, u1, 0); gUv.setXY(b + 2, u1, 1); gUv.setXY(b + 3, u0, 1);
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', gPos); gGeo.setAttribute('uv', gUv); gGeo.setAttribute('color', gCol);
  gGeo.setIndex(gIdx);
  const ringTex = canvasTexture(512, 256, (g, w, h) => {
    const half = w / 2;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const left = x < half;
      const lx = (left ? x : x - half) + 0.5;
      const rho = Math.hypot(lx / half - 0.5, (y + 0.5) / h - 0.5) * 2;     // 0..1
      let a;
      if (left) {
        a = Math.exp(-Math.pow((rho - 0.84) / 0.07, 2));                   // 輪
        if (rho < 0.8) a = Math.max(a, 0.2 + 0.1 * rho);                   // うすい塗り
      } else {
        a = Math.exp(-Math.pow((rho - 0.84) / 0.06, 2));
      }
      a *= 1 - smooth((rho - 0.93) / 0.07);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.min(1, a) * 255;
    }
    g.putImageData(img, 0, 0);
  });
  const gMat = new THREE.MeshBasicMaterial({
    map: ringTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.frustumCulled = false; ground.renderOrder = 2;
  root.add(ground);

  // 棒と旗：1枚のメッシュ（旗は毎コマ頂点を動かす）
  const pfPos = new THREE.BufferAttribute(new Float32Array(MAX_MARKERS * VERT_PER_MARKER * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const pfNor = new THREE.BufferAttribute(new Float32Array(MAX_MARKERS * VERT_PER_MARKER * 3), 3);
  const pfCol = new THREE.BufferAttribute(new Float32Array(MAX_MARKERS * VERT_PER_MARKER * 3), 3);
  const pfIdx = [];
  for (let m = 0; m < MAX_MARKERS; m++) {
    const b = m * VERT_PER_MARKER;
    for (let c = 0; c < 4; c++) {                       // 棒の4面
      const c2 = (c + 1) % 4;
      pfIdx.push(b + c, b + c2, b + 4 + c, b + c2, b + 4 + c2, b + 4 + c);
    }
    for (let i = 0; i < FLAG_SEG; i++) {
      const a = b + 8 + i * 2;
      pfIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const pfGeo = new THREE.BufferGeometry();
  pfGeo.setAttribute('position', pfPos); pfGeo.setAttribute('normal', pfNor); pfGeo.setAttribute('color', pfCol);
  pfGeo.setIndex(pfIdx);
  const pfMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  const poleFlag = new THREE.Mesh(pfGeo, pfMat);
  poleFlag.castShadow = true;
  poleFlag.frustumCulled = false;
  root.add(poleFlag);

  const poleColor = new THREE.Color('#f3efe4');
  const slots = [];
  for (let i = 0; i < MAX_MARKERS; i++) {
    slots.push({ active: false, x: 0, y: 0, z: 0, color: new THREE.Color(), tint: new THREE.Color(), current: false, t0: 0, sprite: null, key: '', base: [1, 1] });
  }
  // 旗の向き（風下。風がなければ右 +z）
  let fdx = 0, fdz = 1;

  function setLandingMarkers(list) {
    const n = Math.min(list ? list.length : 0, MAX_MARKERS);
    for (let i = 0; i < MAX_MARKERS; i++) {
      const s = slots[i];
      if (i >= n) {
        if (s.active) hideSlot(i);
        continue;
      }
      const m = list[i];
      const moved = !s.active || s.x !== m.pos[0] || s.z !== m.pos[2] || s.current !== !!m.current;
      s.x = m.pos[0]; s.y = m.pos[1]; s.z = m.pos[2];
      s.current = !!m.current;
      s.color.set(m.color || '#ff7a2f');
      s.tint.copy(s.color);
      if (!s.current) s.tint.lerp(new THREE.Color('#9aa3ad'), 0.25);
      if (moved) s.t0 = now;
      s.active = true;
      const key = `${m.label}|${m.color}|${s.current}`;
      if (key !== s.key) {
        s.key = key;
        if (s.sprite) { root.remove(s.sprite); s.sprite.material.map?.dispose(); s.sprite.material.dispose(); }
        const h = s.current ? 0.3 : 0.22;
        s.sprite = makeLabelSprite(String(m.label ?? ''), { fontSize: 64, color: '#ffffff', bg: darken(m.color || '#ff7a2f', 0.5), height: h, padding: 0.3 });
        s.sprite.renderOrder = 5;
        s.sprite.material.opacity = s.current ? 1 : 0.82;
        s.base = [s.sprite.scale.x, s.sprite.scale.y];
        root.add(s.sprite);
      }
      s.sprite.visible = true;
      // 色（旗・棒）は固定なので、ここで書く
      for (let v = 0; v < VERT_PER_MARKER; v++) {
        const c = v < 8 ? poleColor : s.tint;
        pfCol.setXYZ(i * VERT_PER_MARKER + v, c.r, c.g, c.b);
      }
    }
    pfCol.needsUpdate = true;
  }

  function hideSlot(i) {
    const s = slots[i];
    s.active = false; s.key = '';
    if (s.sprite) s.sprite.visible = false;
    for (let v = 0; v < VERT_PER_MARKER; v++) pfPos.setXYZ(i * VERT_PER_MARKER + v, 0, 0, 0);
    for (let q = 0; q < 3; q++) for (let c = 0; c < 4; c++) {
      const b = (i * 3 + q) * 4 + c;
      gPos.setXYZ(b, 0, 0, 0); gCol.setW(b, 0);
    }
    pfPos.needsUpdate = true; gPos.needsUpdate = true; gCol.needsUpdate = true;
  }
  for (let i = 0; i < MAX_MARKERS; i++) hideSlot(i);

  const CX = [-1, 1, 1, -1], CZ = [-1, -1, 1, 1];
  function writeQuad(q, cx, y, cz, half, r, g, b, a) {
    for (let c = 0; c < 4; c++) {
      const v = q * 4 + c;
      gPos.setXYZ(v, cx + CX[c] * half, y, cz + CZ[c] * half);
      gCol.setXYZW(v, r, g, b, a);
    }
  }

  function updateMarkers(time, camera) {
    const cp = camera.position;
    for (let i = 0; i < MAX_MARKERS; i++) {
      const s = slots[i];
      if (!s.active) continue;
      const dx = cp.x - s.x, dy = cp.y - s.y, dz = cp.z - s.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const appear = smooth((time - s.t0) / 0.45);
      const cur = s.current;
      const ringR = (cur ? 0.42 : 0.3) * (0.7 + 0.3 * appear);
      const far = Math.min(2.4, Math.max(1, dist / 22));      // 遠いときは輪を少し大きく
      const half = (ringR / 0.84) * far;
      const gy = s.y + 0.015;
      const alpha = (cur ? 0.95 : 0.55) * appear;
      writeQuad(i * 3, s.x, gy, s.z, half, s.color.r, s.color.g, s.color.b, alpha);
      if (cur) {                                               // 波紋：ゆっくり広がって消える
        for (let w = 0; w < 2; w++) {
          const ph = (time * 0.5 + w * 0.5) % 1;
          const e = 1 - ph;
          writeQuad(i * 3 + 1 + w, s.x, gy + 0.001, s.z, half * (1 + 1.5 * ph), s.color.r, s.color.g, s.color.b, 0.6 * e * e * appear);
        }
      } else {
        writeQuad(i * 3 + 1, s.x, gy, s.z, 0, 0, 0, 0, 0);
        writeQuad(i * 3 + 2, s.x, gy, s.z, 0, 0, 0, 0, 0);
      }

      // 棒と旗
      const sc = cur ? 1 : 0.72;
      const H = 1.1 * sc * appear;
      const pr = 0.011;
      const b = i * VERT_PER_MARKER;
      for (let c = 0; c < 4; c++) {
        const ox = c === 0 || c === 3 ? -pr : pr, oz = c < 2 ? -pr : pr;
        pfPos.setXYZ(b + c, s.x + ox, s.y, s.z + oz);
        pfPos.setXYZ(b + 4 + c, s.x + ox, s.y + H, s.z + oz);
        pfNor.setXYZ(b + c, ox > 0 ? 0.7 : -0.7, 0, oz > 0 ? 0.7 : -0.7);
        pfNor.setXYZ(b + 4 + c, ox > 0 ? 0.7 : -0.7, 0, oz > 0 ? 0.7 : -0.7);
      }
      const L = 0.38 * sc * appear, Hf = 0.24 * sc * appear;
      const amp = (cur ? 0.045 : 0.015) * sc;
      const nx = -fdz, nz = fdx;
      for (let k = 0; k <= FLAG_SEG; k++) {
        const u = k / FLAG_SEG;
        const wave = amp * u * Math.sin(time * (cur ? 7 : 4) - u * 5 + i);
        const along = pr + u * L;
        const topY = s.y + H, botY = s.y + H - Hf * (1 - u) - 0.012 * u * u * sc;
        const v0 = b + 8 + k * 2;
        pfPos.setXYZ(v0, s.x + fdx * along + nx * wave, topY, s.z + fdz * along + nz * wave);
        pfPos.setXYZ(v0 + 1, s.x + fdx * along + nx * wave, botY, s.z + fdz * along + nz * wave);
        pfNor.setXYZ(v0, nx, 0, nz); pfNor.setXYZ(v0 + 1, nx, 0, nz);
      }

      // 文字ラベル：遠いほど大きくして読めるように
      const kk = Math.min(6, Math.max(1, dist / 7));
      const sp = s.sprite;
      sp.scale.set(s.base[0] * kk * appear, s.base[1] * kk * appear, 1);
      sp.position.set(s.x, s.y + H + 0.1 + 0.5 * s.base[1] * kk, s.z);
    }
    gPos.needsUpdate = true; gCol.needsUpdate = true;
    pfPos.needsUpdate = true; pfNor.needsUpdate = true;
  }

  // =========================================================
  // 公開
  // =========================================================
  function setEnvironment(s) {
    setup = { windSpeed: s.windSpeed || 0, windDir: s.windDir || 0, updraft: !!s.updraft };
    wind = makeWind(setup);
    windOn = !!wind && setup.windSpeed > 0;
    thermalOn = setup.updraft;
    lines.visible = windOn;
    flakes.visible = windOn;
    thGroup.visible = thermalOn;
    needInit = true;
    if (windOn) {
      const m = meanWindVector(setup);
      const l = Math.hypot(m[0], m[2]) || 1;
      fdx = m[0] / l; fdz = m[2] / l;
    } else { fdx = 0; fdz = 1; }
  }

  function update(dt, time, focus, camera) {
    now = time;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    pxScale.value = (window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (needInit || focus.distanceToSquared(lastFocus) > 30 * 30) {
      initParticles(focus);
      needInit = false;
    }
    lastFocus.copy(focus);
    if (windOn) updateWind(dt, time, focus);
    if (thermalOn) updateThermal(dt, time);
    updateMarkers(time, camera);
  }

  return { setEnvironment, setLandingMarkers, update };
}
