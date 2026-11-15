// ============================================================
// 3D画面の上に重ねる表示部品：タイトル・遊び方・右上のボタン・計器・操作バー・結果カード・ヒント
// 部品は自分では状態を変えない。ボタンを押すと handlers を呼び、呼ぶ側が set* で状態を返す（一方通行）。
// ============================================================

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(html, cls) {
  const d = document.createElement('span');
  d.className = cls || 'ov-ico';
  d.innerHTML = html;
  return d;
}
const f1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');

// ---------- アイコン（自作のインライン SVG）----------
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  arrows: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19V6M5 6l-3 3.2M5 6l3 3.2"/><path d="M12 5v10M12 15l-3-3.2M12 15l3-3.2" /><path d="M17 8l4 8M21 16l-4.2-.6M21 16l.8-4.2"/></svg>`,
  fps: `<svg viewBox="0 0 24 24" ${S}><path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5.6"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" ${S}><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fill-opacity=".18"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" ${S}><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fill-opacity=".18"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`,
  help: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 1 1 4 2.3c-.9.5-1.4 1-1.4 2"/><circle cx="12" cy="16.9" r=".8" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7z"/></svg>`,
  slow: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2"/><path d="M9.5 2.8h5"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${S}><path d="M10 6l-6 6 6 6"/><path d="M4 12h11a5 5 0 0 1 0 10h-3" transform="translate(0 -5)"/></svg>`,
  good: `<svg viewBox="0 0 24 24" ${S}><path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.8"/></svg>`,
  caution: `<svg viewBox="0 0 24 24" ${S}><path d="M12 6v7.5" stroke-width="3"/><circle cx="12" cy="18" r="1.3" fill="currentColor"/></svg>`,
  fun: `<svg viewBox="0 0 24 24" ${S}><path d="M12 3.5l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.3 6.9 19.1 8 13.4 3.8 9.5l5.7-.7z" fill="currentColor" fill-opacity=".25"/></svg>`,
  away: `<svg viewBox="0 0 24 24" ${S}><path d="M4 12h14M13 6l6 6-6 6" stroke-width="2.6"/></svg>`,
};

const LOGO = `<svg viewBox="0 0 180 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ovPaperA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef4fb"/></linearGradient>
    <linearGradient id="ovPaperB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3e2f2"/><stop offset="1" stop-color="#b6cde6"/></linearGradient>
  </defs>
  <path d="M164 14 L8 60 L70 78 Z" fill="url(#ovPaperA)"/>
  <path d="M164 14 L70 78 L84 118 Z" fill="url(#ovPaperB)"/>
  <path d="M164 14 L84 118 L98 86 Z" fill="#e4eef9"/>
  <path d="M70 78 L98 86" stroke="#9db8d6" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  <path d="M164 14 L70 78" stroke="#b4c9e0" stroke-width="1.4" stroke-linecap="round" fill="none"/>
</svg>`;

// ---------- 遊び方の絵 ----------
const STEP_ICONS = [
  `<svg viewBox="0 0 40 40" ${S}><path d="M7 12h26M7 20h26M7 28h26" stroke="#9fb7cf"/><circle cx="14" cy="12" r="3.4" fill="#ff7a2f" stroke="#fff"/><circle cx="26" cy="20" r="3.4" fill="#2f8fdd" stroke="#fff"/><circle cx="18" cy="28" r="3.4" fill="#5fae4e" stroke="#fff"/></svg>`,
  `<svg viewBox="0 0 40 40"><rect x="5" y="10" width="30" height="20" rx="10" fill="#ff7a2f"/><path d="M16.500 14.500v11l9-5.500z" fill="#fff"/></svg>`,
  `<svg viewBox="0 0 40 40" ${S}><rect x="5" y="9" width="30" height="16" rx="4" stroke="#5b6675"/><path d="M5 25l8-6 6 4 5-5 11 7" stroke="#5fae4e"/><rect x="9" y="30" width="5" height="5" rx="1" fill="#2b3440" stroke="none"/><rect x="17.500" y="30" width="2" height="5" fill="#2b3440" stroke="none"/><rect x="22" y="30" width="2" height="5" fill="#2b3440" stroke="none"/><rect x="27" y="30" width="5" height="5" rx="1" fill="#e0a31a" stroke="none"/></svg>`,
  `<svg viewBox="0 0 40 40"><rect x="5" y="8" width="30" height="24" rx="5" fill="#fff" stroke="#c9bfa5" stroke-width="2"/><rect x="9" y="13" width="7" height="8" rx="2" fill="#ffe3cc"/><rect x="18" y="13" width="7" height="8" rx="2" fill="#dcecfa"/><rect x="27" y="13" width="4" height="8" rx="2" fill="#dff1da"/><path d="M9 26h22M9 29.500h14" stroke="#8b95a3" stroke-width="2" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 40 40" fill="none" stroke-width="3" stroke-linecap="round"><path d="M5 31C13 31 17 12 35 10" stroke="#ff7a2f"/><path d="M5 31C13 31 19 20 35 20" stroke="#2f80ed"/><path d="M5 31C14 31 20 27 35 28" stroke="#27ae60"/><path d="M5 31C12 32 22 34 35 34" stroke="#9b51e0"/></svg>`,
];
const STEPS = [
  ['お手本を選ぶ、またはスライダーで形・重り・投げ方・風を変えます。設計図もすぐ変わります。'],
  ['「飛ばす」ボタンを押します。'],
  ['飛行中は、カメラ（追いかけ／横から／上から）、一時停止、スロー（0.25倍）が使えます。'],
  ['着地すると、飛距離・滞空時間・最高の高さ・滑空比と、なぜそう飛んだかの一言解説が出ます。'],
  ['設計に戻っても軌跡は残ります。前の飛び方と比べてみましょう。軌跡は最大4本まで重ねて見られます。'],
];
const TRIES = [
  '重りを前端・中央・後端にして、それぞれ飛ばす',
  '上反角を0°と10°にして、横風の中で飛ばす',
  '垂直尾翼を小さくして飛ばす',
];
const KEYS = [
  ['Space', '飛ばす・一時停止'], ['C', 'カメラ'], ['S', 'スロー'], ['F', '力の矢印'],
  ['M', '消音'], ['H', '遊び方'], ['Enter / Esc', '設計に戻る'],
];

const KIND_STYLE = {
  glide: ['good', 'good'], float: ['good', 'good'], fast: ['good', 'good'], drift: ['good', 'good'], wave: ['good', 'good'],
  stall: ['caution', 'caution'], dive: ['caution', 'caution'], tumble: ['caution', 'caution'],
  spin: ['caution', 'caution'], wobble: ['caution', 'caution'], spiral: ['caution', 'caution'],
  loop: ['fun', 'fun'], away: ['away', 'away'],
};
const CAMERAS = [['chase', '追いかけ'], ['side', '横から'], ['top', '上から']];
const MODES = ['title', 'design', 'flight', 'result'];

export function createOverlays(root, handlers = {}) {
  const call = (name, ...a) => { if (typeof handlers[name] === 'function') handlers[name](...a); };
  root.classList.add('ov-root');
  root.dataset.mode = 'design';

  let mode = 'design';
  let hasResult = false;
  let helpOpen = false;
  let toggles = { arrows: false, fps: false, muted: false };
  let flight = { camera: 'chase', paused: false, slow: false };
  const parts = {}; // 名前 → { el, modes, extra }

  function addPart(name, el, modes) {
    el.classList.add('ov-part');
    root.appendChild(el);
    parts[name] = { el, modes };
    return el;
  }

  // ================= 右上のボタン列 =================
  const bar = h('div', 'ov-topbar');
  function topBtn(key, icon, label, tip, keyHint, onClick) {
    const b = h('button', 'ov-tbtn');
    b.type = 'button';
    b.dataset.tip = keyHint === '—' ? tip : `${tip}（${keyHint}）`;
    b.appendChild(svgEl(icon));
    b.appendChild(h('span', 'ov-tbtn-t', label));
    b.addEventListener('click', onClick);
    b.dataset.key = key;
    bar.appendChild(b);
    return b;
  }
  const bArrows = topBtn('arrows', ICON.arrows, '力の矢印', '揚力・抗力・重力の矢印を表示', 'F', () => call('onToggleArrows', !toggles.arrows));
  const bFps = topBtn('fps', ICON.fps, 'コマ数', '毎秒のコマ数を表示', '—', () => call('onToggleFps', !toggles.fps));
  const bSound = topBtn('sound', ICON.sound, '音', '音のオン／消音', 'M', () => call('onToggleMute', !toggles.muted));
  const bHelp = topBtn('help', ICON.help, '遊び方', '遊び方を開く', 'H', () => call('onHelp'));
  addPart('topbar', bar, ['design', 'flight', 'result']);

  const fpsBox = h('div', 'ov-fps');
  const fpsNum = h('span', 'ov-fps-n num', '--');
  fpsBox.append(fpsNum, h('span', 'ov-fps-u', 'コマ/秒'));
  addPart('fps', fpsBox, []); // 表示は syncFps で決める

  function setBtn(b, on) {
    b.classList.toggle('is-on', !!on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function syncToggles() {
    setBtn(bArrows, toggles.arrows);
    setBtn(bFps, toggles.fps);
    setBtn(bSound, !toggles.muted);
    const ico = bSound.querySelector('.ov-ico');
    const want = toggles.muted ? 'mute' : 'sound';
    if (ico.dataset.k !== want) { ico.innerHTML = ICON[want]; ico.dataset.k = want; }
    bSound.classList.toggle('is-muted', !!toggles.muted);
    syncParts();
  }

  // ================= 計器 =================
  const hud = h('div', 'ov-hud');
  const big = h('div', 'ov-hud-big');
  const cache = new Map();
  function setText(node, key, text) {
    if (cache.get(key) === text) return;
    cache.set(key, text);
    node.textContent = text;
  }
  function bigCell(label, unit) {
    const c = h('div', 'ov-hud-cell');
    const v = h('div', 'ov-hud-v');
    const n = h('span', 'ov-hud-n num', '0.0');
    v.append(n, h('span', 'ov-hud-u', unit));
    c.append(h('div', 'ov-hud-l', label), v);
    big.appendChild(c);
    return n;
  }
  const nSpeed = bigCell('速さ', 'm/s');
  const nHeight = bigCell('高さ', 'm');
  const nDist = bigCell('距離', 'm');
  const nTime = bigCell('時間', '秒');
  const small = h('div', 'ov-hud-small');
  function smallCell(label) {
    const c = h('div', 'ov-hud-sc');
    const v = h('span', 'ov-hud-sv num', '—');
    c.append(h('span', 'ov-hud-sl', label), v);
    small.appendChild(c);
    return v;
  }
  const nPitch = smallCell('機首');
  const nBank = smallCell('傾き');
  const lamp = h('div', 'ov-lamp');
  lamp.append(h('span', 'ov-lamp-dot'), h('span', 'ov-lamp-t', '失速'));
  small.appendChild(lamp);
  hud.append(big, small);
  addPart('hud', hud, ['flight', 'result']);

  const tags = h('div', 'ov-tags');
  const tagSlow = h('span', 'ov-tag ov-tag-slow', 'スロー ×0.25');
  const tagPause = h('span', 'ov-tag ov-tag-pause', '一時停止');
  tags.append(tagSlow, tagPause);
  addPart('tags', tags, ['flight']);

  // ================= 操作バー =================
  const ctl = h('div', 'ov-ctl');
  const camGroup = h('div', 'ov-cam');
  camGroup.appendChild(h('span', 'ov-kbd ov-kbd-lead', 'C'));
  const camBtns = {};
  const seg = h('div', 'ov-seg');
  for (const [id, label] of CAMERAS) {
    const b = h('button', 'ov-seg-b', label);
    b.type = 'button';
    b.addEventListener('click', () => call('onCamera', id));
    camBtns[id] = b;
    seg.appendChild(b);
  }
  camGroup.appendChild(seg);
  const bPause = h('button', 'ov-cbtn');
  bPause.type = 'button';
  const pauseIco = svgEl(ICON.pause);
  const pauseTxt = h('span', 'ov-cbtn-t', '一時停止');
  bPause.append(pauseIco, pauseTxt, h('span', 'ov-kbd', 'Space'));
  bPause.addEventListener('click', () => call('onPause'));
  const bSlow = h('button', 'ov-cbtn');
  bSlow.type = 'button';
  const slowSub = h('span', 'ov-cbtn-sub num', '0.25倍');
  bSlow.append(svgEl(ICON.slow), h('span', 'ov-cbtn-t', 'スロー'), slowSub, h('span', 'ov-kbd', 'S'));
  bSlow.addEventListener('click', () => call('onSlow'));
  const bStop = h('button', 'ov-cbtn ov-cbtn-stop');
  bStop.type = 'button';
  bStop.append(svgEl(ICON.stop), h('span', 'ov-cbtn-t', 'やめる'));
  bStop.addEventListener('click', () => call('onStop'));
  ctl.append(camGroup, h('span', 'ov-sep'), bPause, bSlow, h('span', 'ov-sep'), bStop);
  addPart('ctl', ctl, ['flight']);

  function syncFlight() {
    for (const id in camBtns) {
      const on = id === flight.camera;
      camBtns[id].classList.toggle('is-on', on);
      camBtns[id].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const pk = flight.paused ? 'play' : 'pause';
    if (pauseIco.dataset.k !== pk) { pauseIco.innerHTML = ICON[pk]; pauseIco.dataset.k = pk; }
    pauseTxt.textContent = flight.paused ? '再開' : '一時停止';
    bPause.classList.toggle('is-on', !!flight.paused);
    bSlow.classList.toggle('is-on', !!flight.slow);
    bSlow.setAttribute('aria-pressed', flight.slow ? 'true' : 'false');
    tagSlow.classList.toggle('is-on', !!flight.slow);
    tagPause.classList.toggle('is-on', !!flight.paused);
  }

  // ================= 結果カード =================
  const res = h('div', 'ov-result');
  const resLeft = h('div', 'ov-res-left');
  const resHead = h('div', 'ov-res-head');
  const resBadge = h('span', 'ov-res-badge');
  const resHeadline = h('h2', 'ov-res-headline');
  resHead.append(resBadge, resHeadline);
  const tiles = h('div', 'ov-tiles');
  function tile(label, unit) {
    const t = h('div', 'ov-tile');
    const n = h('span', 'ov-tile-n num', '0.0');
    const u = h('span', 'ov-tile-u', unit);
    const v = h('div', 'ov-tile-v');
    v.append(n, u);
    t.append(h('div', 'ov-tile-l', label), v);
    tiles.appendChild(t);
    return { n, u };
  }
  const tDist = tile('飛距離', 'm');
  const tAir = tile('滞空時間', '秒');
  const tMax = tile('最高の高さ', 'm');
  const tGlide = tile('滑空比', '');
  resLeft.append(resHead, tiles);
  const resRight = h('div', 'ov-res-right');
  const resTextWrap = h('div', 'ov-res-comment');
  resTextWrap.append(h('div', 'ov-res-label', '一言解説'));
  const resText = h('p', 'ov-res-text');
  resTextWrap.appendChild(resText);
  const resBottom = h('div', 'ov-res-bottom');
  const legend = h('div', 'ov-legend');
  const bBack = h('button', 'ov-back');
  bBack.type = 'button';
  bBack.append(h('span', 'ov-back-t', '設計に戻る'), h('span', 'ov-kbd ov-kbd-on', 'Enter'));
  bBack.addEventListener('click', () => call('onBack'));
  resBottom.append(legend, bBack);
  resRight.append(resTextWrap, resBottom);
  res.append(resLeft, resRight);
  addPart('result', res, []);

  function showResult(d) {
    const kind = d.kind || 'glide';
    const [tone, icon] = KIND_STYLE[kind] || ['good', 'good'];
    res.dataset.tone = tone;
    resBadge.innerHTML = ICON[icon] || ICON.good;
    resHeadline.textContent = d.headline || '';
    resText.textContent = d.text || '';
    tDist.n.textContent = f1(d.distance);
    tAir.n.textContent = f2(d.airtime);
    tMax.n.textContent = f1(d.maxHeight);
    if (d.glideRatio === null || d.glideRatio === undefined || !Number.isFinite(d.glideRatio)) {
      tGlide.n.textContent = '—';
      tGlide.u.textContent = '';
    } else {
      tGlide.n.textContent = f1(d.glideRatio);
      tGlide.u.textContent = '';
    }
    legend.textContent = '';
    let older = 0;
    for (const t of (d.trails || []).slice(0, 4)) {
      const row = h('div', 'ov-leg' + (t.current ? ' is-cur' : ''));
      const dot = h('span', 'ov-leg-dot');
      dot.style.background = t.color;
      const name = t.current ? '今回' : `${++older}つ前`;
      row.append(dot, h('span', 'ov-leg-n', name), h('span', 'ov-leg-v num', `${f1(t.distance)} m ・ ${f1(t.airtime)} 秒`));
      legend.appendChild(row);
    }
    hasResult = true;
    syncParts();
  }
  function hideResult() { hasResult = false; syncParts(); }

  // ================= 見回し方のヒント =================
  const hint = h('div', 'ov-hint', 'ドラッグで見回す ・ ホイールで拡大');
  addPart('hint', hint, ['design']);

  // ================= 遊び方 =================
  const help = h('div', 'ov-help');
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-label', '遊び方');
  const card = h('div', 'ov-help-card');
  const hHead = h('div', 'ov-help-head');
  hHead.appendChild(svgEl(LOGO, 'ov-help-logo'));
  hHead.appendChild(h('h2', 'ov-help-title', '遊び方'));
  const hBody = h('div', 'ov-help-body');
  const ol = h('ol', 'ov-steps');
  STEPS.forEach((s, i) => {
    const li = h('li', 'ov-step');
    li.appendChild(svgEl(STEP_ICONS[i], 'ov-step-ico'));
    li.appendChild(h('span', 'ov-step-no', String(i + 1)));
    li.appendChild(h('span', 'ov-step-t', s[0]));
    ol.appendChild(li);
  });
  const side = h('div', 'ov-help-side');
  const tryBox = h('div', 'ov-try');
  tryBox.appendChild(h('h3', 'ov-sub', 'ためしてみよう'));
  const ul = h('ul', 'ov-try-list');
  for (const t of TRIES) ul.appendChild(h('li', '', t));
  tryBox.appendChild(ul);
  const keyBox = h('div', 'ov-keys-box');
  keyBox.appendChild(h('h3', 'ov-sub', 'キー'));
  const kl = h('div', 'ov-keys');
  for (const [k, d] of KEYS) {
    const row = h('div', 'ov-key-row');
    row.append(h('span', 'ov-keycap', k), h('span', 'ov-key-d', d));
    kl.appendChild(row);
  }
  keyBox.appendChild(kl);
  side.append(tryBox, keyBox);
  hBody.append(ol, side);
  const hFoot = h('div', 'ov-help-foot');
  const bClose = h('button', 'ov-help-close', '閉じる');
  bClose.type = 'button';
  hFoot.appendChild(bClose);
  card.append(hHead, hBody, hFoot);
  help.appendChild(card);
  help.classList.add('ov-part-modal');
  root.appendChild(help);

  function closeByUser() {
    if (!helpOpen) return;
    closeHelp();
    call('onHelpClosed');
  }
  bClose.addEventListener('click', closeByUser);
  help.addEventListener('mousedown', (e) => { if (e.target === help) closeByUser(); });
  function onHelpKey(e) {
    if (!helpOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeByUser(); }
  }
  window.addEventListener('keydown', onHelpKey, true);

  function openHelp(firstTime) {
    bClose.textContent = firstTime ? 'はじめる' : '閉じる';
    bClose.classList.toggle('is-first', !!firstTime);
    helpOpen = true;
    help.classList.add('is-on');
    bHelp.classList.add('is-open');
    bClose.focus({ preventScroll: true });
  }
  function closeHelp() {
    helpOpen = false;
    help.classList.remove('is-on');
    bHelp.classList.remove('is-open');
    if (document.activeElement === bClose) bClose.blur();
  }

  // ================= タイトル =================
  const title = h('div', 'ov-title');
  const tInner = h('div', 'ov-title-inner');
  const logoWrap = h('div', 'ov-title-logo');
  logoWrap.innerHTML = `<div class="ov-title-shadow"></div><div class="ov-title-fly">${LOGO}</div>`;
  tInner.append(logoWrap, h('h1', 'ov-title-h', '紙飛行機デザインラボ'), h('p', 'ov-title-s', '形を変えて、飛び方を確かめよう'));
  title.appendChild(tInner);
  root.appendChild(title);

  let titleSkip = null;
  function showTitle() {
    return new Promise((resolve) => {
      let done = false;
      let t1 = 0, t2 = 0;
      title.classList.remove('is-out');
      title.classList.remove('is-gone');
      // アニメーションをやり直す
      tInner.style.animation = 'none';
      void tInner.offsetWidth;
      tInner.style.animation = '';
      title.classList.add('is-on');
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t1); clearTimeout(t2);
        window.removeEventListener('keydown', skip, true);
        title.removeEventListener('pointerdown', skip);
        title.classList.add('is-gone');
        title.classList.remove('is-on', 'is-out');
        titleSkip = null;
        resolve();
      };
      const fadeOut = () => {
        if (done) return;
        clearTimeout(t1);
        title.classList.add('is-out');
        t2 = setTimeout(finish, 520);
      };
      function skip(e) {
        if (e && e.type === 'keydown') { e.stopPropagation(); }
        if (title.classList.contains('is-out')) return;
        fadeOut();
      }
      titleSkip = skip;
      window.addEventListener('keydown', skip, true);
      title.addEventListener('pointerdown', skip);
      t1 = setTimeout(fadeOut, 1100);
    });
  }
  void titleSkip;

  // ================= モード切り替え =================
  function syncParts() {
    for (const name in parts) {
      const p = parts[name];
      let on = p.modes.includes(mode);
      if (name === 'fps') on = on || false;
      p.el.classList.toggle('is-on', on);
    }
    const showFps = toggles.fps && ['design', 'flight', 'result'].includes(mode);
    parts.fps.el.classList.toggle('is-on', showFps);
    parts.result.el.classList.toggle('is-on', mode === 'result' && hasResult);
  }
  function setMode(m) {
    if (!MODES.includes(m)) return;
    mode = m;
    root.dataset.mode = m;
    syncParts();
  }

  // ================= 公開 =================
  function setToggles(o = {}) {
    toggles = { ...toggles, ...o };
    syncToggles();
  }
  let lastFps = null;
  function setFps(n) {
    if (!Number.isFinite(n)) return;
    const v = Math.round(n);
    if (v === lastFps) return;
    lastFps = v;
    fpsNum.textContent = String(v);
    fpsBox.dataset.level = v >= 50 ? 'good' : v >= 30 ? 'mid' : 'bad';
  }
  function setFlightState(o = {}) {
    flight = { ...flight, ...o };
    syncFlight();
  }
  const MINUS = '−';
  function updateHud(o = {}) {
    if (o.speed !== undefined) setText(nSpeed, 'speed', f1(o.speed));
    if (o.height !== undefined) setText(nHeight, 'height', f1(Math.max(0, o.height) < 0.05 ? 0 : o.height));
    if (o.distance !== undefined) setText(nDist, 'dist', f1(o.distance));
    if (o.time !== undefined) setText(nTime, 'time', f1(o.time));
    if (o.pitch !== undefined) {
      const p = Math.round(o.pitch);
      setText(nPitch, 'pitch', p > 0 ? `+${p}°` : p < 0 ? `${MINUS}${-p}°` : '0°');
    }
    if (o.bank !== undefined) {
      const b = Math.round(o.bank);
      setText(nBank, 'bank', b === 0 ? '水平' : b > 0 ? `右 ${b}°` : `左 ${-b}°`);
    }
    if (o.stall !== undefined) {
      const on = o.stall >= 0.5;
      if (cache.get('stall') !== on) {
        cache.set('stall', on);
        lamp.classList.toggle('is-on', on);
      }
    }
  }

  syncToggles();
  syncFlight();
  syncParts();

  return {
    showTitle, openHelp, closeHelp, isHelpOpen: () => helpOpen,
    setMode, setToggles, setFps, setFlightState, updateHud, showResult, hideResult,
  };
}
