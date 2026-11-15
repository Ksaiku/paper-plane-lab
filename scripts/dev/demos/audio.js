// 音のデモと自己テスト。
//   node build.mjs --entry=scripts/dev/demos/audio.js --out=.tmp/audio.html --minify=false
// ブラウザで開くとボタンで音を試せる。window.__audioSelfTest() は OfflineAudioContext で
// 同じ音作りの関数を鳴らし、波形を数値で確かめた結果を返す。
import { createAudio, buildMaster, buildWind, windParams, playLand, playUi, playThrow, UI_KINDS } from '../../../src/ui/audio.js';

const SR = 44100;
const audio = createAudio();
const state = { speed: 8, stall: 0, rate: 1, paused: false, flying: false };

// ---------- 画面 ----------
const root = document.getElementById('panel-root') || document.body;
root.style.cssText = 'position:relative;z-index:10;font:14px sans-serif;padding:16px;color:#222;background:#fff;min-height:100vh;';
const row = (label) => {
  const d = document.createElement('div');
  d.style.cssText = 'margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  if (label) d.append(Object.assign(document.createElement('b'), { textContent: label }));
  root.append(d);
  return d;
};
const btn = (parent, text, fn) => {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'padding:6px 12px;cursor:pointer';
  b.addEventListener('click', () => { audio.unlock(); fn(b); });
  parent.append(b);
  return b;
};
const slider = (parent, label, min, max, step, init, onInput) => {
  const l = document.createElement('label');
  l.textContent = label + ' ';
  const out = document.createElement('span');
  const r = document.createElement('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = init;
  const upd = () => { out.textContent = Number(r.value).toFixed(2); onInput(Number(r.value)); };
  r.addEventListener('input', () => { audio.unlock(); upd(); });
  l.append(r, ' ', out);
  parent.append(l);
  upd();
};
const push = () => { if (state.flying) audio.flightUpdate({ speed: state.speed, stall: state.stall, rate: state.rate, paused: state.paused }); };

root.append(Object.assign(document.createElement('h2'), { textContent: '音のデモ' }));
btn(row(), '音を有効にする', () => {});
const fl = row('飛行');
btn(fl, '飛行開始', () => { state.flying = true; audio.flightStart(); push(); });
btn(fl, '飛行終了', () => { audio.flightEnd(); state.flying = false; });
slider(fl, '速さ', 0, 15, 0.1, 8, (v) => { state.speed = v; push(); });
slider(fl, '失速', 0, 1, 0.01, 0, (v) => { state.stall = v; push(); });
btn(fl, 'スロー', (b) => { state.rate = state.rate === 1 ? 0.25 : 1; b.textContent = state.rate === 1 ? 'スロー' : 'スロー解除'; push(); });
btn(fl, '一時停止', (b) => { state.paused = !state.paused; b.textContent = state.paused ? '再開' : '一時停止'; push(); });
const ld = row('着地');
btn(ld, '弱', () => audio.land(2.5));
btn(ld, '中', () => audio.land(6));
btn(ld, '強', () => audio.land(10));
const ui = row('操作音');
for (const k of UI_KINDS) btn(ui, k, () => audio.ui(k));
btn(row(), '消音', (b) => { audio.setMuted(!audio.isMuted()); b.textContent = audio.isMuted() ? '消音を解除' : '消音'; });
const result = Object.assign(document.createElement('pre'), { id: 'result' });
root.append(result);

// ---------- 自己テスト ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

function analyze(data, from = 0) {
  let sum = 0, peak = 0, n = 0;
  for (let i = from; i < data.length; i++) { const v = data[i]; sum += v * v; peak = Math.max(peak, Math.abs(v)); n++; }
  const rms = Math.sqrt(sum / Math.max(1, n));
  // スペクトル重心と、300Hz 以下の成分のRMS（失速のばたばた用）
  const N = 16384;
  let cNum = 0, cDen = 0, lowE = 0;
  for (const start of [from, from + N]) {
    if (start + N > data.length) break;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = data[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N, m2 = re[k] * re[k] + im[k] * im[k];
      cNum += f * Math.sqrt(m2); cDen += Math.sqrt(m2);
      if (f < 300) lowE += m2;
    }
  }
  return { rms, peak, centroid: cDen ? cNum / cDen : 0, lowE };
}

async function render(dur, build) {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * dur), SR);
  const m = buildMaster(ctx);
  build(ctx, m);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

const renderWind = (p, muted = false) => render(1.5, (ctx, m) => {
  if (muted) m.setMuted(true, 0, 0.0001);
  const w = buildWind(ctx, m.input);
  w.start(0);
  w.set(windParams(p), 0, 0.001);
});

const r4 = (x) => Math.round(x * 10000) / 10000;

window.__audioSelfTest = async function () {
  const out = { checks: {}, wind: [], notes: [] };
  const check = (name, ok) => { out.checks[name] = !!ok; };
  const FROM = Math.floor(SR * 0.4);

  // 速さを変えたときの風切り音
  const speeds = [0, 2, 4, 6, 8, 10, 12, 15];
  const ws = [];
  for (const speed of speeds) {
    const a = analyze(await renderWind({ speed, stall: 0, rate: 1, paused: false }), FROM);
    ws.push(a);
    out.wind.push({ speed, rms: r4(a.rms), peak: r4(a.peak), centroidHz: Math.round(a.centroid) });
  }
  check('風: 無音でない(速さ>=2)', ws.slice(1).every((a) => a.rms > 1e-4));
  check('風: 速さ0はほぼ無音', ws[0].rms < 1e-4);
  check('風: 速さを上げるとRMSが上がる', ws.every((a, i) => i === 0 || a.rms > ws[i - 1].rms * 0.999));
  check('風: 速さを上げるとスペクトル重心が上がる', ws.slice(1).every((a, i) => i === 0 || a.centroid > ws[i].centroid));
  check('風: 最大でも控えめ(RMS<0.2)', ws.every((a) => a.rms < 0.2));
  check('風: 割れていない(ピーク<1)', ws.every((a) => a.peak < 1));

  // 失速
  const calm = analyze(await renderWind({ speed: 8, stall: 0, rate: 1 }), FROM);
  const stalled = analyze(await renderWind({ speed: 8, stall: 1, rate: 1 }), FROM);
  out.stall = { calmLowE: Math.round(calm.lowE), stallLowE: Math.round(stalled.lowE), calmPeak: r4(calm.peak), stallPeak: r4(stalled.peak) };
  check('失速: 低域が増える', stalled.lowE > calm.lowE * 1.2);
  check('失速: 割れていない', stalled.peak < 1);

  // スロー・一時停止・消音
  const slow = analyze(await renderWind({ speed: 8, stall: 0, rate: 0.25 }), FROM);
  const normal = ws[speeds.indexOf(8)];
  out.slow = { rms: r4(slow.rms), centroidHz: Math.round(slow.centroid), normalRms: r4(normal.rms), normalCentroidHz: Math.round(normal.centroid) };
  check('スロー: 小さく低くなる', slow.rms < normal.rms && slow.centroid < normal.centroid);
  const paused = analyze(await renderWind({ speed: 12, stall: 1, rate: 1, paused: true }), FROM);
  check('一時停止: 無音', paused.rms < 1e-5);
  const mutedA = analyze(await renderWind({ speed: 12, stall: 0, rate: 1 }, true), FROM);
  check('消音: 無音', mutedA.rms < 1e-5);

  // 着地
  out.land = {};
  const lands = {};
  for (const [name, sp] of [['弱', 2], ['中', 6], ['強', 10]]) {
    const d = await render(0.5, (ctx, m) => playLand(ctx, m.input, sp, 0));
    const a = analyze(d);
    lands[name] = a;
    out.land[name] = { rms: r4(a.rms), peak: r4(a.peak), centroidHz: Math.round(a.centroid) };
  }
  check('着地: 無音でない', Object.values(lands).every((a) => a.rms > 1e-3));
  check('着地: 速いほど大きい', lands['弱'].rms < lands['中'].rms && lands['中'].rms < lands['強'].rms);
  check('着地: 速いほど明るい', lands['弱'].centroid < lands['強'].centroid);
  check('着地: 割れていない', Object.values(lands).every((a) => a.peak < 1));

  // 投げる音
  const th = analyze(await render(0.4, (ctx, m) => playThrow(ctx, m.input, 0)));
  out.throw = { rms: r4(th.rms), peak: r4(th.peak) };
  check('投げる音: 無音でなく割れていない', th.rms > 1e-3 && th.peak < 1);

  // 操作音
  out.ui = {};
  let uiOk = true;
  for (const k of UI_KINDS) {
    const a = analyze(await render(0.3, (ctx, m) => playUi(ctx, m.input, k, 0)));
    out.ui[k] = { rms: r4(a.rms), peak: r4(a.peak) };
    if (!(a.rms > 1e-4 && a.peak < 0.5)) uiOk = false;
  }
  check('操作音: 無音でなく控えめ(ピーク<0.5)', uiOk);

  // 本番の createAudio: ユーザー操作の前は AudioContext を作らず、何を呼んでも落ちない
  const Orig = window.AudioContext;
  let created = 0;
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); created++; } };
  let threw = false;
  try {
    const a2 = createAudio();
    a2.setMuted(true); a2.isMuted(); a2.setMuted(false);
    a2.flightStart(); a2.flightUpdate({ speed: 5, stall: 0.5, rate: 1, paused: false }); a2.flightEnd();
    a2.land(5); for (const k of UI_KINDS) a2.ui(k);
    a2.ui('unknown');
  } catch (e) { threw = String(e); }
  check('unlock前はAudioContextを作らず例外なし', created === 0 && threw === false);
  let a3;
  try {
    a3 = createAudio();
    a3.unlock(); a3.unlock();
    a3.flightStart(); a3.flightUpdate({ speed: 9, stall: 0.8, rate: 0.25, paused: false });
    a3.land(6); a3.ui('result'); a3.setMuted(true); a3.flightEnd();
  } catch (e) { threw = String(e); }
  window.AudioContext = Orig;
  check('unlock後の呼び出しで例外なし・AudioContextは1つ', threw === false && created === 1);
  await new Promise((r) => setTimeout(r, 300));

  out.allPassed = Object.values(out.checks).every(Boolean);
  result.textContent = JSON.stringify(out, null, 1);
  return out;
};
