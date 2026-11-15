// world.js の単体表示。?cam=near|side|top|far|low|tower15|stool|horizon|side60|wind
import * as THREE from 'three';
import { createRenderer, fitRenderer } from '../../../src/ui/scene/renderer.js';
import { createWorld } from '../../../src/ui/scene/world.js';

const q = new URLSearchParams(location.search);
const cam = q.get('cam') || 'near';
const canvas = document.getElementById('view');
const renderer = createRenderer(canvas);
const world = createWorld();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 3000);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = Number(q.get('h') || 4);
const presets = {
  near: { h: 4, pos: V(-1.5, 5.0, 0.2), look: V(4, 3.7, 0), focus: V(0, 4, 0) },
  side: { h: 4, pos: V(0, 4, 6), look: V(0, 3.9, 0), focus: V(0, 4, 0) },
  top: { h: 4, pos: V(0, 13, 0.001), look: V(0, 4, 0), focus: V(0, 4, 0), up: V(1, 0, 0) },
  far: { h: 4, pos: V(-3, 30, 0), look: V(120, 0, 0), focus: V(25, 6, 0) },
  low: { h: 4, pos: V(-2, 0.25, 0.3), look: V(10, 0.5, 0), focus: V(3, 1, 0) },
  tower15: { h: 15, pos: V(-4, 1.5, 3), look: V(0, 14, 0), focus: V(0, 15, 0), fov: 60 },
  stool: { h: 0.5, pos: V(-1.2, 1.0, 1.0), look: V(0.5, 0.4, 0), focus: V(0, 0.5, 0) },
  horizon: { h: 4, pos: V(0, 1.7, 0), look: V(300, 22, 0), focus: V(0, 1.7, 0) },
  side60: { h: 4, pos: V(0, 2, 0), look: V(100, 25, 170), focus: V(0, 2, 0) },
  land: { h: 4, pos: V(6.3, 0.5, 1.0), look: V(7.5, 0.05, 1.0), focus: V(7.5, 0.05, 1.0) },
  wind: { h: 4, pos: V(-2, 1.2, 0), look: V(6, 0.3, 0), focus: V(0, 1, 0), wind: 6 },
};
const P = presets[cam] || presets.near;
const throwH = q.get('h') ? H : P.h;
world.setLaunch({ throwHeight: throwH, throwHeading: Number(q.get('heading') || 0) });
world.setWind({ windSpeed: P.wind ?? Number(q.get('wind') || 0), windDir: Number(q.get('dir') || 90) });
world.scene.add(world.sun.target);

const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
box.castShadow = true; box.receiveShadow = true;
box.position.copy(P.focus);
world.scene.add(box);

camera.position.copy(P.pos);
if (P.up) camera.up.copy(P.up);
if (P.fov) camera.fov = P.fov;
camera.lookAt(P.look);

let frame = 0;
function loop() {
  fitRenderer(renderer, camera);
  world.update(1 / 60, frame / 60, P.focus, camera);
  renderer.render(world.scene, camera);
  frame++;
  if (frame === 5) { window.__stats = `calls=${renderer.info.render.calls} tris=${renderer.info.render.triangles}`; console.log(window.__stats); }
  requestAnimationFrame(loop);
}
loop();
