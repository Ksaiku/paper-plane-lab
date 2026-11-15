// ============================================================
// 左の設計パネル。お手本・設計図・設計項目・保存・「飛ばす」ボタン。
// パネルは自分で設定を書き換えない。
//   ユーザーが動かす → onChange(key, value) → 呼ぶ側が範囲に収めて setSetup() で返す
// ============================================================
import { PARAMS, GROUPS, MAX_SAVES } from '../core/config.js';
import { getLimits, buildAircraft } from '../core/aircraft.js';
import { PRESETS, presetSetup } from '../core/presets.js';
import { drawBlueprint } from './blueprint.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/** 要素を作る小さな道具。tag が 'svg:xxx' なら SVG の要素 */
function h(tag, props, ...kids) {
  const el = tag.startsWith('svg:') ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid);
  }
  return el;
}

const decimalsOf = (step) => {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
const fmtNum = (v, dec) => (dec > 0 ? v.toFixed(dec) : String(Math.round(v))).replace('-', '−');

const WIND_WORDS = ['正面から', '右前から', '右から', '右後ろから', '後ろから', '左後ろから', '左から', '左前から'];
const windWord = (deg) => WIND_WORDS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const LOCK_NOTE = 'ほかの寸法とぶつかるため、ここまで';

// ---------------- アイコン（自作のインライン SVG） ----------------
function planeIcon(cls) {
  return h('svg:svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' },
    h('svg:path', { d: 'M2.6 11.2 21.4 2.8 15 21.2 11.6 13.6Z', fill: 'currentColor' }),
    h('svg:path', { d: 'M11.6 13.6 21.4 2.8', fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': '1.3', 'stroke-linecap': 'round' }),
    h('svg:path', { d: 'M11.6 13.6 12.4 18.6 15 21.2', fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': '1.1', 'stroke-linejoin': 'round' }));
}

function logo() {
  return h('svg:svg', { viewBox: '0 0 40 40', class: 'pn-logo', 'aria-hidden': 'true' },
    h('svg:defs', null,
      h('svg:linearGradient', { id: 'pn-logo-g', x1: '0', y1: '0', x2: '0', y2: '1' },
        h('svg:stop', { offset: '0', 'stop-color': '#52a9ee' }),
        h('svg:stop', { offset: '1', 'stop-color': '#1f6fb8' }))),
    h('svg:rect', { x: '1', y: '1', width: '38', height: '38', rx: '11', fill: 'url(#pn-logo-g)' }),
    h('svg:path', { d: 'M8.5 21 32 9.5 24.2 32.5 20 23.2Z', fill: '#fffdf6' }),
    h('svg:path', { d: 'M20 23.2 32 9.5', fill: 'none', stroke: '#7fa6c9', 'stroke-width': '1.6', 'stroke-linecap': 'round' }),
    h('svg:path', { d: 'M20 23.2 21.2 29.4 24.2 32.5', fill: 'none', stroke: '#b9cfe0', 'stroke-width': '1.3', 'stroke-linejoin': 'round' }));
}

/** お手本カードの小さなシルエット（どれも同じ縮尺なので大きさの違いが見える） */
function silhouette(id) {
  const g = buildAircraft(presetSetup(id)).geometry;
  const P = (p) => `${(p[2] * 100).toFixed(2)},${(-p[0] * 100).toFixed(2)}`;
  const poly = (pts, cls) => h('svg:polygon', { points: pts.map(P).join(' '), class: cls });
  const fin = g.fin;
  return h('svg:svg', { viewBox: '-20.5 -2.5 41 31.5', class: 'pn-sil', 'aria-hidden': 'true' },
    poly(g.tail.left, 'pn-sil-tail'), poly(g.tail.right, 'pn-sil-tail'),
    poly(g.wing.left, 'pn-sil-wing'), poly(g.wing.right, 'pn-sil-wing'),
    h('svg:line', { x1: 0, y1: 0, x2: 0, y2: g.length * 100, class: 'pn-sil-body' }),
    h('svg:line', { x1: 0, y1: (-fin[1][0] * 100).toFixed(2), x2: 0, y2: (-fin[2][0] * 100).toFixed(2), class: 'pn-sil-fin' }));
}

/** 風の方位盤。上＝投げる正面。矢印は風が流れていく向き */
function compass() {
  const svg = h('svg:svg', { viewBox: '0 0 64 64', class: 'pn-compass', 'aria-hidden': 'true' });
  svg.append(
    h('svg:circle', { cx: 32, cy: 32, r: 29, class: 'pn-cp-ring' }),
    h('svg:circle', { cx: 32, cy: 32, r: 19, class: 'pn-cp-ring2' }));
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const major = i % 3 === 0;
    const r1 = 29, r2 = major ? 24.5 : 26.5;
    svg.append(h('svg:line', {
      x1: (32 + Math.sin(a) * r1).toFixed(2), y1: (32 - Math.cos(a) * r1).toFixed(2),
      x2: (32 + Math.sin(a) * r2).toFixed(2), y2: (32 - Math.cos(a) * r2).toFixed(2),
      class: major ? 'pn-cp-tick pn-cp-tick-major' : 'pn-cp-tick',
    }));
  }
  const arrow = h('svg:g', { class: 'pn-cp-arrow' },
    h('svg:line', { x1: 32, y1: 7, x2: 32, y2: 41, class: 'pn-cp-shaft' }),
    h('svg:path', { d: 'M25.5 36 32 47 38.5 36Z', class: 'pn-cp-head' }));
  svg.append(arrow);
  svg.append(h('svg:path', { d: 'M32 24.5 36.6 37 32 34.6 27.4 37Z', class: 'pn-cp-plane' }));
  return { el: svg, arrow };
}

function sliderDecor() {
  return h('div', { class: 'pn-decor', 'aria-hidden': 'true' },
    h('div', { class: 'pn-trk' },
      h('div', { class: 'pn-fill' }),
      h('div', { class: 'pn-lock' })));
}

// ================================================================
export function createPanel(root, opts = {}) {
  const maxSaves = opts.maxSaves || MAX_SAVES;
  const cb = {
    onChange: opts.onChange || (() => {}),
    onPreset: opts.onPreset || (() => {}),
    onFly: opts.onFly || (() => {}),
    onSave: opts.onSave || (() => ({ ok: true })),
    onLoad: opts.onLoad || (() => {}),
    onDelete: opts.onDelete || (() => {}),
  };

  let setup = { ...(opts.setup || {}) };
  let aircraft = null;
  let info = null;
  let saves = [];
  let activePreset = null;
  let hoverPreset = null;
  let confirmIndex = -1;
  let confirmTimer = 0;

  // ---------- 骨組み ----------
  const el = h('aside', { class: 'pn-panel', 'aria-label': '設計パネル' });
  const scroll = h('div', { class: 'pn-scroll' });
  const foot = h('div', { class: 'pn-foot' });
  el.append(scroll, foot);

  // 見出し
  scroll.append(h('header', { class: 'pn-head' },
    logo(),
    h('div', { class: 'pn-head-text' },
      h('h1', { class: 'pn-title', text: '紙飛行機デザインラボ' }),
      h('p', { class: 'pn-sub', text: '形を変えて、飛び方を確かめよう' }))));

  // お手本
  const blurb = h('p', { class: 'pn-blurb' });
  const presetBtns = new Map();
  const presetGrid = h('div', { class: 'pn-presets', role: 'group', 'aria-label': 'お手本の機体' });
  for (const p of PRESETS) {
    const btn = h('button', {
      type: 'button', class: 'pn-preset' + (p.id === 'fail' ? ' pn-preset-warn' : ''),
      'data-id': p.id, 'aria-pressed': 'false', title: p.blurb,
      onClick: () => cb.onPreset(p.id),
      onMouseenter: () => { hoverPreset = p.id; updateBlurb(); },
      onMouseleave: () => { hoverPreset = null; updateBlurb(); },
      onFocus: () => { hoverPreset = p.id; updateBlurb(); },
      onBlur: () => { hoverPreset = null; updateBlurb(); },
    }, silhouette(p.id), h('span', { class: 'pn-preset-name', text: p.name }));
    presetBtns.set(p.id, btn);
    presetGrid.append(btn);
  }
  scroll.append(h('section', { class: 'pn-sec' },
    h('h2', { class: 'pn-h2', text: 'お手本から始める' }),
    presetGrid, blurb));

  function updateBlurb() {
    const id = hoverPreset || activePreset;
    const p = id && PRESETS.find((x) => x.id === id);
    if (p) {
      blurb.textContent = '';
      blurb.append(h('b', { text: p.name }), '　' + p.blurb);
      blurb.classList.toggle('pn-blurb-warn', p.id === 'fail');
      blurb.classList.remove('pn-blurb-idle');
    } else {
      blurb.textContent = '選ぶと、設計がまとめて入れ替わります';
      blurb.classList.remove('pn-blurb-warn');
      blurb.classList.add('pn-blurb-idle');
    }
  }

  // 設計図と数値
  const bpCanvas = h('canvas', { class: 'pn-bp-canvas', width: 340, height: 230, 'aria-label': '上から見た設計図' });
  const stWeight = h('b', { class: 'pn-st-v num' });
  const stCg = h('b', { class: 'pn-st-v num' });
  const stBadge = h('span', { class: 'pn-badge' });
  const stSpeed = h('b', { class: 'pn-st-v num' });
  const bp = h('section', { class: 'pn-bp' },
    h('div', { class: 'pn-bp-card' },
      bpCanvas,
      h('div', { class: 'pn-stats' },
        h('div', { class: 'pn-st' }, h('span', { class: 'pn-st-l', text: '重さ' }), h('div', { class: 'pn-st-row' }, stWeight)),
        h('div', { class: 'pn-st pn-st-wide' }, h('span', { class: 'pn-st-l', text: '重心（機首から）' }), h('div', { class: 'pn-st-row' }, stCg, stBadge)),
        h('div', { class: 'pn-st' }, h('span', { class: 'pn-st-l', text: '釣り合う速さ' }), h('div', { class: 'pn-st-row' }, stSpeed)))));
  const sentinel = h('div', { class: 'pn-sentinel', 'aria-hidden': 'true' });
  scroll.append(sentinel, bp);

  // 設計項目
  const items = new Map(); // key → 部品への参照
  function buildItem(p) {
    const dec = decimalsOf(p.step || 1);
    const ref = { p, dec };
    const tipId = `pn-tip-${p.key}`;
    const label = h('span', { class: 'pn-label' + (p.hint ? ' pn-has-tip' : '') },
      h('span', { class: 'pn-label-text', text: p.label }),
      p.hint ? h('span', { class: 'pn-q', 'aria-hidden': 'true', text: '?' }) : null,
      p.hint ? h('span', { class: 'pn-tip', id: tipId, role: 'tooltip', text: p.hint }) : null);

    if (p.type === 'bool') {
      const sw = h('button', {
        type: 'button', class: 'pn-switch', role: 'switch', 'aria-checked': 'false', 'aria-label': p.label,
        onClick: () => cb.onChange(p.key, !setup[p.key]),
      }, h('span', { class: 'pn-switch-knob' }));
      const state = h('span', { class: 'pn-switch-state', text: 'なし' });
      ref.sw = sw; ref.state = state;
      ref.el = h('div', { class: 'pn-item pn-item-bool', 'data-key': p.key },
        h('div', { class: 'pn-row' }, label, h('span', { class: 'pn-switch-wrap' }, state, sw)));
      return ref;
    }

    const input = h('input', {
      type: 'range', class: 'pn-range', min: p.min, max: p.max, step: p.step, value: p.def,
      'aria-label': p.label, 'aria-describedby': p.hint ? tipId : null,
    });
    input.addEventListener('input', () => cb.onChange(p.key, Number(input.value)));
    const decor = sliderDecor();
    const wrap = h('div', { class: 'pn-slider' }, decor, input);
    if (p.key === 'weightPos') {
      decor.querySelector('.pn-trk').append(h('div', { class: 'pn-mid' }));
      wrap.append(h('div', { class: 'pn-ends' }, h('span', { text: '前端' }), h('span', { text: '後端' })));
    }
    const note = h('div', { class: 'pn-lock-note', text: LOCK_NOTE });
    wrap.append(note);

    const num = h('b', { class: 'pn-num num' });
    const unit = h('span', { class: 'pn-unit' + (p.unit === '°' || p.unit === '%' ? ' pn-unit-tight' : ''), text: p.unit });
    const word = h('span', { class: 'pn-word' });
    const val = h('span', { class: 'pn-val' }, num, unit, word);
    Object.assign(ref, { input, wrap, num, unit, word, note });

    let ctl = wrap;
    if (p.key === 'windDir') {
      const cp = compass();
      ref.compass = cp;
      ctl = h('div', { class: 'pn-ctl-wind' }, cp.el, wrap);
    }
    ref.el = h('div', { class: 'pn-item' + (p.key === 'windDir' ? ' pn-item-wind' : ''), 'data-key': p.key },
      h('div', { class: 'pn-row' }, label, val), ctl);
    return ref;
  }

  const groupsWrap = h('div', { class: 'pn-groups' });
  for (const g of GROUPS) {
    const card = h('section', { class: 'pn-card', 'data-group': g.id },
      h('h2', { class: 'pn-h2 pn-h2-card', text: g.label }));
    for (const p of PARAMS.filter((x) => x.group === g.id)) {
      const ref = buildItem(p);
      items.set(p.key, ref);
      card.append(ref.el);
    }
    groupsWrap.append(card);
  }
  scroll.append(groupsWrap);

  // 保存
  const nameInput = h('input', { type: 'text', class: 'pn-input', maxlength: 20, autocomplete: 'off', spellcheck: 'false', 'aria-label': '設計の名前' });
  const saveBtn = h('button', { type: 'submit', class: 'pn-btn pn-btn-primary pn-save-btn', text: '保存' });
  const errEl = h('p', { class: 'pn-err', role: 'alert', hidden: true });
  const countEl = h('span', { class: 'pn-count num' });
  const listEl = h('ul', { class: 'pn-savelist' });
  const form = h('form', { class: 'pn-saveform', autocomplete: 'off' }, nameInput, saveBtn);
  // 名前を打つあいだ、Space などが「飛ばす」の近道に取られないようにする
  nameInput.addEventListener('keydown', (e) => e.stopPropagation());
  nameInput.addEventListener('input', () => { errEl.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim() || autoName();
    const res = cb.onSave(name) || { ok: true };
    if (res.ok) {
      nameInput.value = '';
      errEl.hidden = true;
    } else {
      errEl.textContent = res.error || '保存できませんでした';
      errEl.hidden = false;
    }
  });
  scroll.append(h('section', { class: 'pn-sec pn-sec-saves' },
    h('div', { class: 'pn-h2-row' }, h('h2', { class: 'pn-h2', text: '保存した設計' }), countEl),
    h('div', { class: 'pn-card pn-card-saves' }, form, errEl, listEl)));

  function autoName() {
    const used = new Set(saves.map((s) => s.name));
    let n = 1;
    while (used.has('設計 ' + n)) n++;
    return '設計 ' + n;
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  function resetConfirm() {
    confirmIndex = -1;
    clearTimeout(confirmTimer);
  }

  function renderSaves() {
    resetConfirm();
    countEl.textContent = `${saves.length} / ${maxSaves}`;
    countEl.classList.toggle('pn-count-full', saves.length >= maxSaves);
    nameInput.placeholder = autoName();
    listEl.textContent = '';
    if (!saves.length) {
      listEl.append(h('li', { class: 'pn-empty', text: 'まだ保存した設計はありません' }));
      return;
    }
    saves.forEach((s, i) => {
      const del = h('button', { type: 'button', class: 'pn-btn pn-btn-del', text: '削除', 'aria-label': `${s.name} を削除` });
      del.addEventListener('click', () => {
        if (confirmIndex === i) {
          resetConfirm();
          cb.onDelete(i);
          return;
        }
        // 前に押していたボタンを元に戻してから、このボタンを確認の状態にする
        listEl.querySelectorAll('.pn-btn-del.pn-confirm').forEach((b) => { b.classList.remove('pn-confirm'); b.textContent = '削除'; });
        clearTimeout(confirmTimer);
        confirmIndex = i;
        del.classList.add('pn-confirm');
        del.textContent = '本当に削除';
        confirmTimer = setTimeout(() => {
          if (confirmIndex === i) { confirmIndex = -1; del.classList.remove('pn-confirm'); del.textContent = '削除'; }
        }, 3000);
      });
      del.addEventListener('blur', () => {
        if (confirmIndex === i) { resetConfirm(); del.classList.remove('pn-confirm'); del.textContent = '削除'; }
      });
      listEl.append(h('li', { class: 'pn-save' },
        h('div', { class: 'pn-save-main' },
          h('span', { class: 'pn-save-name', text: s.name, title: s.name }),
          h('span', { class: 'pn-save-date num', text: fmtDate(s.savedAt) })),
        h('button', { type: 'button', class: 'pn-btn pn-btn-load', text: '読み込む', 'aria-label': `${s.name} を読み込む`, onClick: () => cb.onLoad(i) }),
        del));
    });
  }

  // 「飛ばす」ボタン（いちばん下に固定）
  const flyBtn = h('button', { type: 'button', class: 'pn-fly', onClick: () => cb.onFly() },
    planeIcon('pn-fly-icon'),
    h('span', { class: 'pn-fly-text', text: '飛ばす' }),
    h('kbd', { class: 'pn-kbd', text: 'Space' }));
  foot.append(flyBtn);

  // ---------- 表示の更新 ----------
  function updateItem(ref, lim) {
    const { p } = ref;
    const v = setup[p.key];
    if (p.type === 'bool') {
      const on = !!v;
      ref.sw.setAttribute('aria-checked', on ? 'true' : 'false');
      ref.sw.classList.toggle('pn-on', on);
      ref.state.textContent = on ? 'あり' : 'なし';
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    if (Number(ref.input.value) !== v) ref.input.value = v;
    const span = p.max - p.min;
    ref.wrap.style.setProperty('--p', ((v - p.min) / span).toFixed(5));
    const lm = lim && lim[p.key] ? lim[p.key].max : p.max;
    const locked = lm < p.max - 1e-9;
    ref.wrap.classList.toggle('pn-locked', locked);
    ref.wrap.style.setProperty('--pl', locked ? ((lm - p.min) / span).toFixed(5) : '1');
    ref.note.textContent = locked ? `${LOCK_NOTE}（上限 ${fmtNum(lm, ref.dec)} ${p.unit}）` : LOCK_NOTE;
    const text = fmtNum(v, ref.dec);
    ref.input.setAttribute('aria-valuetext', `${text}${p.unit}`);
    if (p.key === 'windDir') {
      const calm = !(setup.windSpeed > 0);
      ref.el.classList.toggle('pn-calm', calm);
      ref.compass.arrow.setAttribute('transform', `rotate(${v} 32 32)`);
      if (calm) {
        ref.num.textContent = '風なし';
        ref.unit.textContent = '';
        ref.word.textContent = '';
      } else {
        ref.num.textContent = text;
        ref.unit.textContent = p.unit;
        ref.word.textContent = windWord(v);
      }
      return;
    }
    ref.num.textContent = text;
    ref.unit.textContent = p.unit;
  }

  function updateStats() {
    if (!info) return;
    stWeight.textContent = `${(info.mass * 1000).toFixed(1)} g`;
    stCg.textContent = `${(info.cgFromNose * 100).toFixed(1)} cm`;
    const sm = info.staticMargin;
    let kind, text;
    if (!(sm >= 0)) { kind = 'bad'; text = '不安定'; }
    else if (sm < 0.05) { kind = 'warn'; text = 'ぎりぎり'; }
    else if (sm > 0.30) { kind = 'warn'; text = '前すぎ'; }
    else { kind = 'good'; text = '安定'; }
    stBadge.textContent = text;
    stBadge.className = `pn-badge pn-badge-${kind}`;
    stSpeed.textContent = info.trimSpeed === null || info.trimSpeed === undefined ? '—' : `約 ${info.trimSpeed.toFixed(1)} m/s`;
  }

  function redrawBlueprint() {
    if (aircraft) drawBlueprint(bpCanvas, aircraft, info);
  }

  function setSetup(s, ac, inf) {
    setup = { ...s };
    if (ac) aircraft = ac;
    if (inf) info = inf;
    const lim = getLimits(setup);
    for (const ref of items.values()) updateItem(ref, lim);
    updateStats();
    redrawBlueprint();
  }

  function setSaves(list) {
    saves = Array.isArray(list) ? list.slice() : [];
    renderSaves();
  }

  function setActivePreset(id) {
    activePreset = id || null;
    for (const [pid, btn] of presetBtns) {
      const on = pid === activePreset;
      btn.classList.toggle('pn-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    updateBlurb();
  }

  function setVisible(b) {
    el.classList.toggle('pn-hidden', !b);
    el.setAttribute('aria-hidden', b ? 'false' : 'true');
    if (b) el.removeAttribute('inert'); else el.setAttribute('inert', '');
    if (b) requestAnimationFrame(redrawBlueprint);
  }

  function setFlyEnabled(b) {
    flyBtn.disabled = !b;
  }

  // 設計図は上にスクロールが残るとき、下に影を出す
  const onScroll = () => bp.classList.toggle('pn-stuck', scroll.scrollTop > sentinel.offsetTop - scroll.offsetTop + 2);
  scroll.addEventListener('scroll', onScroll, { passive: true });

  // 大きさが変わったら描き直す
  if (typeof ResizeObserver !== 'undefined') {
    let last = '';
    new ResizeObserver(() => {
      const key = `${bpCanvas.clientWidth}x${bpCanvas.clientHeight}@${window.devicePixelRatio}`;
      if (key !== last) { last = key; redrawBlueprint(); }
    }).observe(bpCanvas);
  }
  window.addEventListener('resize', redrawBlueprint);

  // ---------- 初期表示 ----------
  root.append(el);
  updateBlurb();
  setSaves(opts.saves || []);
  if (setup && Object.keys(setup).length) {
    // 呼ぶ側が setSetup を呼ぶまでの仮の表示（設計図は機体が渡されたら描く）
    const lim = getLimits({ ...Object.fromEntries(PARAMS.map((p) => [p.key, p.def])), ...setup });
    for (const ref of items.values()) updateItem(ref, lim);
  }

  return { el, setSetup, setSaves, setActivePreset, setVisible, setFlyEnabled };
}
