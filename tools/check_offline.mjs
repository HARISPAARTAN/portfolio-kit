// Fails when a text file in dist/ or demo/ names another host. Allowed: the repository link and the SVG namespace; licence files are exempt. Usage: node tools/check_offline.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = ['https://github.com/HARISPAARTAN/portfolio-kit', 'http://www.w3.org/2000/svg'];
const ABSOLUTE = /https?:\/\/[^\s"'`()<>]+/gi;
const RELATIVE = /(?:src|href|action)\s*=\s*["']?\/\/|url\(\s*["']?\/\/|(?:from|import)\s*\(?\s*["']\/\//gi;
const TEXT = /\.(css|html|js|mjs|json|md|svg|txt)$/;

export function findExternal(text) {
  const found = [];
  for (const [url] of text.matchAll(ABSOLUTE)) {
    if (!ALLOWED.some((a) => url === a || url.startsWith(`${a}/`) || url.startsWith(`${a}#`))) found.push(url);
  }
  for (const [hit] of text.matchAll(RELATIVE)) found.push(`protocol-relative: ${hit}`);
  return found;
}

if (/check_offline\.mjs$/.test(process.argv[1] ?? '')) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const problems = [];
  let scanned = 0;
  for (const path of ['dist', 'demo'].flatMap((d) => walk(join(root, d)))) {
    const name = relative(root, path).split(sep).join('/');
    if (!TEXT.test(name) || name.endsWith('LICENSES.md')) continue;
    scanned += 1;
    for (const hit of findExternal(readFileSync(path, 'utf8'))) problems.push(`${name}: ${hit}`);
  }
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(problems.length ? `${problems.length} external reference(s) in dist/ or demo/` : `no external references in ${scanned} text files of dist/ and demo/`);
  process.exit(problems.length ? 1 : 0);
}
