// 3D空間に置く文字ラベル（日本語可）。キャンバスに描いてテクスチャにする。
import * as THREE from 'three';

const FONT = '"Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';

/**
 * 文字のテクスチャを作る。
 * opts: { fontSize=64(px), color='#fff', bg=null（背景色。角丸の札になる）, padding=0.35（文字高に対する割合）,
 *         weight=700, stroke=null（縁取りの色）, strokeWidth=0.12 }
 * @returns { texture, aspect（幅÷高さ）, canvas }
 */
export function makeTextTexture(text, opts = {}) {
  const fontSize = opts.fontSize || 64;
  const weight = opts.weight || 700;
  const pad = Math.round(fontSize * (opts.padding ?? 0.35));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${weight} ${fontSize}px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(fontSize * 1.25) + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.bg) {
    const r = Math.min(h / 2, fontSize * 0.45);
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  }
  if (opts.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontSize * (opts.strokeWidth ?? 0.12) * 2;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(text, w / 2, h / 2 + fontSize * 0.04);
  }
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + fontSize * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, aspect: w / h, canvas };
}

/**
 * いつもカメラの方を向く文字ラベル（スプライト）。
 * opts: makeTextTexture の opts ＋ { height=0.3（世界での高さ[m]）, depthTest=true, sizeAttenuation=true }
 * 返り値の sprite.userData.setText(text) で文字を差し替えられる。
 */
export function makeLabelSprite(text, opts = {}) {
  const height = opts.height ?? 0.3;
  const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: opts.depthTest ?? true, depthWrite: false, sizeAttenuation: opts.sizeAttenuation ?? true, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  let current = null;
  sprite.userData.setText = (t) => {
    if (t === current) return;
    current = t;
    if (mat.map) mat.map.dispose();
    const { texture, aspect } = makeTextTexture(t, opts);
    mat.map = texture;
    mat.needsUpdate = true;
    sprite.scale.set(height * aspect, height, 1);
  };
  sprite.userData.setText(text);
  return sprite;
}
