import { run } from './explore.mjs';
const base = JSON.parse(process.argv[2]);
const key1 = process.argv[3], vals1 = process.argv[4].split(',').map(Number);
const key2 = process.argv[5], vals2 = process.argv[6] ? process.argv[6].split(',').map(Number) : [null];
for (const a of vals1) for (const b of vals2) {
  const o = { ...base, [key1]: a }; if (key2) o[key2] = b;
  run(`${a}/${b}`, o);
}
