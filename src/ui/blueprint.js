// ============================================================
// 上から見た2Dの設計図。方眼紙に青い線で描いた雰囲気。
// 機首が上。縮尺は一定（設計を変えても変わらない。変わるのは形だけ）。
// 座標：geometry は機首原点で x=前, z=右。画面では x_screen=z, y_screen=-x。
// ============================================================

const COL = {
  bgTop: '#f3f8fc',
  bgBottom: '#e9f2f9',
  grid: 'rgba(52, 116, 184, 0.14)',
  gridMajor: 'rgba(52, 116, 184, 0.30)',
  line: '#2a5ea8',
  lineSoft: 'rgba(42, 94, 168, 0.55)',
  wingFill: 'rgba(70, 140, 225, 0.16)',
  tailFill: 'rgba(70, 140, 225, 0.24)',
  text: '#1f4f8f',
  textSoft: '#4f78ad',
  pad: 'rgba(246, 251, 254, 0.88)',
  neutral: '#1b8f73',
  cgOk: '#1f4f8f',
  cgBad: '#d6403a',
  clip: '#5e6b7d',
};

const BODY_LEN_CM = 28; // 胴体の長さ（縮尺を決めるための基準。BUILD.fuselageLength と同じ）
const MAX_SPAN_CM = 40; // 翼幅の最大
const TOP = 30; // 機首より上の余白 [px]
const BOTTOM = 32; // 後端より下の余白 [px]

function cssFont(canvas) {
  try {
    const f = getComputedStyle(canvas).fontFamily;
    if (f) return f;
  } catch (e) { /* 何もしない */ }
  return 'sans-serif';
}

/** 画面の大きさ（CSS ピクセル）を返す。まだ置かれていなければ属性の値を使う */
function cssSize(canvas) {
  const w = canvas.clientWidth || Number(canvas.getAttribute('width')) || 340;
  const h = canvas.clientHeight || Number(canvas.getAttribute('height')) || 230;
  return { w, h };
}

/** 縮尺 [px/cm]。キャンバスの大きさだけで決まる（設計には依存しない） */
export function blueprintScale(w, h) {
  const byH = (h - TOP - BOTTOM) / BODY_LEN_CM;
  const byW = (w / 2 - 22) / (MAX_SPAN_CM / 2 + 1.8);
  return Math.max(2, Math.min(byH, byW));
}

export function drawBlueprint(canvas, aircraft, info) {
  if (!canvas || !aircraft) return;
  const { w: W, h: H } = cssSize(canvas);
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const font = cssFont(canvas);
  const S = blueprintScale(W, H); // px/cm
  const cx = W / 2;
  const y0 = TOP;
  const g = aircraft.geometry;
  const X = (z) => cx + z * 100 * S; // 右が＋
  const Y = (x) => y0 + -x * 100 * S; // 後ろが下
  // 1デバイスピクセルの線をにじませないための位置合わせ
  const crisp = (v) => (Math.round(v * dpr - 0.5) + 0.5) / dpr;

  // ---- 紙の地 ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COL.bgTop);
  bg.addColorStop(1, COL.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ---- 方眼（1cm ごと、5cm ごとに濃く。中心線と機首を通る線が基準）----
  ctx.lineWidth = 1 / dpr;
  const kx = Math.ceil(cx / S);
  for (let k = -kx; k <= kx; k++) {
    const x = cx + k * S;
    if (x < 0 || x > W) continue;
    ctx.strokeStyle = k % 5 === 0 ? COL.gridMajor : COL.grid;
    ctx.beginPath(); ctx.moveTo(crisp(x), 0); ctx.lineTo(crisp(x), H); ctx.stroke();
  }
  const ky0 = -Math.ceil(y0 / S), ky1 = Math.ceil((H - y0) / S);
  for (let k = ky0; k <= ky1; k++) {
    const y = y0 + k * S;
    if (y < 0 || y > H) continue;
    ctx.strokeStyle = k % 5 === 0 ? COL.gridMajor : COL.grid;
    ctx.beginPath(); ctx.moveTo(0, crisp(y)); ctx.lineTo(W, crisp(y)); ctx.stroke();
  }

  // ---- 右端の定規（機首からの距離 cm）----
  ctx.strokeStyle = COL.lineSoft;
  ctx.fillStyle = COL.textSoft;
  ctx.font = `600 10px ${font}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let k = 0; k <= BODY_LEN_CM; k++) {
    const y = crisp(y0 + k * S);
    const major = k % 5 === 0;
    ctx.beginPath(); ctx.moveTo(W - 1, y); ctx.lineTo(W - (major ? 9 : 5), y); ctx.stroke();
    if (major && k > 0) ctx.fillText(String(k), W - 12, y);
  }
  ctx.textAlign = 'right';
  ctx.fillText('cm', W - 4, y0 - 9);

  // ---- 小さな文字の道具 ----
  const label = (text, x, y, opt = {}) => {
    const { align = 'left', color = COL.text, size = 11, weight = 700, pad = true, rot = 0 } = opt;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    if (pad) {
      const x0 = align === 'left' ? -3 : align === 'right' ? -tw - 3 : -tw / 2 - 3;
      ctx.fillStyle = COL.pad;
      ctx.beginPath();
      ctx.roundRect(x0, -size / 2 - 2, tw + 6, size + 4, 4);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
    return tw;
  };
  const poly = (pts, fill, stroke, lw = 1.6) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[2]), Y(p[0])) : ctx.moveTo(X(p[2]), Y(p[0]))));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  };

  // ---- 主翼・水平尾翼 ----
  poly(g.tail.left, COL.tailFill, COL.line, 1.5);
  poly(g.tail.right, COL.tailFill, COL.line, 1.5);
  poly(g.wing.left, COL.wingFill, COL.line, 1.7);
  poly(g.wing.right, COL.wingFill, COL.line, 1.7);

  // ---- 胴体の中心線（折り目。破線）----
  ctx.strokeStyle = COL.line;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([5, 3.5]);
  ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, Y(-g.length)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.line;
  ctx.beginPath(); ctx.arc(cx, y0, 2.4, 0, Math.PI * 2); ctx.fill();

  // ---- 垂直尾翼（上から見ると線。付け根の長さの薄い帯と、てっぺんの太い線）----
  {
    const fin = g.fin;
    const rootA = Y(fin[0][0]), rootB = Y(fin[3][0]);
    const topA = Y(fin[1][0]), topB = Y(fin[2][0]);
    const bandW = Math.max(3, fin[1][1] * 100 * S * 0.22);
    ctx.fillStyle = 'rgba(42, 94, 168, 0.20)';
    ctx.fillRect(cx - bandW / 2, rootA, bandW, rootB - rootA);
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, topA); ctx.lineTo(cx, topB); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ---- 重り（クリップ）----
  if (g.weight && g.weight.mass > 0) {
    const wy = Y(g.weight.pos[0]);
    const cw = 9, ch = 21;
    ctx.save();
    ctx.translate(cx, wy);
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = COL.clip;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cw / 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-cw / 2 + 2.6, -ch / 2 + 3.4, cw - 5.2, ch - 4, (cw - 5.2) / 2); ctx.stroke();
    ctx.restore();
    const spanY = Y(g.wing.right[0][0]) - 15; // 翼幅の寸法線と文字がぶつかるときは、重りの文字を下へずらす
    const ly = Math.abs(wy - spanY) < 14 ? spanY + 14 : wy;
    label(`重り ${(g.weight.mass * 1000).toFixed(1)} g`, cx - 12, ly, { align: 'right', color: '#4d5a6c', size: 11 });
  }

  // ---- 寸法線 ----
  const dimColor = COL.line;
  ctx.strokeStyle = dimColor;
  ctx.fillStyle = dimColor;
  ctx.lineWidth = 1;
  const arrow = (x, y, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * 6 + dy * 3, y - dy * 6 - dx * 3);
    ctx.lineTo(x - dx * 6 - dy * 3, y - dy * 6 + dx * 3);
    ctx.closePath(); ctx.fill();
  };
  // 翼幅（主翼の付け根の前縁より少し上に）
  {
    const tipR = g.wing.right[1], tipL = g.wing.left[1];
    const yRootLE = Y(g.wing.right[0][0]);
    const dy = yRootLE - 15;
    const xr = X(tipR[2]), xl = X(tipL[2]);
    ctx.setLineDash([2, 2]);
    ctx.globalAlpha = 0.65;
    for (const [xx, tip] of [[xl, tipL], [xr, tipR]]) {
      ctx.beginPath(); ctx.moveTo(xx, Y(tip[0]) - 2); ctx.lineTo(xx, dy - 5); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(xl, dy); ctx.lineTo(xr, dy); ctx.stroke();
    arrow(xl, dy, -1, 0); arrow(xr, dy, 1, 0);
    label(`翼幅 ${aircraft.setup.wingSpan.toFixed(1)} cm`, cx, dy, { align: 'center', color: COL.text });
  }
  // 翼弦（付け根の前縁と後縁から、左の外側へ寸法線を出す）
  {
    const half = g.wing.left[1][2];
    const yA = Y(g.wing.left[0][0]), yB = Y(g.wing.left[3][0]);
    const dx = X(half) - 1.9 * S;
    ctx.setLineDash([2, 2]);
    ctx.globalAlpha = 0.55;
    for (const yy of [yA, yB]) {
      ctx.beginPath(); ctx.moveTo(cx - 2, yy); ctx.lineTo(dx - 5, yy); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(dx, yA); ctx.lineTo(dx, yB); ctx.stroke();
    arrow(dx, yA, 0, -1); arrow(dx, yB, 0, 1);
    label(`翼弦 ${aircraft.setup.wingChord.toFixed(1)} cm`, dx - 1, (yA + yB) / 2, { align: 'center', rot: -Math.PI / 2, color: COL.text });
  }

  // ---- 重心と中立点 ----
  if (info) {
    const cgY = y0 + info.cgFromNose * 100 * S;
    const npY = y0 + info.neutralFromNose * 100 * S;
    const bad = info.cgFromNose > info.neutralFromNose + 1e-6;
    const cgCol = bad ? COL.cgBad : COL.cgOk;

    // 中立点 ▽（頂点が中立点の位置）
    ctx.fillStyle = COL.neutral;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6.5, npY - 11); ctx.lineTo(cx + 6.5, npY - 11); ctx.lineTo(cx, npY); ctx.closePath();
    ctx.stroke(); ctx.fill();

    // 重心 ⊕
    const r = 6.5;
    ctx.save();
    ctx.translate(cx, cgY);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cgCol;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = cgCol;
    ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r - 3.5, 0); ctx.lineTo(r + 3.5, 0); ctx.moveTo(0, -r - 3.5); ctx.lineTo(0, r + 3.5);
    ctx.stroke();
    ctx.restore();

    // 右側に文字。重なりそうなら上下にずらす
    const items = [
      { y: cgY, my: cgY, text: bad ? '重心（後ろすぎ）' : '重心', color: cgCol },
      { y: npY - 5, my: npY - 5, text: '中立点', color: COL.neutral },
    ].sort((a, b) => a.y - b.y);
    const gap = 14;
    if (items[1].y - items[0].y < gap) {
      const mid = (items[0].y + items[1].y) / 2;
      items[0].y = mid - gap / 2;
      items[1].y = mid + gap / 2;
    }
    for (const it of items) {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 10, it.my); ctx.lineTo(cx + 16, it.y); ctx.stroke();
      label(it.text, cx + 17, it.y, { color: it.color });
    }
  }

  // ---- 機首の表示 ----
  label('▲ 機首（前）', cx, y0 - 14, { align: 'center', color: COL.textSoft, size: 11, pad: false });

  // ---- 縮尺の棒（5cm）と方眼の説明 ----
  {
    const bx = 14, by = H - 15, bl = 5 * S;
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + bl, by);
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
    ctx.moveTo(bx + bl, by - 4); ctx.lineTo(bx + bl, by + 4);
    ctx.stroke();
    label('5 cm', bx + bl + 8, by, { color: COL.text, pad: false });
    label('方眼 = 1 cm', W - 14, by, { align: 'right', color: COL.textSoft, size: 10.5, weight: 600, pad: false });
  }
}
