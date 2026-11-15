// カメラの動かし方。
//  - 設計・結果：注目点のまわりを回る（ドラッグで見回し、ホイールで拡大）
//  - 飛行：追いかけ／横から／上から
// 目標の位置へ毎コマなめらかに近づけるので、切り替えても画面が飛ばない。
import * as THREE from 'three';

const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createCameraRig(canvas) {
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 3000);
  const pos = new THREE.Vector3(-1, 4.4, -0.6);
  const target = new THREE.Vector3(0, 4, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const wantPos = new THREE.Vector3().copy(pos);
  const wantTarget = new THREE.Vector3().copy(target);
  const wantUp = new THREE.Vector3(0, 1, 0);
  let wantFov = 42;

  // 見回し（設計・結果）
  const orbit = { az: 214 * D2R, el: 20 * D2R, dist: 0.8, minDist: 0.3, maxDist: 8, auto: 0 };
  const orbitCenter = new THREE.Vector3(0, 4, 0);
  // 飛行
  const dirH = new THREE.Vector3(1, 0, 0); // なめらかにした進行方向（水平）
  const fwd = new THREE.Vector3(1, 0, 0); // 投げた向き（水平）
  const side = new THREE.Vector3(0, 0, 1);
  let smoothY = 0;
  let mode = 'orbit'; // 'orbit' | 'chase' | 'side' | 'top'
  let ease = 0; // 切り替え直後は、ゆっくり近づける残り時間
  let dragEnabled = true;
  let viewShift = 0, wantViewShift = 0; // 左のパネルの分だけ、画面の中心を右へ寄せる（画素）

  // ---- マウス操作 ----
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!dragEnabled || mode !== 'orbit' || e.button !== 0) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    orbit.auto = 0;
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    orbit.az += dx * 0.0075;
    orbit.el = clamp(orbit.el + dy * 0.006, -12 * D2R, 86 * D2R);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* 何もしない */ }
    canvas.style.cursor = mode === 'orbit' ? 'grab' : 'default';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'orbit') return;
    e.preventDefault();
    orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), orbit.minDist, orbit.maxDist);
    orbit.auto = 0;
  }, { passive: false });

  const tmp = new THREE.Vector3();

  return {
    camera,
    get mode() { return mode; },
    orbit,
    /** 注目点のまわりを回る見方にする */
    setOrbit(center, opts = {}) {
      mode = 'orbit';
      orbitCenter.copy(center);
      if (opts.dist !== undefined) orbit.dist = opts.dist;
      if (opts.az !== undefined) orbit.az = opts.az;
      if (opts.el !== undefined) orbit.el = opts.el;
      orbit.minDist = opts.minDist ?? 0.3;
      orbit.maxDist = opts.maxDist ?? 8;
      orbit.auto = opts.auto ?? 0;
      wantFov = opts.fov ?? 42;
      ease = opts.ease ?? 0.9;
      canvas.style.cursor = 'grab';
    },
    moveOrbitCenter(center) { orbitCenter.copy(center); },
    /** 飛行中の見方にする。heading は投げた向き [度] */
    setFlight(kind, headingDeg, planePos) {
      const first = mode === 'orbit';
      mode = kind;
      const h = headingDeg * D2R;
      fwd.set(Math.cos(h), 0, Math.sin(h));
      side.set(-Math.sin(h), 0, Math.cos(h));
      if (first) { dirH.copy(fwd); smoothY = planePos.y; }
      wantFov = kind === 'chase' ? 52 : 44;
      ease = 0.7;
      canvas.style.cursor = 'default';
    },
    setDragEnabled(b) { dragEnabled = b; },
    setViewShift(px) { wantViewShift = px; },
    /**
     * 毎コマ呼ぶ。planePos: 機体の位置、vel: 機体の速度（THREE.Vector3、飛行中のみ使う）
     */
    update(dt, planePos, vel) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (mode === 'orbit') {
        if (orbit.auto && !dragging) orbit.az += orbit.auto * dt;
        const ce = Math.cos(orbit.el);
        wantPos.set(
          orbitCenter.x + orbit.dist * ce * Math.cos(orbit.az),
          orbitCenter.y + orbit.dist * Math.sin(orbit.el),
          orbitCenter.z + orbit.dist * ce * Math.sin(orbit.az)
        );
        wantTarget.copy(orbitCenter);
        wantUp.set(0, 1, 0);
      } else {
        // 進行方向（水平）をゆっくり追う。ほぼ真上・真下に動いているときは向きを保つ
        if (vel) {
          const hs = Math.hypot(vel.x, vel.z);
          if (hs > 0.8) {
            tmp.set(vel.x / hs, 0, vel.z / hs);
            const k = 1 - Math.exp(-dt / 0.7);
            dirH.lerp(tmp, k).normalize();
          }
        }
        smoothY += (planePos.y - smoothY) * (1 - Math.exp(-dt / 0.5));
        if (mode === 'chase') {
          wantPos.copy(planePos).addScaledVector(dirH, -1.55);
          wantPos.y += 0.46;
          wantTarget.copy(planePos).addScaledVector(dirH, 0.35);
          wantUp.set(0, 1, 0);
        } else if (mode === 'side') {
          wantPos.copy(planePos).addScaledVector(side, 5.2).addScaledVector(fwd, -0.4);
          wantPos.y = smoothY * 0.55 + 0.9;
          wantTarget.copy(planePos).addScaledVector(fwd, 0.6);
          wantTarget.y = planePos.y * 0.75 + smoothY * 0.25;
          wantUp.set(0, 1, 0);
        } else {
          // 上から：画面の上が投げた向き
          wantPos.copy(planePos).addScaledVector(fwd, 0.8);
          wantPos.y = Math.max(planePos.y + 9, 10);
          wantTarget.copy(planePos).addScaledVector(fwd, 0.8);
          wantUp.copy(fwd);
        }
      }
      if (wantPos.y < 0.12) wantPos.y = 0.12;
      // なめらかに近づける
      ease = Math.max(0, ease - dt);
      const tau = mode === 'orbit' ? (dragging ? 0.04 : 0.09) : mode === 'chase' ? 0.16 : 0.2;
      const tauNow = tau + ease * 0.5;
      const k = 1 - Math.exp(-dt / tauNow);
      const kt = 1 - Math.exp(-dt / (mode === 'orbit' ? tauNow : 0.07 + ease * 0.5));
      pos.lerp(wantPos, k);
      target.lerp(wantTarget, kt);
      up.lerp(wantUp, 1 - Math.exp(-dt / 0.25)).normalize();
      camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt / 0.3));
      camera.position.copy(pos);
      camera.up.copy(up);
      camera.lookAt(target);
      // 近くを見るときは手前の切り取り面を近く、遠くを見るときは遠くに（奥行きの精度のため）
      const d = pos.distanceTo(target);
      camera.near = clamp(d * 0.08, 0.03, 0.6);
      camera.far = 3000;
      camera.aspect = w / Math.max(1, h);
      viewShift += (wantViewShift - viewShift) * (1 - Math.exp(-dt / 0.14));
      if (Math.abs(viewShift) > 0.5) camera.setViewOffset(w, h, -viewShift, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    /** いますぐ目標の位置へ（起動時など） */
    snap() {
      ease = 0;
      pos.copy(wantPos); target.copy(wantTarget); up.copy(wantUp);
      viewShift = wantViewShift;
      camera.fov = wantFov;
    },
  };
}
