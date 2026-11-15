// 重ねる表示部品の単体確認。?case=title|help|help2|design|flight|flight2|result|result-fail
import { createOverlays } from '../../../src/ui/overlays.js';

const q = new URLSearchParams(location.search);
const kase = q.get('case') || 'design';

const app = document.getElementById('app');
app.style.background = 'linear-gradient(180deg, #5aa9e6 0%, #a9d6f2 46%, #cfe9f5 55%, #86bd62 56%, #6aa84f 100%)';
// 紙飛行機の代わりの目印（3Dの景色の代用）
const dummy = document.createElement('div');
dummy.style.cssText = 'position:absolute;left:62%;top:58%;width:90px;height:50px;background:#fff;opacity:.9;clip-path:polygon(0 40%,100% 0,40% 100%)';
app.insertBefore(dummy, document.getElementById('panel-root'));

const designLike = ['design', 'help', 'help2'].includes(kase);
if (designLike) {
  const p = document.createElement('div');
  p.style.cssText = 'width:372px;height:100%;background:#fffdf6;border-right:1px solid #e6dcc4;box-shadow:4px 0 18px rgba(31,60,90,.18);padding:20px;font-size:15px;color:#5b6675';
  p.textContent = '（設計パネルの代わり）';
  document.getElementById('panel-root').appendChild(p);
}

const log = [];
const ov = createOverlays(document.getElementById('overlay-root'), {
  onToggleArrows: (b) => { log.push('arrows ' + b); ov.setToggles({ arrows: b }); },
  onToggleFps: (b) => { log.push('fps ' + b); ov.setToggles({ fps: b }); },
  onToggleMute: (b) => { log.push('mute ' + b); ov.setToggles({ muted: b }); },
  onHelp: () => ov.openHelp(false),
  onHelpClosed: () => log.push('helpClosed'),
  onCamera: (m) => ov.setFlightState({ camera: m }),
  onPause: () => log.push('pause'),
  onSlow: () => log.push('slow'),
  onStop: () => log.push('stop'),
  onBack: () => log.push('back'),
});
window.__ov = ov; window.__log = log;

const trails = [
  { color: '#ff7a2f', distance: 12.3, airtime: 3.24, current: true },
  { color: '#2f80ed', distance: 9.8, airtime: 2.71, current: false },
  { color: '#27ae60', distance: 15.6, airtime: 4.05, current: false },
  { color: '#9b51e0', distance: 6.4, airtime: 1.92, current: false },
];

switch (kase) {
  case 'title':
    ov.setMode('title');
    ov.showTitle().then(() => { window.__titleDone = true; });
    break;
  case 'help':
    ov.setMode('design'); ov.setToggles({ arrows: true, fps: true, muted: false }); ov.setFps(60);
    ov.openHelp(true);
    break;
  case 'help2':
    ov.setMode('design'); ov.setToggles({ arrows: false, fps: false, muted: true });
    ov.openHelp(false);
    break;
  case 'design':
    ov.setMode('design'); ov.setToggles({ arrows: true, fps: true, muted: false }); ov.setFps(58);
    break;
  case 'flight':
    ov.setMode('flight'); ov.setToggles({ arrows: true, fps: true, muted: true }); ov.setFps(42);
    ov.setFlightState({ camera: 'chase', paused: false, slow: true });
    ov.updateHud({ speed: 3.8, height: 2.4, distance: 12.3, time: 3.2, pitch: 5, bank: 3, stall: 0.8 });
    break;
  case 'flight2':
    ov.setMode('flight'); ov.setToggles({ arrows: false, fps: true, muted: false }); ov.setFps(24);
    ov.setFlightState({ camera: 'side', paused: true, slow: false });
    ov.updateHud({ speed: 5.2, height: 1.1, distance: 4.7, time: 1.0, pitch: -12, bank: -7, stall: 0.1 });
    break;
  case 'result':
    ov.setMode('result'); ov.setToggles({ arrows: true, fps: false, muted: false });
    ov.updateHud({ speed: 0, height: 0, distance: 12.3, time: 3.2, pitch: 0, bank: 0, stall: 0 });
    ov.showResult({
      kind: 'glide', headline: 'まっすぐ滑空',
      text: '重心がちょうどよい位置にあり、機首の上下も左右の傾きも安定して、まっすぐ滑空しました。滑空比は6.8（1m下がる間に6.8m前進）でした。',
      distance: 12.3, airtime: 3.24, maxHeight: 2.4, glideRatio: 6.8, endReason: 'ground', trails,
    });
    break;
  case 'result-fail':
    ov.setMode('result'); ov.setToggles({ arrows: false, fps: true, muted: false }); ov.setFps(61);
    ov.updateHud({ speed: 0, height: 0, distance: 3.1, time: 1.6, pitch: -40, bank: 12, stall: 1 });
    ov.showResult({
      kind: 'stall', headline: '失速をくり返した',
      text: '釣り合う速さ（約3.4m/s）より速く・上向きに投げたため、上昇して速さを失い、機首が最大52°まで上がり、失速を3回くり返して波打つように落ちました。もう少しゆっくり、水平に近く投げてみましょう。',
      distance: 3.1, airtime: 1.64, maxHeight: 2.9, glideRatio: null, endReason: 'ground',
      trails: trails.slice(0, 2),
    });
    break;
}
