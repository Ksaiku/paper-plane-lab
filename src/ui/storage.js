// 設計の保存（localStorage）。state は素のオブジェクトで、保存は呼ぶ側が saveState で行う。
import { MAX_SAVES } from '../core/config.js';
import { sanitizeSetup } from '../core/aircraft.js';

export const STORAGE_KEY = 'paperPlaneLab.v1';
const NAME_MAX = 20;

function defaultSettings() {
  return { muted: false, showFps: false, showArrows: false, helpSeen: false };
}

export function initialState() {
  return { saves: [], settings: defaultSettings() };
}

function getStorage(storage) {
  try {
    return storage ?? null;
  } catch {
    return null;
  }
}

export function loadState(storage = globalThis.localStorage) {
  const state = initialState();
  let raw = null;
  try {
    const st = getStorage(storage);
    if (!st) return state;
    raw = st.getItem(STORAGE_KEY);
  } catch {
    return state;
  }
  if (typeof raw !== 'string' || raw === '') return state;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (!data || typeof data !== 'object') return state;

  if (Array.isArray(data.saves)) {
    for (const e of data.saves) {
      if (state.saves.length >= MAX_SAVES) break;
      if (!e || typeof e !== 'object') continue;
      const name = typeof e.name === 'string' ? e.name.trim().slice(0, NAME_MAX) : '';
      if (!name) continue;
      if (state.saves.some((s) => s.name === name)) continue;
      const savedAt = Number.isFinite(Number(e.savedAt)) ? Number(e.savedAt) : 0;
      state.saves.push({ name, setup: sanitizeSetup(e.setup), savedAt });
    }
  }
  if (data.settings && typeof data.settings === 'object') {
    for (const k of Object.keys(state.settings)) {
      if (typeof data.settings[k] === 'boolean') state.settings[k] = data.settings[k];
    }
  }
  return state;
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    const st = getStorage(storage);
    if (!st) return false;
    st.setItem(STORAGE_KEY, JSON.stringify({ saves: state.saves, settings: state.settings }));
    return true;
  } catch {
    return false;
  }
}

export function addSave(state, name, setup) {
  let n = typeof name === 'string' ? name.trim().slice(0, NAME_MAX).trim() : '';
  if (!n) {
    let i = 1;
    while (state.saves.some((s) => s.name === `設計 ${i}`)) i++;
    n = `設計 ${i}`;
  }
  const entry = { name: n, setup: sanitizeSetup(setup), savedAt: Date.now() };
  const idx = state.saves.findIndex((s) => s.name === n);
  if (idx >= 0) {
    state.saves[idx] = entry;
    return { ok: true };
  }
  if (state.saves.length >= MAX_SAVES) {
    return { ok: false, error: `保存できるのは${MAX_SAVES}個までです。どれかを削除してください。` };
  }
  state.saves.unshift(entry);
  return { ok: true };
}

export function deleteSave(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.saves.length) return false;
  state.saves.splice(index, 1);
  return true;
}
