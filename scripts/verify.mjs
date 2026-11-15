// 完成の判定基準13項目を、実際にブラウザ（Edge）を操作して確かめる。
//   node scripts/verify.mjs            … 画面つきで実行（毎秒のコマ数を実機の描画で測る）
//   node scripts/verify.mjs --only=4,5 … 一部の項目だけ
// 画面写真は docs/screenshots/、結果の数字は docs/verification-data.json に出る。
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist', 'index.html');
const URL_ = pathToFileURL(DIST).href;
const SHOTS = join(root, 'docs', 'screenshots');
const args = Object.fromEntries(process.argv.slice(2).map((x) => { const m = x.replace(/^--/, ''); const i = m.indexOf('='); return i < 0 ? [m, true] : [m.slice(0, i), m.slice(i + 1)]; }));
const only = args.only ? String(args.only).split(',').map(Number) : null;
const want = (n) => !only || only.includes(n);
const headless = !!args.headless;
mkdirSync(SHOTS, { recursive: true });
const profile = join(root, '.tmp', 'verify-profile');
rmSync(profile, { recursive: true, force: true });

const dataFile = join(root, 'docs', 'verification-data.json');
const out = only && existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};
out.when = new Date().toISOString();
out.consoleErrors = out.consoleErrors || [];
out.consoleWarnings = out.consoleWarnings || [];
out.externalRequests = out.externalRequests || [];
if (!only) { out.consoleErrors = []; out.consoleWarnings = []; out.externalRequests = []; }

const launchArgs = headless
  ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
  : ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

let context, page;
async function open({ offline = false } = {}) {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless, viewport: { width: 1440, height: 900 }, args: launchArgs,
  });
  if (offline) await context.setOffline(true);
  page = context.pages()[0] || (await context.newPage());
  page.on('console', (m) => {
    if (m.type() === 'error') out.consoleErrors.push(m.text());
    else if (m.type() === 'warning') out.consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => out.consoleErrors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) out.externalRequests.push(u); });
  await page.addInitScript(() => {
    window.__clicks = 0;
    document.addEventListener('click', () => { window.__clicks++; }, true);
  });
  await page.goto(URL_);
}
const st = () => page.evaluate(() => window.__lab.state());
const sleep = (ms) => page.waitForTimeout(ms);
const waitMode = (m, timeout = 120000) => page.waitForFunction((mm) => window.__lab && window.__lab.state().mode === mm, m, { timeout });
const shot = async (name) => { await page.screenshot({ path: join(SHOTS, name) }); return name; };
const btn = (text) => page.locator('#overlay-root button', { hasText: text }).first();

async function startFresh() {
  // タイトルが消えるのを待ち、初回の遊び方を閉じる
  await waitMode('design');
  await sleep(400);
  const b = btn('はじめる');
  if (await b.isVisible().catch(() => false)) await b.click();
  await sleep(500);
}
async function setParam(key, value) {
  const loc = page.locator(`#panel-root input[data-key="${key}"]`);
  await loc.scrollIntoViewIfNeeded();
  await loc.fill(String(value));
  await sleep(60);
}
async function setSwitch(key, on) {
  const loc = page.locator(`#panel-root [role="switch"][data-key="${key}"]`);
  await loc.scrollIntoViewIfNeeded();
  if (((await loc.getAttribute('aria-checked')) === 'true') !== on) await loc.click();
}
async function preset(id) {
  const loc = page.locator(`#panel-root [data-preset="${id}"]`);
  await loc.scrollIntoViewIfNeeded();
  await loc.click();
  await sleep(250);
}
async function back() {
  await btn('設計に戻る').click();
  await waitMode('design');
  await sleep(900);
}
async function waitFlightFraction(f) {
  await page.waitForFunction((ff) => {
    const s = window.__lab.state();
    return s.mode !== 'flight' || (s.flying && s.flying.windup <= 0 && s.flying.time >= ff * s.result.airtime);
  }, f, { timeout: 120000, polling: 16 });
}
/**
 * 飛ばして、途中と着地後の画面写真を撮る。
 * opts: { camera:'chase'|'side'|'top', at:[0.5]（撮る時点＝飛行時間に対する割合）, full:true なら最後まで飛ばす, track:true なら傾きを記録 }
 */
async function flyAndCapture(prefix, opts = {}) {
  const camera = opts.camera || 'side';
  const at = opts.at || [0.5];
  await page.locator('#panel-root [data-action="fly"]').click();
  await waitMode('flight');
  const camText = { chase: '追いかけ', side: '横から', top: '上から' }[camera];
  await btn(camText).click();
  const shots = [];
  const series = [];
  let tracking = null;
  if (opts.track) {
    tracking = setInterval(async () => {
      try { const s = await st(); if (s.mode === 'flight' && s.flying.windup <= 0) series.push({ t: +s.flying.time.toFixed(2), bank: +s.sample.bank.toFixed(1), pitch: +s.sample.pitch.toFixed(1) }); } catch { /* 閉じた */ }
    }, 120);
  }
  for (let i = 0; i < at.length; i++) {
    await waitFlightFraction(at[i]);
    if ((await st()).mode !== 'flight') break;
    await btn('一時停止').click();
    await sleep(450);
    shots.push(await shot(`${prefix}_${camera}_${Math.round(at[i] * 100)}.png`));
    await btn('再開').click();
  }
  if (!opts.full) { if ((await st()).mode === 'flight') await btn('やめる').click(); }
  await waitMode('result');
  if (tracking) clearInterval(tracking);
  await sleep(1600);
  shots.push(await shot(`${prefix}_result.png`));
  const s = await st();
  return { shots, result: s.result, comment: s.comment, trails: s.trails.length, fpsLog: s.fpsLog, series };
}
const pick = (r) => ({ distance: +r.result.distance.toFixed(2), airtime: +r.result.airtime.toFixed(2), maxHeight: +r.result.maxHeight.toFixed(2), glideRatio: r.result.glideRatio === null ? null : +r.result.glideRatio.toFixed(2), landingZ: +r.result.landing[2].toFixed(2), kind: r.comment.kind, headline: r.comment.headline, text: r.comment.text });
/** 結果の画面で、引いて上から見下ろす（軌跡の全体を写す） */
async function overview(name, wheel = 2200, drag = 150) {
  const w = 1440, h = 900;
  await page.mouse.move(w / 2, h * 0.4);
  await page.mouse.wheel(0, wheel);
  await page.mouse.down();
  await page.mouse.move(w / 2 + 10, h * 0.4 + drag, { steps: 8 });
  await page.mouse.up();
  await sleep(1300);
  return shot(name);
}

// =====================================================================
await open({ offline: true });

// ---- 1. ダブルクリックで起動、ネットなしで動く ----
if (want(1)) {
  await sleep(500);
  const title = await shot('01_title.png');
  await waitMode('design');
  await sleep(600);
  const help = await shot('01_first_help.png');
  const html = readFileSync(DIST, 'utf8');
  out.c1 = {
    url: URL_,
    offline: true,
    fileSizeKB: Math.round(html.length / 1024),
    externalScriptOrLink: /<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i.test(html),
    loaded: (await st()).mode === 'design',
    shots: [title, help],
  };
}

// ---- 2. 起動から3回以内のクリックで飛ばせる ----
if (want(2)) {
  await waitMode('design');
  await sleep(400);
  const before = await page.evaluate(() => window.__clicks);
  await btn('はじめる').click();
  await sleep(500);
  await page.locator('#panel-root [data-action="fly"]').click();
  await waitMode('flight');
  const clicks = (await page.evaluate(() => window.__clicks)) - before;
  await waitFlightFraction(0.4);
  const s1 = await shot('02_first_flight.png');
  out.c2 = { clicks, steps: ['「はじめる」', '「飛ばす」'], mode: (await st()).mode, shots: [s1] };
  await waitMode('result');
  await sleep(1500);
  out.c2.shots.push(await shot('02_first_result.png'));
  await back();
} else {
  await startFresh();
}

// ---- 3. お手本5種類の飛び方が違う ----
if (want(3)) {
  out.c3 = { flights: {} };
  for (const id of ['basic', 'speed', 'floaty', 'stunt', 'fail']) {
    await preset(id);
    const design = await shot(`03_${id}_design.png`);
    const r = await flyAndCapture(`03_${id}`, { camera: 'side', at: id === 'stunt' ? [0.12, 0.5] : [0.5], full: true });
    out.c3.flights[id] = { ...pick(r), shots: [design, ...r.shots] };
    if (id === 'fail') out.c3.overview = await overview('03_all_trails.png');
    await back();
  }
  const kinds = Object.values(out.c3.flights).map((f) => f.kind);
  out.c3.allDifferent = new Set(kinds).size === 5;
}

// ---- 4. 入門型の重り：前端 → 中央 → 後端 ----
if (want(4)) {
  out.c4 = { flights: {} };
  await preset('basic');
  for (const [name, pos] of [['front', 0], ['center', 50], ['rear', 100]]) {
    await setParam('weightPos', pos);
    await sleep(200);
    const design = await shot(`04_${name}_design.png`);
    const r = await flyAndCapture(`04_${name}`, { camera: 'side', at: [0.35, 0.7], full: true });
    out.c4.flights[name] = { weightPos: pos, ...pick(r), shots: [design, ...r.shots] };
    if (name === 'rear') out.c4.overview = await overview('04_three_trails.png', 1500, 60);
    await back();
  }
  const k = out.c4.flights;
  out.c4.ok = k.front.kind === 'dive' && k.center.kind === 'glide' && k.rear.kind === 'stall';
}

// ---- 5. 上反角0°と10°、横風の中 ----
if (want(5)) {
  out.c5 = { flights: {} };
  await preset('basic');
  await setParam('windSpeed', 2);
  await setParam('windDir', 90);
  for (const d of [10, 0]) {
    await setParam('wingDihedral', d);
    await sleep(200);
    const r = await flyAndCapture(`05_dihedral${d}`, { camera: 'chase', at: [0.12, 0.5, 0.85], full: true, track: true });
    const late = r.series.filter((p) => p.t > 0.6 * r.result.airtime);
    const lateBank = late.length ? late.reduce((a, p) => a + Math.abs(p.bank), 0) / late.length : null;
    const maxBank = r.series.reduce((a, p) => Math.max(a, Math.abs(p.bank)), 0);
    out.c5.flights[`dihedral${d}`] = { dihedral: d, ...pick(r), maxBank: +maxBank.toFixed(1), lateBankAvg: lateBank === null ? null : +lateBank.toFixed(1), series: r.series.filter((_, i) => i % 4 === 0), shots: r.shots };
    if (d === 0) out.c5.overview = await overview('05_two_trails_top.png', 1700, 330);
    await back();
  }
  const a = out.c5.flights.dihedral10, b = out.c5.flights.dihedral0;
  out.c5.ok = a.lateBankAvg !== null && b.lateBankAvg !== null && a.lateBankAvg < b.lateBankAvg && a.kind !== b.kind;
}

// ---- 6. 風を強くすると風下へ流される ----
if (want(6)) {
  out.c6 = { flights: {} };
  await preset('basic');
  await setParam('windDir', 90);
  for (const w of [0, 2, 4]) {
    await setParam('windSpeed', w);
    await sleep(200);
    const r = await flyAndCapture(`06_wind${w}`, { camera: 'top', at: [0.6], full: true });
    out.c6.flights[`wind${w}`] = { windSpeed: w, ...pick(r), shots: r.shots };
    if (w === 4) out.c6.overview = await overview('06_wind_trails_top.png', 1700, 330);
    await back();
  }
  const f = out.c6.flights;
  // 風は右（+z）から吹く → 風下は左（−z）
  out.c6.ok = Math.abs(f.wind0.landingZ) < 3 && f.wind2.landingZ < -5 && f.wind4.landingZ < -5;
}

// ---- 7. 同じ設計・同じ条件なら結果が完全に一致 ----
if (want(7)) {
  await preset('basic');
  await setParam('windSpeed', 1.5);
  await setParam('windDir', 60);
  await setSwitch('updraft', true);
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const r = await flyAndCapture(`07_run${i + 1}`, { camera: 'side', at: [], full: false });
    runs.push({ result: r.result, text: r.comment.text, shots: r.shots });
    await back();
  }
  out.c7 = {
    run1: runs[0].result, run2: runs[1].result,
    identical: JSON.stringify(runs[0].result) === JSON.stringify(runs[1].result) && runs[0].text === runs[1].text,
    shots: [...runs[0].shots, ...runs[1].shots],
  };
  await setSwitch('updraft', false);
}

// ---- 8. 前回までの軌跡が最大3本重なる ----
if (want(8)) {
  await preset('basic');
  const counts = [];
  const setups = [{ throwHeading: -20 }, { throwHeading: -7 }, { throwHeading: 7 }, { throwHeading: 20 }, { throwHeading: 0, throwPitch: 15 }];
  let last;
  for (let i = 0; i < setups.length; i++) {
    for (const k in setups[i]) await setParam(k, setups[i][k]);
    last = await flyAndCapture(`08_flight${i + 1}`, { camera: 'side', at: [], full: false });
    counts.push(last.trails);
    if (i < setups.length - 1) await back();
  }
  const ov = await overview('08_trails_overview.png', 1900, 260);
  const s = await st();
  out.c8 = { trailCounts: counts, final: s.trails.map((t) => ({ color: t.color, current: t.current, distance: +t.distance.toFixed(2) })), maxOld: s.trails.filter((t) => !t.current).length, shots: [ov, ...last.shots] };
  out.c8.ok = Math.max(...counts) === 4 && out.c8.maxOld === 3 && new Set(s.trails.map((t) => t.color)).size === 4;
  await back();
}

// ---- 9. 力の矢印を表示／非表示 ----
if (want(9)) {
  await preset('basic');
  const tb = page.locator('#overlay-root .ov-tbtn[data-key="arrows"]');
  if ((await st()).settings.showArrows) await tb.click();
  await page.locator('#panel-root [data-action="fly"]').click();
  await waitMode('flight');
  await btn('追いかけ').click();
  await waitFlightFraction(0.4);
  await btn('一時停止').click();
  await sleep(500);
  const off = await page.screenshot({ path: join(SHOTS, '09_arrows_off.png') });
  await tb.click();
  await sleep(500);
  const on = await page.screenshot({ path: join(SHOTS, '09_arrows_on.png') });
  const onState = (await st()).settings.showArrows;
  await btn('横から').click();
  await sleep(900);
  await shot('09_arrows_on_side.png');
  await tb.click();
  await sleep(400);
  const off2 = await page.screenshot({ path: join(SHOTS, '09_arrows_off_again.png') });
  const offState = (await st()).settings.showArrows;
  out.c9 = { onState, offState, picturesDiffer: !on.equals(off), shots: ['09_arrows_off.png', '09_arrows_on.png', '09_arrows_on_side.png', '09_arrows_off_again.png'] };
  out.c9.ok = onState === true && offState === false && !on.equals(off);
  await btn('やめる').click();
  await waitMode('result');
  await back();
}

// ---- 10. 着地のあと一言解説。失敗例では直し方 ----
if (want(10)) {
  await preset('fail');
  const r = await flyAndCapture('10_fail', { camera: 'side', at: [0.5], full: true });
  const visible = await page.locator('#overlay-root').getByText(r.comment.text.slice(0, 12)).first().isVisible().catch(() => false);
  out.c10 = { ...pick(r), commentVisible: visible, hasFix: /重りを前へずらしてみましょう/.test(r.comment.text), shots: r.shots };
  out.c10.ok = visible && out.c10.hasFix;
  await back();
}

// ---- 13. 遊び方をいつでも開ける（設計・飛行中・結果）----
if (want(13)) {
  const helpBtn = page.locator('#overlay-root .ov-tbtn[data-key="help"]');
  const helpOpen = async () => btn('閉じる').isVisible().catch(() => false);
  const res = {};
  await preset('basic');
  await helpBtn.click(); await sleep(500);
  res.design = await helpOpen(); await shot('13_help_design.png');
  await btn('閉じる').click(); await sleep(400);
  await page.locator('#panel-root [data-action="fly"]').click();
  await waitMode('flight');
  await waitFlightFraction(0.3);
  await btn('一時停止').click();
  await helpBtn.click(); await sleep(500);
  res.flight = await helpOpen(); await shot('13_help_flight.png');
  await btn('閉じる').click(); await sleep(300);
  await btn('やめる').click();
  await waitMode('result'); await sleep(1200);
  await helpBtn.click(); await sleep(500);
  res.result = await helpOpen(); await shot('13_help_result.png');
  await btn('閉じる').click(); await sleep(300);
  // キー（H）でも開ける
  await page.keyboard.press('h'); await sleep(400);
  res.byKey = await helpOpen();
  await page.keyboard.press('Escape'); await sleep(300);
  await back();
  out.c13 = { ...res, shots: ['13_help_design.png', '13_help_flight.png', '13_help_result.png'] };
  out.c13.ok = res.design && res.flight && res.result && res.byKey;
}

// ---- 12. 毎秒のコマ数（飛行中に50以上）----
if (want(12)) {
  const fb = page.locator('#overlay-root .ov-tbtn[data-key="fps"]');
  if (!(await st()).settings.showFps) await fb.click();
  out.c12 = { headless, flights: {} };
  const cases = [['basic', {}], ['speed', {}], ['floaty', {}], ['stunt', {}], ['basic_wind_updraft', { windSpeed: 4, updraft: true }]];
  for (const [name, extra] of cases) {
    await preset(name.startsWith('basic') ? 'basic' : name);
    if (extra.windSpeed) await setParam('windSpeed', extra.windSpeed);
    if (extra.updraft) await setSwitch('updraft', true);
    const cams = name === 'basic' ? ['chase', 'side', 'top'] : ['chase'];
    for (const cam of cams) {
      const r = await flyAndCapture(`12_${name}_${cam}`, { camera: cam, at: [], full: true });
      // 途中で止めずに最後まで飛ばしたときの、0.5秒ごとのコマ数
      const log = r.fpsLog;
      out.c12.flights[`${name}_${cam}`] = { min: Math.min(...log), avg: +(log.reduce((a, b) => a + b, 0) / log.length).toFixed(1), samples: log.length, log };
      await back();
    }
    if (extra.updraft) await setSwitch('updraft', false);
  }
  // コマ数の表示つきの画面写真
  await preset('basic');
  await page.locator('#panel-root [data-action="fly"]').click();
  await waitMode('flight');
  await waitFlightFraction(0.5);
  await shot('12_fps_shown.png');
  await btn('やめる').click();
  await waitMode('result');
  await back();
  await fb.click(); await sleep(300);
  await shot('12_fps_hidden.png');
  const s = await st();
  out.c12.render = s.render;
  out.c12.minOverall = Math.min(...Object.values(out.c12.flights).map((f) => f.min));
  out.c12.ok = out.c12.minOverall >= 50;
  out.c12.shots = ['12_fps_shown.png', '12_fps_hidden.png'];
}

// ---- 11. 設計を保存し、閉じて開き直しても残る ----
if (want(11)) {
  await preset('floaty');
  await setParam('wingDihedral', 17);
  await setParam('weightMass', 1.3);
  const name = '確認用の設計';
  const nameBox = page.locator('#panel-root [data-role="save-name"]');
  await nameBox.scrollIntoViewIfNeeded();
  await nameBox.fill(name);
  await page.locator('#panel-root [data-action="save"]').click();
  await sleep(500);
  const savedSetup = (await st()).setup;
  const s1 = await shot('11_saved.png');
  const before = (await st()).saves;
  await context.close(); // ブラウザを閉じる
  await open({ offline: true }); // 開き直す
  await waitMode('design');
  await sleep(600);
  const helpShownAgain = await btn('はじめる').isVisible().catch(() => false);
  const after = (await st()).saves;
  const row = page.locator('#panel-root .pn-save', { hasText: name });
  await row.scrollIntoViewIfNeeded();
  const s2 = await shot('11_reopened.png');
  await row.locator('button', { hasText: '読み込む' }).click();
  await sleep(500);
  const loaded = (await st()).setup;
  const s3 = await shot('11_loaded.png');
  out.c11 = { name, before, after, helpShownAgain, sameSetup: JSON.stringify(savedSetup) === JSON.stringify(loaded), shots: [s1, s2, s3] };
  out.c11.ok = after.includes(name) && out.c11.sameSetup;
}

await context.close();
out.consoleErrorCount = out.consoleErrors.length;
writeFileSync(dataFile, JSON.stringify(out, null, 1));
const summary = {};
for (const k of Object.keys(out)) if (/^c\d+$/.test(k)) summary[k] = out[k].ok ?? out[k].allDifferent ?? out[k].identical ?? out[k].loaded ?? out[k].clicks;
console.log(JSON.stringify(summary, null, 1));
console.log('コンソールのエラー:', out.consoleErrors.length, ' 警告:', out.consoleWarnings.length, ' 外部への通信:', out.externalRequests.length);
if (out.consoleErrors.length) console.log(out.consoleErrors.slice(0, 5).join('\n'));
