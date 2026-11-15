// 設計パネルを単体で表示して確かめるデモ。
//   node build.mjs --entry=scripts/dev/demos/panel.js --out=.tmp/panel.html --minify=false
//   URL の ?case= : default / fail / limits / saves / full / scroll
import { createPanel } from '../../../src/ui/panel.js';
import { buildAircraft, clampParam, sanitizeSetup } from '../../../src/core/aircraft.js';
import { analyzeDesign } from '../../../src/core/aero.js';
import { presetSetup } from '../../../src/core/presets.js';
import { defaultSetup, MAX_SAVES } from '../../../src/core/config.js';

const kase = new URLSearchParams(location.search).get('case') || 'default';

// 背景（本番では #view の3D。ここでは空から草へのグラデーション）
const style = document.createElement('style');
style.textContent = 'body{background:linear-gradient(180deg,#7cc0ee 0%,#cfe9f7 55%,#9ccf7a 56%,#6fb85c 100%)!important}';
document.head.append(style);

let setup = defaultSetup();
let activePreset = 'basic';
let saves = [];

if (kase === 'fail') { setup = presetSetup('fail'); activePreset = 'fail'; }
if (kase === 'wind') { setup = { ...setup, windSpeed: 3, windDir: 45, updraft: true, weightPos: 20, tailAngle: -3 }; activePreset = null; }
if (kase === 'limits') { setup = sanitizeSetup({ ...setup, tailSpan: 18 }); activePreset = null; }
if (kase === 'saves' || kase === 'full') {
  const now = Date.now();
  const names = ['長く飛ぶ試作', '風に強い型', 'スピード重視', '翼を広げた版', '重り前めテスト', '尾翼大きめ', '失敗の記録', '最終案', '朝の実験', '先端クリップ'];
  const presets = ['basic', 'speed', 'floaty', 'stunt', 'fail'];
  const n = kase === 'full' ? MAX_SAVES : 3;
  for (let i = 0; i < n; i++) saves.push({ name: names[i], setup: presetSetup(presets[i % 5]), savedAt: now - i * 3600e3 * 7 });
}

let panel;
function refresh() {
  const ac = buildAircraft(setup);
  panel.setSetup(setup, ac, analyzeDesign(ac));
  panel.setActivePreset(activePreset);
}

panel = createPanel(document.getElementById('panel-root'), {
  setup, saves, maxSaves: MAX_SAVES,
  onChange(key, value) {
    setup = { ...setup, [key]: clampParam(setup, key, value) };
    activePreset = null;
    refresh();
  },
  onPreset(id) { setup = presetSetup(id); activePreset = id; refresh(); },
  onFly() { document.title = '飛ばす！'; },
  onSave(name) {
    if (saves.length >= MAX_SAVES) return { ok: false, error: `保存できるのは${MAX_SAVES}個までです。いらない設計を削除してください。` };
    saves = [{ name, setup: { ...setup }, savedAt: Date.now() }, ...saves];
    panel.setSaves(saves);
    return { ok: true };
  },
  onLoad(i) { setup = sanitizeSetup(saves[i].setup); activePreset = null; refresh(); },
  onDelete(i) { saves = saves.filter((_, k) => k !== i); panel.setSaves(saves); },
});
refresh();
panel.setSaves(saves);
window.__panel = panel;

if (kase === 'full') {
  setTimeout(() => { panel.el.querySelector('.pn-save-btn').click(); const s = panel.el.querySelector('.pn-scroll'); s.scrollTop = panel.el.querySelector('.pn-saveform').offsetTop - 330; }, 50);
}
if (kase === 'scroll' || kase === 'wind') {
  setTimeout(() => { const s = panel.el.querySelector('.pn-scroll'); s.scrollTop = s.scrollHeight; }, 50);
}
