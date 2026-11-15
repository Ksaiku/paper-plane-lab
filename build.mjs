// dist/index.html の1ファイルにまとめる。
//   node build.mjs                         … 本番（src/ui/main.js → dist/index.html）
//   node build.mjs --entry=X.js --out=Y.html … 部品を単体で表示する確認用
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const entry = args.entry || 'src/ui/main.js';
const out = args.out || 'dist/index.html';
const minify = args.minify !== 'false';

const result = await build({
  entryPoints: [join(root, entry)],
  bundle: true,
  format: 'iife',
  minify,
  target: ['chrome110', 'edge110'],
  write: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
js = js.replace(/<\/script/gi, '<\/script');

// CSS は base.css を先頭に、残りは名前順
const cssDir = join(root, 'src/ui/styles');
const files = readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort((a, b) => (a === 'base.css' ? -1 : b === 'base.css' ? 1 : a.localeCompare(b)));
const css = files.map((f) => `/* ${f} */\n` + readFileSync(join(cssDir, f), 'utf8')).join('\n');

const template = readFileSync(join(root, 'src/ui/index.template.html'), 'utf8');
const html = template.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
mkdirSync(dirname(join(root, out)), { recursive: true });
writeFileSync(join(root, out), html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB`);
