// Size limits of the vendored files (1 KB = 1024 bytes). Usage: node tools/check_size.mjs
import { readdirSync, statSync } from 'node:fs';

const KB = 1024;
const root = new URL('../', import.meta.url);
const fonts = readdirSync(new URL('dist/fonts/', root)).filter((f) => f.endsWith('.woff2')).sort().map((f) => [`dist/fonts/${f}`, 120 * KB]);
const limits = [['dist/kit.js', 40 * KB], ['dist/base.css', 30 * KB], ['dist/tokens.css', 6 * KB], ...fonts];
let failed = fonts.length === 3 ? 0 : 1;
if (failed) console.log(`FAIL expected 3 fonts in dist/fonts/, found ${fonts.length}`);
for (const [file, limit] of limits) {
  const bytes = statSync(new URL(file, root)).size;
  if (bytes > limit) failed += 1;
  console.log(`${bytes > limit ? 'FAIL' : 'ok  '} ${file.padEnd(50)} ${String(bytes).padStart(6)} of ${limit} bytes`);
}
process.exit(failed ? 1 : 0);
