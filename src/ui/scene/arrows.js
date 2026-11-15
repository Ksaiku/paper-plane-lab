// ============================================================
// 力の矢印：揚力（青）・抗力（赤）・重力（黄緑）。重心から出す。
// 長さは力の大きさに比例（重さと同じ力＝0.45m、上限1.5m）。
// ほかのものに隠れないよう、深度テストなしで後から描く。
// ============================================================
import * as THREE from 'three';
import { makeLabelSprite } from './label.js';

const G = 9.80665;
const LEN_PER_WEIGHT = 0.45;
const LEN_MAX = 1.5;
const LEN_MIN = 0.012; // これより短い力は矢印を出さない
const NEAR = 4; // これより遠いときは距離に比例して大きくする

const DEFS = [
  { key: 'lift', label: '揚力', color: '#2f80ed' },
  { key: 'drag', label: '抗力', color: '#e2504a' },
  { key: 'gravity', label: '重力', color: '#7cb518' },
];

export function createForceArrows() {
  const group = new THREE.Group();
  group.name = 'forceArrows';
  group.visible = true;

  const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
  shaftGeo.translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 16, 1, false);
  coneGeo.translate(0, 0.5, 0);

  const arrows = DEFS.map((d) => {
    const mat = new THREE.MeshBasicMaterial({ color: d.color, depthTest: false, depthWrite: false, toneMapped: false });
    const holder = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, mat);
    const cone = new THREE.Mesh(coneGeo, mat);
    shaft.frustumCulled = false; cone.frustumCulled = false;
    holder.add(shaft, cone);
    const label = makeLabelSprite(d.label, { bg: d.color, color: '#ffffff', height: 0.07, depthTest: false, fontSize: 56, padding: 0.3 });
    label.renderOrder = 1100;
    const base = label.scale.clone();
    group.add(holder, label);
    holder.visible = false; label.visible = false;
    return { def: d, holder, shaft, cone, label, base, tipDist: 0, dir: new THREE.Vector3(), len: 0 };
  });

  const Y = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const force = [0, 0, 0];

  function update(sample, mass, camera) {
    const wN = mass * G;
    origin.set(sample.pos[0], sample.pos[1], sample.pos[2]);
    let k = 1;
    if (camera) {
      const dist = camera.position.distanceTo(origin);
      if (dist > NEAR) k = dist / NEAR;
    }
    for (let i = 0; i < 3; i++) {
      const a = arrows[i];
      if (i === 0) { force[0] = sample.lift[0]; force[1] = sample.lift[1]; force[2] = sample.lift[2]; }
      else if (i === 1) { force[0] = sample.drag[0]; force[1] = sample.drag[1]; force[2] = sample.drag[2]; }
      else { force[0] = 0; force[1] = -wN; force[2] = 0; }
      const mag = Math.hypot(force[0], force[1], force[2]);
      let len = wN > 0 ? (mag / wN) * LEN_PER_WEIGHT : 0;
      if (len > LEN_MAX) len = LEN_MAX;
      if (!(len >= LEN_MIN) || mag <= 0) { a.holder.visible = false; a.label.visible = false; a.len = 0; continue; }
      a.holder.visible = true; a.label.visible = true;
      a.dir.set(force[0] / mag, force[1] / mag, force[2] / mag);
      const L = len * k;
      const shaftR = 0.0075 * k;
      const headR = Math.min(0.022 * k, L * 0.35);
      const headL = Math.min(0.08 * k, L * 0.45);
      a.holder.position.copy(origin);
      a.holder.quaternion.setFromUnitVectors(Y, a.dir);
      a.shaft.scale.set(Math.min(shaftR, headR * 0.6), L - headL * 0.9, Math.min(shaftR, headR * 0.6));
      a.cone.position.set(0, L - headL, 0);
      a.cone.scale.set(headR, headL, headR);
      // ラベルは矢印の先の少し先
      tip.copy(a.dir).multiplyScalar(L + 0.06 * k).add(origin);
      a.label.position.copy(tip);
      a.label.scale.set(a.base.x * k, a.base.y * k, 1);
      a.len = L;
      a.tipDist = camera ? camera.position.distanceTo(tmp.copy(a.dir).multiplyScalar(L).add(origin)) : 0;
    }
    // 矢印どうしの前後：カメラから遠い先を先に描く
    for (let i = 0; i < 3; i++) {
      const a = arrows[i];
      let rank = 0;
      for (let j = 0; j < 3; j++) if (j !== i && (arrows[j].tipDist > a.tipDist || (arrows[j].tipDist === a.tipDist && j < i))) rank++;
      a.shaft.renderOrder = 1000 + rank * 3;
      a.cone.renderOrder = 1001 + rank * 3;
    }
  }

  function setVisible(b) { group.visible = !!b; }

  return { group, update, setVisible };
}
