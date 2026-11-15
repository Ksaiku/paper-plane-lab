// 保存（storage.js）のテスト。実行: node --test tests/storage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SAVES, PARAMS, defaultSetup } from '../src/core/config.js';
import { sanitizeSetup } from '../src/core/aircraft.js';
import { STORAGE_KEY, loadState, saveState, addSave, deleteSave } from '../src/ui/storage.js';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const throwing = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('quota'); },
};
const numKey = PARAMS.find((p) => p.type !== 'bool').key;

test('初期状態', () => {
  const s = loadState(fakeStorage());
  assert.deepEqual(s, { saves: [], settings: { muted: false, showFps: false, showArrows: false, helpSeen: false } });
});

test('保存して読み込むと一致する', () => {
  const st = fakeStorage();
  const s = loadState(st);
  const setup = sanitizeSetup({ ...defaultSetup(), [numKey]: defaultSetup()[numKey] });
  assert.equal(addSave(s, 'テスト機', setup).ok, true);
  s.settings.muted = true;
  assert.equal(saveState(s, st), true);
  const s2 = loadState(st);
  assert.deepEqual(s2, s);
  assert.deepEqual(s2.saves[0].setup, setup);
});

test('保存した設計は複製で、元が変わっても影響しない', () => {
  const s = loadState(fakeStorage());
  const setup = defaultSetup();
  addSave(s, 'a', setup);
  const before = JSON.stringify(s.saves[0].setup);
  setup[numKey] = setup[numKey] + 1;
  assert.equal(JSON.stringify(s.saves[0].setup), before);
});

test('10件の上限', () => {
  const s = loadState(fakeStorage());
  for (let i = 0; i < MAX_SAVES; i++) assert.equal(addSave(s, `n${i}`, defaultSetup()).ok, true);
  const r = addSave(s, '新しい', defaultSetup());
  assert.equal(r.ok, false);
  assert.equal(r.error, '保存できるのは10個までです。どれかを削除してください。');
  assert.equal(s.saves.length, MAX_SAVES);
  // 同名の上書きは上限でも通る
  assert.equal(addSave(s, 'n3', defaultSetup()).ok, true);
  assert.equal(s.saves.length, MAX_SAVES);
  // 削除すると保存できる
  assert.equal(deleteSave(s, 0), true);
  assert.equal(addSave(s, '新しい', defaultSetup()).ok, true);
  assert.equal(s.saves[0].name, '新しい');
});

test('同名は位置そのままで上書き、savedAt 更新', async () => {
  const s = loadState(fakeStorage());
  addSave(s, 'A', defaultSetup());
  addSave(s, 'B', defaultSetup());
  const oldAt = s.saves[1].savedAt;
  s.saves[1].savedAt = oldAt - 1000;
  const changed = { ...defaultSetup(), [numKey]: PARAMS.find((p) => p.key === numKey).max };
  addSave(s, 'A', changed);
  assert.deepEqual(s.saves.map((x) => x.name), ['B', 'A']);
  assert.ok(s.saves[1].savedAt >= oldAt - 1000);
  assert.equal(s.saves[1].setup[numKey], sanitizeSetup(changed)[numKey]);
});

test('名前の前後の空白除去・20文字・自動の名前', () => {
  const s = loadState(fakeStorage());
  addSave(s, '  abc  ', defaultSetup());
  assert.equal(s.saves[0].name, 'abc');
  addSave(s, 'あ'.repeat(30), defaultSetup());
  assert.equal(s.saves[0].name.length, 20);
  addSave(s, '', defaultSetup());
  addSave(s, '   ', defaultSetup());
  assert.deepEqual(s.saves.slice(0, 2).map((x) => x.name), ['設計 2', '設計 1']);
  deleteSave(s, 1); // 設計 1 を削除
  addSave(s, '', defaultSetup());
  assert.equal(s.saves[0].name, '設計 1');
});

test('壊れたJSON・形のおかしいデータから復帰する', () => {
  const init = loadState(fakeStorage());
  for (const raw of ['{broken', 'null', '123', '"x"', '[]', '{"saves":5,"settings":7}', '']) {
    assert.deepEqual(loadState(fakeStorage({ [STORAGE_KEY]: raw })), init, raw);
  }
  const raw = JSON.stringify({
    saves: [null, 5, { name: 3 }, { name: '  ', setup: {} }, { name: 'ok', setup: 'x', savedAt: 'zz' }, { name: 'ok', setup: {} }],
    settings: { muted: 'yes', showFps: true, extra: 1 },
  });
  const s = loadState(fakeStorage({ [STORAGE_KEY]: raw }));
  assert.equal(s.saves.length, 1);
  assert.equal(s.saves[0].name, 'ok');
  assert.deepEqual(s.saves[0].setup, sanitizeSetup(null));
  assert.equal(s.saves[0].savedAt, 0);
  assert.deepEqual(s.settings, { muted: false, showFps: true, showArrows: false, helpSeen: false });
});

test('範囲外の値は sanitize される', () => {
  const p = PARAMS.find((x) => x.type !== 'bool');
  const raw = JSON.stringify({ saves: [{ name: 'x', setup: { [p.key]: p.max * 100, bogus: 1 }, savedAt: 1 }] });
  const s = loadState(fakeStorage({ [STORAGE_KEY]: raw }));
  assert.ok(s.saves[0].setup[p.key] <= p.max);
  assert.equal('bogus' in s.saves[0].setup, false);
  const r = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ saves: Array.from({ length: 30 }, (_, i) => ({ name: 'n' + i, setup: {} })) }) }));
  assert.equal(r.saves.length, MAX_SAVES);
});

test('localStorage が例外を投げても落ちない', () => {
  assert.deepEqual(loadState(throwing).saves, []);
  assert.equal(saveState(loadState(fakeStorage()), throwing), false);
  assert.deepEqual(loadState(undefined).saves, []);
  assert.equal(saveState({ saves: [], settings: {} }, undefined), false);
});

test('deleteSave の範囲外', () => {
  const s = loadState(fakeStorage());
  addSave(s, 'a', defaultSetup());
  assert.equal(deleteSave(s, 5), false);
  assert.equal(deleteSave(s, -1), false);
  assert.equal(deleteSave(s, 0), true);
  assert.equal(s.saves.length, 0);
});
