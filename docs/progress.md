# 進み具合

作業が途切れたら、ここを読んで再開する。区切りごとに更新する。

## いまの状態（2026-11-15）

| 手順 | 内容 | 状態 |
|---|---|---|
| 1 | 要件を読む | 済 |
| 2 | CLAUDE.md | 済 |
| 3 | docs/design.md | 済（画面を作りながら追記する） |
| 4 | 物理の計算とテスト | 済（`npm test`：物理14本＋保存10本） |
| 5 | 画面・3D・操作・音・保存 | **作業中**（下の表） |
| 6 | 判定基準13項目の確認 | 未 |
| 7 | 磨き込み3周 | 未 |
| 8 | 最後の報告 | 未 |

## 手順5の内訳

| 部品 | ファイル | 状態 |
|---|---|---|
| 全体の進行 | `src/ui/main.js`、`camera.js`、`scene/aim.js` | 書いた。まだ全体では動かしていない |
| 音・保存 | `audio.js`、`storage.js`、`tests/storage.test.mjs` | 済（テスト10本通過、音は波形の数値で確認） |
| 表示部品 | `overlays.js`、`styles/overlays.css` | 済（画面写真で確認） |
| 風の粒・上昇気流・着地の目印 | `scene/effects.js` | 済（サブエージェントの報告。全体に入れて要確認） |
| 3D世界 | `scene/world.js` | 途中（本体は書けている。単体表示での確認がまだ） |
| 機体・軌跡・矢印 | `scene/plane.js`、`trails.js`、`arrows.js` | 途中（見直しの周回が残り） |
| 設計パネル・設計図 | `panel.js`、`blueprint.js`、`styles/panel.css` | 途中（見直しの周回が残り） |

※ 途中の3つは、利用上限で一度止まり、続きから再開させた。もしまた止まったら、
　上のファイルを読んで `docs/design.md` 10-3 の約束（API）どおりか確かめ、足りない所を埋める。

## 次にすること
1. 途中の3部品が終わったら `npm run build` → `dist/index.html`。コンソールのエラー0件にする
2. `scripts/verify.mjs`（Playwright）で判定基準13項目を確認 → `docs/verification.md`、画面写真は `docs/screenshots/`
3. 磨き込み3周（各周の内容をこのファイルに追記）
4. 最後の報告

## 道具
- `node scripts/dev/report.mjs`：お手本と代表的な条件を飛ばして、数字と一言解説を一覧
- `node build.mjs --entry=scripts/dev/demos/<名前>.js --out=.tmp/<名前>.html --minify=false`：部品を単体で表示
- `node scripts/dev/shot.mjs <html> <png> [--w --h --wait --eval]`：画面写真（ヘッドレスの Edge）とコンソールのエラー表示
