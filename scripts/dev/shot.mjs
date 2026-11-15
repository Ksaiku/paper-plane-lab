// 画面写真を撮る開発用の道具。
//   node scripts/dev/shot.mjs <html または URL> <png> [--w=1440] [--h=900] [--wait=1500] [--eval="JS"] [--headed]
// コンソールのエラーも表示する。
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [src, png, ...rest] = process.argv.slice(2);
const a = Object.fromEntries(rest.map((x) => { const m = x.replace(/^--/, ''); const i = m.indexOf('='); return i < 0 ? [m, true] : [m.slice(0, i), m.slice(i + 1)]; }));
const url = /^https?:|^file:/.test(src) ? src : pathToFileURL(resolve(src)).href;
const browser = await chromium.launch({
  channel: 'msedge', headless: !a.headed,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(a.w || 1440), height: Number(a.h || 900) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(a.wait || 1500));
if (a.eval) { const r = await page.evaluate(a.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(Number(a.wait2 || 500)); }
await page.screenshot({ path: png });
await browser.close();
console.log(errors.length ? errors.join('\n') : 'コンソールのエラーなし');
console.log('saved', png);
