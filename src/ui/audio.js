// 音（すべて Web Audio で合成。音声ファイルは使わない）。
// 音作りの関数（build*/play*）は ctx と出力先を受け取るだけなので、
// 本番の AudioContext でも、確認用の OfflineAudioContext でも同じに組める。

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- 部品 ----------

/** 2秒ぶんのなだらかなノイズ（白色ノイズを軽くなまらせたもの）。乱数は固定の種 */
const noiseCache = new WeakMap();
export function getNoiseBuffer(ctx) {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const sr = ctx.sampleRate;
  buf = ctx.createBuffer(1, Math.floor(sr * 2), sr);
  const d = buf.getChannelData(0);
  let seed = 123456789;
  let lp = 0;
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const w = seed / 2147483648 - 1;
    lp += 0.55 * (w - lp); // 軽いローパス
    d[i] = lp;
    peak = Math.max(peak, Math.abs(lp));
  }
  // つなぎ目のぷつっを避けるため、終わりを始めへなめらかに寄せる
  const n = Math.floor(sr * 0.02);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[d.length - n + i] = d[d.length - n + i] * (1 - k) + d[i] * k;
  }
  for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
  noiseCache.set(ctx, buf);
  return buf;
}

const MASTER_LEVEL = 0.8;

/** マスター：音量 → リミッター → 出力 */
export function buildMaster(ctx, dest = ctx.destination) {
  const gain = ctx.createGain();
  gain.gain.value = MASTER_LEVEL;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 14;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  gain.connect(comp);
  comp.connect(dest);
  return {
    input: gain,
    gain,
    setMuted(muted, t = ctx.currentTime, tau = 0.02) {
      gain.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, t, tau);
    },
  };
}

/** 飛行状態から風切り音のパラメータを求める（純粋な関数） */
export function windParams({ speed = 0, stall = 0, rate = 1, paused = false } = {}) {
  const s = clamp(Number.isFinite(speed) ? speed : 0, 0, 15);
  const st = clamp(Number.isFinite(stall) ? stall : 0, 0, 1);
  const slow = rate < 0.5;
  let gain = Math.min(0.2, 0.2 * (s / 12) ** 2); // 速さの2乗に近い。上限あり
  let freq = clamp(300 + (s - 2) * 150, 150, 2400); // 2m/s で300Hz、12m/s で1800Hz
  if (slow) {
    gain *= 0.6;
    freq *= 0.75;
  }
  let flutter = st > 0.25 ? (st - 0.25) / 0.75 : 0; // 低い乱れ
  flutter *= clamp(s / 4, 0, 1) * 0.35;
  if (paused) {
    gain = 0;
    flutter = 0;
  }
  return { gain, freq, q: 0.9, flutter, flutterHz: slow ? 3 : 6.5 };
}

/** 風を切る音。ノイズ→バンドパス→音量。失速時は低域の「ばたばた」を足す */
export function buildWind(ctx, dest) {
  const buf = getNoiseBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 300;
  bp.Q.value = 0.9;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(bp);
  bp.connect(out);
  out.connect(dest);

  // ばたばた：低域ノイズの音量を LFO でゆっくり揺らす
  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.loop = true;
  src2.loopStart = 0.37;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const flutterGain = ctx.createGain();
  flutterGain.gain.value = 0;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.2;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 6.5;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0;
  lfo.connect(lfoDepth);
  lfoDepth.connect(flutterGain.gain);
  src2.connect(lp);
  lp.connect(flutterGain);
  flutterGain.connect(makeup);
  makeup.connect(dest);

  let started = false;
  return {
    start(t = ctx.currentTime) {
      if (started) return;
      started = true;
      src.start(t);
      src2.start(t);
      lfo.start(t);
    },
    set(p, t = ctx.currentTime, tau = 0.06) {
      out.gain.setTargetAtTime(p.gain, t, tau);
      bp.frequency.setTargetAtTime(p.freq, t, tau);
      bp.Q.setTargetAtTime(p.q, t, tau);
      // 振幅が 0〜flutter の間で揺れる
      flutterGain.gain.setTargetAtTime(p.flutter * 0.5, t, tau);
      lfoDepth.gain.setTargetAtTime(p.flutter * 0.5, t, tau);
      lfo.frequency.setTargetAtTime(p.flutterHz, t, tau);
    },
    silence(t = ctx.currentTime, tau = 0.12) {
      out.gain.setTargetAtTime(0, t, tau);
      flutterGain.gain.setTargetAtTime(0, t, tau);
      lfoDepth.gain.setTargetAtTime(0, t, tau);
    },
    stop() {
      try { src.stop(); src2.stop(); lfo.stop(); } catch { /* 無視 */ }
    },
  };
}

/** 投げる「しゅっ」 */
export function playThrow(ctx, dest, t = ctx.currentTime) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t, 0.1);
  src.stop(t + 0.26);
}

/** 着地の「ぱさっ」＋ごく弱い「とん」。speed は 2〜10 m/s */
export function playLand(ctx, dest, speed, t = ctx.currentTime) {
  const s = clamp(Number.isFinite(speed) ? speed : 2, 2, 10);
  const dur = 0.08 + (0.07 * (s - 2)) / 8; // 80〜150ms
  const vol = 0.18 + (0.5 * (s - 2)) / 8;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700 + s * 180;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t, 0.5);
  src.stop(t + dur + 0.02);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
  const og = ctx.createGain();
  const ov = 0.04 + 0.012 * (s - 2);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(ov, t + 0.005);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(og);
  og.connect(dest);
  o.start(t);
  o.stop(t + 0.16);
}

const UI_SOUNDS = {
  click: [{ f: 660, d: 0.04, type: 'triangle', v: 0.05 }],
  toggle: [{ f: 520, d: 0.05, type: 'sine', v: 0.06 }],
  preset: [{ f: 587, d: 0.06, type: 'triangle', v: 0.05 }],
  fly: [{ f: 392, f2: 784, d: 0.08, type: 'sine', v: 0.06 }],
  save: [{ f: 523, d: 0.05, type: 'sine', v: 0.06 }, { f: 659, d: 0.06, type: 'sine', v: 0.06, at: 0.06 }],
  error: [{ f: 196, d: 0.08, type: 'triangle', v: 0.08 }],
  result: [{ f: 659, d: 0.07, type: 'sine', v: 0.07 }, { f: 880, d: 0.08, type: 'sine', v: 0.07, at: 0.09 }],
};
export const UI_KINDS = Object.keys(UI_SOUNDS);

/** 操作音（30〜80ms のやわらかいブリップ） */
export function playUi(ctx, dest, kind, t = ctx.currentTime) {
  const notes = UI_SOUNDS[kind];
  if (!notes) return;
  for (const n of notes) {
    const t0 = t + (n.at || 0);
    const o = ctx.createOscillator();
    o.type = n.type;
    o.frequency.setValueAtTime(n.f, t0);
    if (n.f2) o.frequency.exponentialRampToValueAtTime(n.f2, t0 + n.d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(n.v, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + n.d);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + n.d + 0.02);
  }
}

// ---------- 本番 ----------

export function createAudio() {
  let ctx = null;
  let master = null;
  let wind = null;
  let muted = false;
  let flying = false;

  const safe = (fn) => {
    try { fn(); } catch { /* 音が出せなくても何もしない */ }
  };

  function ensureWind() {
    if (wind || !ctx) return;
    wind = buildWind(ctx, master.input);
    wind.start();
  }

  function unlock() {
    safe(() => {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = buildMaster(ctx);
        master.setMuted(muted, ctx.currentTime, 0.001);
      }
      if (ctx.state === 'suspended') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    });
  }

  return {
    unlock,
    setMuted(b) {
      muted = !!b;
      safe(() => { if (master) master.setMuted(muted); });
    },
    isMuted: () => muted,
    flightStart() {
      flying = true;
      safe(() => {
        if (!ctx) return;
        ensureWind();
        playThrow(ctx, master.input);
      });
    },
    flightUpdate(state) {
      if (!flying) return;
      safe(() => {
        if (!ctx) return;
        ensureWind();
        wind.set(windParams(state || {}));
      });
    },
    flightEnd() {
      flying = false;
      safe(() => { if (wind) wind.silence(); });
    },
    land(speed) {
      safe(() => { if (ctx) playLand(ctx, master.input, speed); });
    },
    ui(kind) {
      safe(() => { if (ctx) playUi(ctx, master.input, kind); });
    },
  };
}
