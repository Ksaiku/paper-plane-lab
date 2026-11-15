// 風の粒・上昇気流・着地の目印の単体表示。?case=wind2|wind6|thermal|markers|all  （&cam=far で別の見え方）
import * as THREE from 'three';
import { createRenderer, fitRenderer } from '../../../src/ui/scene/renderer.js';
import { createEffects } from '../../../src/ui/scene/effects.js';

const q = new URLSearchParams(location.search);
const kase = q.get('case') || 'wind2';
const canvas = document.getElementById('view');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc9ee);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);

// 地面（市松もよう）
const tex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5fae4e'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#58a548'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(100, 100); t.anisotropy = 8;
  return t;
})();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ map: tex }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b8f55, 1.2));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.position.set(-10, 25, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
scene.add(sun, sun.target);

const plane = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
plane.rotation.z = -Math.PI / 2; plane.castShadow = true;
scene.add(plane);

const fx = createEffects(scene);
const focus = new THREE.Vector3();
const marks = [
  { pos: [9, 0, 0.8], color: '#ff7a2f', label: '8.4m', current: true },
  { pos: [14, 0, -1.6], color: '#2f80ed', label: '13.8m', current: false },
  { pos: [19, 0, 1.9], color: '#27ae60', label: '19.2m', current: false },
  { pos: [24.5, 0, -0.6], color: '#9b51e0', label: '24.6m', current: false },
];
const cfg = {
  wind2: { env: { windSpeed: 2, windDir: 90, updraft: false }, move: true, off: [-4.5, 0.8, 2.4] },
  wind6: { env: { windSpeed: 6, windDir: 0, updraft: false }, move: true, off: [-3.2, 0.9, 3.2] },
  thermal: { env: { windSpeed: 0, windDir: 0, updraft: true }, focus: [16, 3, 0], cam: [-14, 5, -12], look: [30, 5, 0] },
  markers: { env: { windSpeed: 0, windDir: 0, updraft: false }, markers: marks, focus: [10, 1.5, 0], cam: [-1.5, 1.4, 1.5], look: [12, 0.5, 0] },
  all: { env: { windSpeed: 2, windDir: 90, updraft: true }, markers: marks, focus: [12, 2, 0], cam: [-5, 3, -5], look: [20, 1.5, 0] },
}[kase];
if (q.get('cam') === 'far' && cfg.markers) { cfg.cam = [-2, 2.2, -3]; cfg.look = [26, 0.5, 0]; }
if (q.get('cam') === 'near' && cfg.markers) { cfg.cam = [5.5, 1.0, 2.2]; cfg.look = [10, 0.6, 0]; }
fx.setEnvironment(cfg.env);
fx.setLandingMarkers(cfg.markers || []);
if (cfg.focus) focus.set(...cfg.focus);

let last = performance.now() / 1000;
const t0 = last;
function frame() {
  fitRenderer(renderer, camera);
  const nowS = performance.now() / 1000;
  const dt = nowS - last; last = nowS;
  const time = nowS - t0;
  if (cfg.move) {
    focus.set(time * 4, 1.6 + Math.sin(time) * 0.2, 0);
    camera.position.set(focus.x + cfg.off[0], cfg.off[1], focus.z + cfg.off[2]);
    camera.lookAt(focus.x + 1.5, focus.y - 0.2, focus.z - 0.5);
  } else {
    camera.position.set(...cfg.cam);
    camera.lookAt(...cfg.look);
  }
  plane.position.copy(focus);
  sun.position.set(focus.x - 10, 25, focus.z + 12);
  sun.target.position.copy(focus);
  fx.update(dt, time, focus, camera);
  renderer.render(scene, camera);
  window.__calls = renderer.info.render.calls;
  requestAnimationFrame(frame);
}
frame();
