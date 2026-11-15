// ============================================================
// 全体の進行：状態（設計／飛行／結果）、飛行の再生、カメラ、各部品のつなぎ。
// 物理の計算は src/core/ にあり、ここでは「飛ばす」を押した瞬間に simulate() を1回呼んで、
// その記録を再生するだけ（→ 画面のコマ数は飛び方に影響しない）。
// ============================================================
import * as THREE from 'three';
import { PHYS, MAX_SAVES } from '../core/config.js';
import { buildAircraft, clampParam, sanitizeSetup } from '../core/aircraft.js';
import { analyzeDesign } from '../core/aero.js';
import { simulate, sampleFlight, makeSample, initialState } from '../core/sim.js';
import { makeComment } from '../core/comment.js';
import { PRESETS, presetSetup } from '../core/presets.js';
import { createRenderer } from './scene/renderer.js';
import { createWorld } from './scene/world.js';
import { createEffects } from './scene/effects.js';
import { createPlane } from './scene/plane.js';
import { createTrails } from './scene/trails.js';
import { createForceArrows } from './scene/arrows.js';
import { createAim } from './scene/aim.js';
import { createCameraRig } from './camera.js';
import { createPanel } from './panel.js';
import { createOverlays } from './overlays.js';
import { createAudio } from './audio.js';
import { loadState, saveState, addSave, deleteSave } from './storage.js';

const D2R = Math.PI / 180;
const PANEL_W = 372;
const WINDUP = 0.55; // 「飛ばす」を押してから手を離すまでの間（カメラが後ろへ回る時間）[秒]

// ---------------- 部品を作る ----------------
const canvas = document.getElementById('view');
const renderer = createRenderer(canvas);
const world = createWorld();
const scene = world.scene;
const effects = createEffects(scene);
const plane = createPlane();
scene.add(plane.group);
const trails = createTrails(scene);
const arrows = createForceArrows();
scene.add(arrows.group);
const aim = createAim();
scene.add(aim.group);
const rig = createCameraRig(canvas);
const camera = rig.camera;
const audio = createAudio();

// ---------------- 状態 ----------------
const store = loadState();
const settings = store.settings;
let setup = presetSetup('basic');
let activePreset = 'basic';
let aircraft = buildAircraft(setup);
let info = analyzeDesign(aircraft);
let mode = 'title'; // 'title' | 'design' | 'flight' | 'result'
let cameraMode = 'chase';
let flight = null; // { rec, comment, time, rate, paused, windup, color }
const sample = makeSample();
const planePos = new THREE.Vector3(0, setup.throwHeight, 0);
const planeVel = new THREE.Vector3();
const dirty = { plane: true, launch: true, env: true, panel: true };
let fpsNow = 0;
const fpsLog = []; // 飛行中の毎秒のコマ数（確認用）

audio.setMuted(!!settings.muted);

// ---------------- 画面部品 ----------------
const panel = createPanel(document.getElementById('panel-root'), {
  setup, saves: store.saves, maxSaves: MAX_SAVES,
  onChange(key, value) {
    if (mode !== 'design') return;
    const v = clampParam(setup, key, value);
    if (setup[key] === v) { dirty.panel = true; return; }
    setup = { ...setup, [key]: v };
    activePreset = matchPreset(setup);
    onSetupChanged(key);
  },
  onPreset(id) {
    if (mode !== 'design') return;
    audio.ui('preset');
    applySetup(presetSetup(id), id);
  },
  onFly() { fly(); },
  onSave(name) {
    const r = addSave(store, name, setup);
    if (r.ok) { saveState(store); panel.setSaves(store.saves); audio.ui('save'); } else audio.ui('error');
    return r;
  },
  onLoad(i) {
    const s = store.saves[i];
    if (!s || mode !== 'design') return;
    audio.ui('preset');
    applySetup(sanitizeSetup(s.setup), null);
  },
  onDelete(i) {
    if (deleteSave(store, i)) { saveState(store); panel.setSaves(store.saves); audio.ui('click'); }
  },
});

const overlays = createOverlays(document.getElementById('overlay-root'), {
  onToggleArrows(b) { settings.showArrows = !!b; persistSettings(); audio.ui('toggle'); },
  onToggleFps(b) { settings.showFps = !!b; persistSettings(); audio.ui('toggle'); },
  onToggleMute(b) { settings.muted = !!b; audio.setMuted(settings.muted); persistSettings(); audio.ui('toggle'); },
  onHelp() { audio.ui('click'); overlays.openHelp(false); },
  onHelpClosed() {
    if (!settings.helpSeen) { settings.helpSeen = true; saveState(store); }
    audio.ui('click');
  },
  onCamera(m) { setCameraMode(m); },
  onPause() { togglePause(); },
  onSlow() { toggleSlow(); },
  onStop() { stopFlight(); },
  onBack() { backToDesign(); },
});

function persistSettings() {
  overlays.setToggles({ arrows: !!settings.showArrows, fps: !!settings.showFps, muted: !!settings.muted });
  saveState(store);
}

function matchPreset(s) {
  for (const p of PRESETS) {
    const ps = presetSetup(p.id);
    let same = true;
    for (const k in ps) if (ps[k] !== s[k]) { same = false; break; }
    if (same) return p.id;
  }
  return null;
}

function applySetup(s, presetId) {
  setup = sanitizeSetup(s);
  activePreset = presetId || matchPreset(setup);
  onSetupChanged(null);
}

function onSetupChanged(key) {
  aircraft = buildAircraft(setup);
  info = analyzeDesign(aircraft);
  dirty.panel = true;
  dirty.plane = true;
  if (key === null || key === 'throwHeight' || key === 'throwHeading') dirty.launch = true;
  if (key === null || key === 'windDir' || key === 'windSpeed' || key === 'updraft') dirty.env = true;
}

// ---------------- 飛ばす ----------------
function fly() {
  if (mode !== 'design' || overlays.isHelpOpen()) return;
  audio.unlock();
  audio.ui('fly');
  // 物理の計算（ここで最後まで計算する）
  const rec = simulate(setup, { aircraft });
  const comment = makeComment(rec);
  const color = trails.colorForNext();
  trails.start(rec, color);
  flight = { rec, comment, time: 0, rate: 1, paused: false, windup: WINDUP, color, landed: false };
  mode = 'flight';
  panel.setVisible(false);
  overlays.setMode('flight');
  overlays.setFlightState({ camera: cameraMode, paused: false, slow: false });
  rig.setViewShift(0);
  sampleFlight(rec, 0, sample);
  planePos.fromArray(sample.pos);
  rig.setFlight(cameraMode, setup.throwHeading, planePos);
  aim.setVisible(false);
  updateLandingMarkers(false);
  fpsLog.length = 0;
}

function setCameraMode(m) {
  cameraMode = m;
  audio.ui('click');
  if (mode === 'flight') {
    rig.setFlight(m, setup.throwHeading, planePos);
    overlays.setFlightState({ camera: m, paused: flight.paused, slow: flight.rate < 1 });
  }
}
function cycleCamera() {
  const order = ['chase', 'side', 'top'];
  setCameraMode(order[(order.indexOf(cameraMode) + 1) % order.length]);
}
function togglePause() {
  if (mode !== 'flight') return;
  flight.paused = !flight.paused;
  audio.ui('click');
  overlays.setFlightState({ camera: cameraMode, paused: flight.paused, slow: flight.rate < 1 });
}
function toggleSlow() {
  if (mode !== 'flight') return;
  flight.rate = flight.rate < 1 ? 1 : 0.25;
  audio.ui('toggle');
  overlays.setFlightState({ camera: cameraMode, paused: flight.paused, slow: flight.rate < 1 });
}
function stopFlight() {
  if (mode !== 'flight') return;
  flight.windup = 0;
  flight.time = flight.rec.result.airtime;
  flight.paused = false;
  finishFlight(true);
}

function finishFlight(skipped) {
  const rec = flight.rec, r = rec.result;
  flight.landed = true;
  flight.time = r.airtime;
  trails.finish();
  sampleFlight(rec, r.airtime, sample);
  planePos.fromArray(sample.pos);
  plane.setPose(sample.pos, sample.quat);
  audio.flightEnd();
  if (r.endReason === 'ground' && !skipped) audio.land(Math.hypot(sample.vel[0], sample.vel[1], sample.vel[2]));
  audio.ui('result');
  mode = 'result';
  overlays.setMode('result');
  overlays.setFlightState({ camera: cameraMode, paused: false, slow: false });
  updateHud();
  overlays.showResult({
    kind: flight.comment.kind, headline: flight.comment.headline, text: flight.comment.text,
    distance: r.distance, airtime: r.airtime, maxHeight: r.maxHeight, glideRatio: r.glideRatio,
    endReason: r.endReason,
    trails: trails.list().map((t) => ({ color: t.color, distance: t.distance, airtime: t.airtime, current: t.current })),
  });
  updateLandingMarkers(true);
  // 着地点のまわりをゆっくり回って見せる（ドラッグ・ホイールで自由に見回せる）
  const back = Math.atan2(-Math.sin(setup.throwHeading * D2R), -Math.cos(setup.throwHeading * D2R));
  rig.setOrbit(planePos, { dist: 3.4, az: back + 0.55, el: 24 * D2R, minDist: 0.5, maxDist: 120, auto: 0.1, fov: 44, ease: 1.2 });
}

function backToDesign() {
  if (mode !== 'result') return;
  audio.ui('click');
  overlays.hideResult();
  mode = 'design';
  flight = null;
  panel.setVisible(true);
  overlays.setMode('design');
  enterDesignView(1.1);
  updateLandingMarkers(true);
}

function enterDesignView(ease) {
  planePos.set(0, setup.throwHeight, 0);
  const h = setup.throwHeading * D2R;
  rig.setOrbit(planePos, { dist: 0.85, az: Math.atan2(-Math.sin(h), -Math.cos(h)) - 0.6, el: 21 * D2R, minDist: 0.28, maxDist: 9, fov: 42, ease });
  rig.setViewShift(PANEL_W / 2);
  aim.setVisible(true);
  dirty.plane = true;
}

function updateLandingMarkers(includeCurrent) {
  const list = [];
  for (const t of trails.list()) {
    if (t.current && !includeCurrent) continue;
    list.push({ pos: [t.landing[0], 0, t.landing[2]], color: t.color, label: `${t.distance.toFixed(1)}m`, current: t.current });
  }
  effects.setLandingMarkers(list);
}

function updateHud() {
  const p = sample.pos, v = sample.vel;
  const l = flight.rec.result.launch;
  overlays.updateHud({
    speed: Math.hypot(v[0], v[1], v[2]),
    height: Math.max(0, p[1]),
    distance: Math.hypot(p[0] - l[0], p[2] - l[2]),
    time: sample.t,
    pitch: sample.pitch,
    bank: sample.bank,
    stall: sample.stall,
  });
}

// ---------------- キー操作 ----------------
window.addEventListener('keydown', (e) => {
  audio.unlock();
  const tag = (e.target && e.target.tagName) || '';
  const typing = tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox';
  if (typing) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (overlays.isHelpOpen()) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'h' || e.key === 'H') { e.preventDefault(); overlays.closeHelp(); }
    return;
  }
  if (mode === 'title') return;
  const k = e.key.toLowerCase();
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (mode === 'design') fly(); else if (mode === 'flight') togglePause();
  } else if (k === 'c') { if (mode === 'flight') cycleCamera(); }
  else if (k === 's') toggleSlow();
  else if (k === 'f') { settings.showArrows = !settings.showArrows; persistSettings(); audio.ui('toggle'); }
  else if (k === 'm') { settings.muted = !settings.muted; audio.setMuted(settings.muted); persistSettings(); }
  else if (k === 'h') { overlays.openHelp(false); }
  else if (e.key === 'Enter' || e.key === 'Escape') {
    if (mode === 'result') { e.preventDefault(); backToDesign(); } else if (mode === 'flight' && e.key === 'Escape') stopFlight();
  }
});
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

// ---------------- 毎コマの処理 ----------------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0, timeSec = 0;
let lastW = 0, lastH = 0;

function applyDirty() {
  if (dirty.panel) {
    panel.setSetup(setup, aircraft, info);
    panel.setActivePreset(activePreset);
    dirty.panel = false;
  }
  if (dirty.launch) { world.setLaunch(setup); dirty.launch = false; }
  if (dirty.env) { world.setWind(setup); effects.setEnvironment(setup); dirty.env = false; }
  if (dirty.plane) {
    plane.rebuild(aircraft);
    if (mode === 'design' || mode === 'title') {
      const init = initialState(setup);
      plane.setPose(init.pos, init.quat);
      planePos.fromArray(init.pos);
      rig.moveOrbitCenter(planePos);
      aim.update(setup);
    }
    dirty.plane = false;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1; // タブを離れていた後などに、一気に進まないように（再生だけの話。物理には関係しない）
  timeSec += dt;

  // 画面の大きさ
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w !== lastW || h !== lastH) {
    renderer.setSize(w, h, false);
    trails.setResolution(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    lastW = w; lastH = h;
  }

  applyDirty();

  let vel = null;
  if (mode === 'flight') {
    const rec = flight.rec;
    if (flight.windup > 0) {
      flight.windup -= dt;
      if (flight.windup <= 0) audio.flightStart();
    } else if (!flight.paused) {
      flight.time += dt * flight.rate;
    }
    const end = rec.result.airtime;
    if (flight.time >= end) {
      finishFlight(false);
    } else {
      sampleFlight(rec, flight.time, sample);
      planePos.fromArray(sample.pos);
      planeVel.fromArray(sample.vel);
      vel = planeVel;
      plane.setPose(sample.pos, sample.quat);
      trails.setTime(flight.time);
      updateHud();
      if (flight.windup <= 0) audio.flightUpdate({ speed: sample.speed, stall: sample.stall, rate: flight.rate, paused: flight.paused });
    }
  }

  // 力の矢印（飛行中だけ。記録された力をそのまま描く）
  const showArrows = !!settings.showArrows && mode === 'flight' && flight && flight.windup <= 0;
  arrows.setVisible(showArrows);
  if (showArrows) arrows.update(sample, aircraft.mass, camera);

  rig.update(dt, planePos, vel);
  world.update(dt, timeSec, planePos, camera);
  effects.update(dt, timeSec, planePos, camera);
  renderer.render(scene, camera);

  // 毎秒のコマ数
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsNow = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    overlays.setFps(fpsNow);
    if (mode === 'flight' && flight && flight.windup <= 0 && !flight.paused) fpsLog.push(fpsNow);
  }
}

// ---------------- 起動 ----------------
async function start() {
  overlays.setToggles({ arrows: !!settings.showArrows, fps: !!settings.showFps, muted: !!settings.muted });
  panel.setVisible(false);
  overlays.setMode('title');
  applyDirty();
  enterDesignView(0);
  rig.update(0.016, planePos, null);
  rig.snap();
  requestAnimationFrame(frame);
  await overlays.showTitle();
  mode = 'design';
  panel.setVisible(true);
  overlays.setMode('design');
  if (!settings.helpSeen) overlays.openHelp(true);
}
start();

// ---------------- 確認用の窓口（Playwright から状態を読むため。遊ぶ人は使わない）----------------
window.__lab = {
  state: () => ({
    mode, cameraMode, setup: { ...setup }, activePreset,
    fps: fpsNow, fpsLog: fpsLog.slice(),
    flying: flight ? { time: flight.time, paused: flight.paused, rate: flight.rate, windup: flight.windup } : null,
    result: flight ? { ...flight.rec.result } : null,
    comment: flight ? { kind: flight.comment.kind, headline: flight.comment.headline, text: flight.comment.text } : null,
    sample: { pitch: sample.pitch, bank: sample.bank, stall: sample.stall, pos: sample.pos.slice() },
    trails: trails.list(),
    saves: store.saves.map((s) => s.name),
    settings: { ...settings },
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    dt: PHYS.dt,
  }),
};
