// 機体・軌跡・矢印の単体表示。URL の ?case= で場面を切り替える。
//   basic speed floaty stunt fail / under / extreme1 extreme2 / flight / flightnear / trails
// 追加の見方：&dist=0.6（距離）&az=（横の角度°）&el=（上下の角度°）で機体の見る向きを変えられる（機体の場面のみ）
import * as THREE from 'three';
import { createRenderer, fitRenderer } from '../../../src/ui/scene/renderer.js';
import { createPlane } from '../../../src/ui/scene/plane.js';
import { createTrails } from '../../../src/ui/scene/trails.js';
import { createForceArrows } from '../../../src/ui/scene/arrows.js';
import { buildAircraft } from '../../../src/core/aircraft.js';
import { simulate, sampleFlight, makeSample } from '../../../src/core/sim.js';
import { presetSetup } from '../../../src/core/presets.js';
import { defaultSetup } from '../../../src/core/config.js';

const qs = new URLSearchParams(location.search);
const which = qs.get('case') || 'basic';

const canvas = document.getElementById('view') || Object.assign(document.body.appendChild(document.createElement('canvas')), { id: 'view' });
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.style.margin = '0';
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc8ee);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 600);

// ---- 地面・光 ----
const groundTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7fae5a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#76a552'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(200, 200);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
})();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.HemisphereLight(0xd6e8ff, 0xd9d6c4, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.003;
scene.add(sun, sun.target);
function aimSun(focus, half) {
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(new THREE.Vector3(-0.45, 0.8, 0.35).normalize().multiplyScalar(30));
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 80;
  c.updateProjectionMatrix();
}

// ---- 部品 ----
const plane = createPlane();
scene.add(plane.group);
const trails = createTrails(scene);
const arrows = createForceArrows();
scene.add(arrows.group);
arrows.setVisible(false);

function resize() {
  fitRenderer(renderer, camera);
  trails.setResolution(canvas.clientWidth, canvas.clientHeight);
}
addEventListener('resize', resize);
resize();

const SETUPS = {
  basic: () => presetSetup('basic'),
  speed: () => presetSetup('speed'),
  floaty: () => presetSetup('floaty'),
  stunt: () => presetSetup('stunt'),
  fail: () => presetSetup('fail'),
  under: () => presetSetup('basic'),
  extreme1: () => ({ ...defaultSetup(), wingSpan: 40, wingChord: 4 }),
  extreme2: () => ({ ...defaultSetup(), wingSpan: 10, wingChord: 12, wingSweep: 45, finHeight: 0.5, weightMass: 4, weightPos: 90 }),
  extreme3: () => ({ ...defaultSetup(), wingSpan: 40, wingChord: 12, wingSweep: 0, tailSpan: 18, finHeight: 8, weightMass: 0.1, weightPos: 0 }),
};

function look(target, offset) {
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

if (SETUPS[which]) {
  const ac = buildAircraft(SETUPS[which]());
  plane.rebuild(ac);
  const pos = [0, 1.2, 0];
  plane.setPose(pos, [1, 0, 0, 0]);
  const cgW = new THREE.Vector3(pos[0] + Number(qs.get('tx') ?? -0.035), pos[1] + Number(qs.get('ty') ?? -0.01), pos[2]); // 機体の中ほど
  const dist = Number(qs.get('dist') || 0.6);
  let az = qs.has('az') ? Number(qs.get('az')) : 35; // 機首の向きから右前へ
  let el = qs.has('el') ? Number(qs.get('el')) : 38;
  if (which === 'under' && !qs.has('el')) el = -32;
  if (which === 'under' && !qs.has('az')) az = 50;
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  look(cgW, new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(dist));
  aimSun(cgW, 3);
} else {
  const rec = simulate(presetSetup('basic'));
  const smp = makeSample();
  if (which === 'flight' || which === 'flightnear') {
    plane.rebuild(rec.aircraft);
    trails.start(rec, '#ff7a2f');
    trails.finish();
    const tm = rec.result.airtime * (which === 'flightnear' ? 0.3 : 0.5);
    sampleFlight(rec, tm, smp);
    plane.setPose(smp.pos, smp.quat);
    arrows.setVisible(true);
    const d = rec.result.distance;
    if (which === 'flight') {
      const mid = new THREE.Vector3(d / 2, 1.8, 0);
      const dz = Math.max(d * 0.62 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), 6);
      look(mid, new THREE.Vector3(0, 4.0, dz));
      aimSun(mid, d * 0.7);
    } else {
      const tgt = new THREE.Vector3(smp.pos[0], smp.pos[1], smp.pos[2]);
      look(tgt, new THREE.Vector3(0.9, 0.5, 1.7));
      aimSun(tgt, 4);
    }
    arrows.update(smp, rec.aircraft.mass, camera);
    window.__sample = { lift: smp.lift.slice(), drag: smp.drag.slice(), mass: rec.aircraft.mass };
  } else if (which === 'trails') {
    const base = presetSetup('basic');
    const runs = [
      { ...base, throwHeading: -9 },
      { ...base, weightPos: 0, weightMass: 3, throwHeading: -3 },
      { ...base, weightPos: 100, weightMass: 1.2, throwHeading: 4 },
      { ...presetSetup('fail'), throwHeading: 10 },
    ];
    let last = null;
    for (const s of runs) {
      const r = simulate(s);
      trails.start(r, trails.colorForNext());
      trails.finish();
      last = r;
    }
    window.__trails = trails.list();
    plane.rebuild(last.aircraft);
    const e = last.frames.n - 1;
    plane.setPose([last.frames.pos[3 * e], last.frames.pos[3 * e + 1], last.frames.pos[3 * e + 2]], [last.frames.quat[4 * e], last.frames.quat[4 * e + 1], last.frames.quat[4 * e + 2], last.frames.quat[4 * e + 3]]);
    const mid = new THREE.Vector3(8, 1.5, 0);
    look(mid, new THREE.Vector3(-9, 9, 13));
    aimSun(mid, 14);
  }
}

// 作り直しの速さを測る（--eval="__bench()"）
window.__bench = () => {
  const ac = buildAircraft(presetSetup('basic'));
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) { const a = buildAircraft({ ...presetSetup('basic'), wingSpan: 20 + (i % 10) }); plane.rebuild(a); }
  void ac;
  return (performance.now() - t0) / 200;
};

// 再生のテスト（?play=1）：軌跡が時間とともに伸びる様子と矢印の更新を毎コマ呼ぶ
if (qs.has('play')) {
  const rec = simulate(presetSetup('basic'));
  trails.start(rec, '#ff7a2f');
  plane.rebuild(rec.aircraft);
  arrows.setVisible(true);
  const smp = makeSample();
  const t0 = performance.now();
  const frame = () => {
    const t = ((performance.now() - t0) / 1000) * 2;
    trails.setTime(t);
    sampleFlight(rec, Math.min(t, rec.result.airtime), smp);
    plane.setPose(smp.pos, smp.quat);
    arrows.update(smp, rec.aircraft.mass, camera);
    look(new THREE.Vector3(smp.pos[0], smp.pos[1], smp.pos[2]), new THREE.Vector3(-1.2, 0.7, 1.4));
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  frame();
} else {
  renderer.render(scene, camera);
  window.__done = true;
}
