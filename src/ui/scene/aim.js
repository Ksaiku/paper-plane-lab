// 設計画面で、投げる向き・角度・速さを示す矢印（機体の前に伸びる点線と矢じり）。
import * as THREE from 'three';

const D2R = Math.PI / 180;

export function createAim() {
  const group = new THREE.Group();
  const color = 0xff7a2f;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  // 点線（小さな円柱を並べる）
  const N = 14;
  const dashGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 1, 8);
  dashGeo.rotateZ(-Math.PI / 2); // 長さの向きを x に
  const dashes = new THREE.InstancedMesh(dashGeo, mat, N);
  dashes.frustumCulled = false;
  group.add(dashes);
  const headGeo = new THREE.ConeGeometry(0.011, 0.045, 16);
  headGeo.rotateZ(-Math.PI / 2);
  const head = new THREE.Mesh(headGeo, mat);
  group.add(head);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  return {
    group,
    setVisible(b) { group.visible = b; },
    /** 投げ方に合わせる。長さは速さに比例（1 m/s あたり 9cm） */
    update(setup) {
      const th = setup.throwPitch * D2R, ps = setup.throwHeading * D2R;
      group.position.set(0, setup.throwHeight, 0);
      group.rotation.set(0, 0, 0);
      group.quaternion.setFromEuler(new THREE.Euler(0, -ps, th, 'YZX'));
      const start = 0.2; // 機首の少し先から
      const len = 0.09 * setup.throwSpeed;
      const step = len / N;
      for (let i = 0; i < N; i++) {
        p.set(start + (i + 0.5) * step, 0, 0);
        s.set(step * 0.55, 1, 1);
        m.compose(p, q, s);
        dashes.setMatrixAt(i, m);
      }
      dashes.instanceMatrix.needsUpdate = true;
      head.position.set(start + len + 0.025, 0, 0);
    },
  };
}
