// ============================================================
// 軌跡：今回の線（太く）＋前回まで最大3本（細く・少し透明に）。
// 高さが読めるように、地面への投影の線と、1秒ごとの垂線も引く。
// ============================================================
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MAX_OLD_TRAILS } from '../../core/config.js';

// base.css の --trail-0〜3 と同じ値
const COLORS = ['#ff7a2f', '#2f80ed', '#27ae60', '#9b51e0'];
const STEP = 2; // 120Hz の記録を何コマに1点にするか
const GROUND_Y = 0.01;

const WIDTH_CURRENT = 4.5;
const WIDTH_OLD = 2.5;

export function createTrails(scene) {
  let current = null;
  let old = []; // 新しい順
  let resW = 1280, resH = 720;

  function makeSegments(points, count, color, width, opacity, offsetUnits) {
    // points: Float32Array（xyz の並び, count 点）
    const segN = Math.max(0, count - 1);
    const buf = new Float32Array(segN * 6);
    for (let k = 0; k < segN; k++) {
      buf[6 * k] = points[3 * k]; buf[6 * k + 1] = points[3 * k + 1]; buf[6 * k + 2] = points[3 * k + 2];
      buf[6 * k + 3] = points[3 * k + 3]; buf[6 * k + 4] = points[3 * k + 4]; buf[6 * k + 5] = points[3 * k + 5];
    }
    const geo = new LineSegmentsGeometry();
    if (segN > 0) geo.setPositions(buf);
    else geo.setPositions(new Float32Array(6));
    const mat = new LineMaterial({
      color: new THREE.Color(color).getHex(), linewidth: width, worldUnits: false,
      transparent: opacity < 1, opacity, depthWrite: false,
    });
    if (offsetUnits) { mat.polygonOffset = true; mat.polygonOffsetFactor = -offsetUnits; mat.polygonOffsetUnits = -offsetUnits; }
    mat.resolution.set(resW, resH);
    const line = new LineSegments2(geo, mat);
    line.frustumCulled = false;
    line.geometry.instanceCount = 0;
    return { line, geo, mat, buf, segN, points, count, lastEdited: -1 };
  }

  /** k 本目まで見せ、最後の線分は割合 f だけ伸ばして見せる（なめらかに伸びる） */
  function showSegments(seg, nFull, f) {
    if (seg.segN === 0) { seg.geo.instanceCount = 0; return; }
    const attr = seg.geo.attributes.instanceEnd;
    const data = attr.data;
    // 前に半端にした線分を元へ戻す
    if (seg.lastEdited >= 0) {
      const k = seg.lastEdited, p = seg.points;
      seg.buf[6 * k + 3] = p[3 * k + 3]; seg.buf[6 * k + 4] = p[3 * k + 4]; seg.buf[6 * k + 5] = p[3 * k + 5];
      seg.lastEdited = -1;
      data.needsUpdate = true;
    }
    if (nFull >= seg.segN) { seg.geo.instanceCount = seg.segN; return; }
    if (nFull < 0) { seg.geo.instanceCount = 0; return; }
    // nFull 本は完全に、次の1本は割合 f だけ
    if (f > 0.001) {
      const k = nFull, p = seg.points;
      seg.buf[6 * k + 3] = p[3 * k] + (p[3 * k + 3] - p[3 * k]) * f;
      seg.buf[6 * k + 4] = p[3 * k + 1] + (p[3 * k + 4] - p[3 * k + 1]) * f;
      seg.buf[6 * k + 5] = p[3 * k + 2] + (p[3 * k + 5] - p[3 * k + 2]) * f;
      seg.lastEdited = k;
      data.needsUpdate = true;
      seg.geo.instanceCount = nFull + 1;
    } else {
      seg.geo.instanceCount = nFull;
    }
  }

  function disposeSeg(seg) {
    seg.line.removeFromParent();
    seg.geo.dispose();
    seg.mat.dispose();
  }

  function build(rec, color) {
    const fr = rec.frames;
    const n = fr.n;
    // 間引いた点の並び（最後のコマは必ず入れる）
    const idx = [];
    for (let i = 0; i < n; i += STEP) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    const cnt = idx.length;
    const pts = new Float32Array(cnt * 3);
    const gpts = new Float32Array(cnt * 3);
    const times = new Float64Array(cnt);
    for (let j = 0; j < cnt; j++) {
      const i = idx[j];
      pts[3 * j] = fr.pos[3 * i]; pts[3 * j + 1] = fr.pos[3 * i + 1]; pts[3 * j + 2] = fr.pos[3 * i + 2];
      gpts[3 * j] = pts[3 * j]; gpts[3 * j + 1] = GROUND_Y; gpts[3 * j + 2] = pts[3 * j + 2];
      times[j] = fr.t[i];
    }
    const group = new THREE.Group();
    group.name = 'trail';
    const main = makeSegments(pts, cnt, color, WIDTH_CURRENT, 1, 0);
    const shadow = makeSegments(gpts, cnt, color, 2.5, 0.6, 4);
    main.line.renderOrder = 6; shadow.line.renderOrder = 5;

    // 1秒ごとの垂線
    const T = fr.t[n - 1];
    const dropTimes = [];
    for (let s = 1; s <= T + 1e-9; s++) dropTimes.push(s);
    const dropPos = new Float32Array(dropTimes.length * 6);
    let j = 0;
    for (let d = 0; d < dropTimes.length; d++) {
      const t = dropTimes[d];
      while (j < cnt - 2 && times[j + 1] <= t) j++;
      const span = times[j + 1] - times[j];
      const f = span > 0 ? Math.min(1, Math.max(0, (t - times[j]) / span)) : 0;
      const x = pts[3 * j] + (pts[3 * j + 3] - pts[3 * j]) * f;
      const y = pts[3 * j + 1] + (pts[3 * j + 4] - pts[3 * j + 1]) * f;
      const z = pts[3 * j + 2] + (pts[3 * j + 5] - pts[3 * j + 2]) * f;
      dropPos.set([x, y, z, x, GROUND_Y, z], 6 * d);
    }
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    dropGeo.setDrawRange(0, 0);
    const dropMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.65, depthWrite: false });
    const drops = new THREE.LineSegments(dropGeo, dropMat);
    drops.frustumCulled = false;
    drops.renderOrder = 4;

    group.add(shadow.line, drops, main.line);
    scene.add(group);

    const r = rec.result || {};
    return {
      color, group, main, shadow, drops, dropGeo, dropMat, dropTimes, times, cnt,
      distance: r.distance ?? 0, airtime: r.airtime ?? T, landing: r.landing ? [r.landing[0], r.landing[1], r.landing[2]] : [pts[3 * cnt - 3], pts[3 * cnt - 2], pts[3 * cnt - 1]],
      isCurrent: true,
    };
  }

  function destroy(tr) {
    disposeSeg(tr.main); disposeSeg(tr.shadow);
    tr.dropGeo.dispose(); tr.dropMat.dispose();
    tr.group.removeFromParent();
  }

  function showAt(tr, t) {
    const times = tr.times, cnt = tr.cnt;
    let nFull, f = 0;
    if (!(t > times[0])) { nFull = -1; }
    else if (t >= times[cnt - 1]) { nFull = cnt - 1; }
    else {
      // times[k] <= t < times[k+1] となる k を二分探索
      let lo = 0, hi = cnt - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
      nFull = lo;
      f = (t - times[lo]) / (times[lo + 1] - times[lo]);
    }
    showSegments(tr.main, nFull, f);
    showSegments(tr.shadow, nFull, f);
    let nd = 0;
    const dt = tr.dropTimes;
    while (nd < dt.length && dt[nd] <= t) nd++;
    tr.dropGeo.setDrawRange(0, nd * 2);
  }

  function styleOld(tr) {
    tr.main.mat.linewidth = WIDTH_OLD;
    tr.main.mat.opacity = 0.75; tr.main.mat.transparent = true;
    tr.main.mat.needsUpdate = true;
    tr.shadow.mat.opacity = 0.35; tr.shadow.mat.linewidth = 1.5;
    tr.dropMat.opacity = 0.3;
    tr.main.line.renderOrder = 3; tr.shadow.line.renderOrder = 2; tr.drops.renderOrder = 1;
    tr.isCurrent = false;
  }

  function archive() {
    if (!current) return;
    styleOld(current);
    old.unshift(current);
    current = null;
    while (old.length > MAX_OLD_TRAILS) destroy(old.pop());
  }

  return {
    colorForNext() {
      const kept = (current ? [current, ...old] : old.slice()).slice(0, MAX_OLD_TRAILS).map((t) => t.color);
      for (const c of COLORS) if (!kept.includes(c)) return c;
      return COLORS[0];
    },
    start(rec, color) {
      if (current) archive();
      current = build(rec, color || this.colorForNext());
      showAt(current, -1);
    },
    setTime(t) { if (current) showAt(current, t); },
    finish() { if (current) showAt(current, Infinity); },
    archive,
    list() {
      const out = [];
      for (const tr of current ? [current, ...old] : old) {
        out.push({ color: tr.color, distance: tr.distance, airtime: tr.airtime, landing: tr.landing.slice(), current: tr.isCurrent });
      }
      return out;
    },
    setResolution(w, h) {
      resW = w; resH = h;
      for (const tr of current ? [current, ...old] : old) {
        tr.main.mat.resolution.set(w, h);
        tr.shadow.mat.resolution.set(w, h);
      }
    },
  };
}
