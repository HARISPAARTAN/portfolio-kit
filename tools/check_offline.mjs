// Fails when a text file in dist/ or demo/ names another host: http, https, ws, wss and ftp URLs, protocol-relative references
// (attributes, srcset, url(), imports, string literals) and fetch, WebSocket, EventSource, sendBeacon and open calls aimed at another host.
// Allowed: the repository link and the SVG namespace; licence files are exempt. Usage: node tools/check_offline.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = ['https://github.com/HARISPAARTAN/portfolio-kit', 'http://www.w3.org/2000/svg'];
const ABSOLUTE = /(?:https?|wss?|ftps?):\/\/[^\s"'`()<>]+/gi;
const RELATIVE = /(?:src|href|action)\s*=\s*["']?\/\/|url\(\s*["']?\/\/|(?:from|import)\s*\(?\s*["']\/\//gi;
const SRCSET = /\b(?:image)?srcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const LITERAL = /["'`]\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CALL = /(?:\bfetch|\bnew\s+(?:WebSocket|EventSource)|\bnavigator\s*\.\s*sendBeacon|\.\s*open)\s*\(\s*(?:(["'`])[A-Za-z]+\1\s*,\s*)?["'`]([^\s"'`]*)/gi;
const OTHER_HOST = /^(?:(?:https?|wss?|ftps?):)?\/\//i;
const ESCAPED_SLASH = /\\(?:\/|x2f|u002f)/gi;
const PROSE_END = /[.,;:!?]+$/;
const TEXT = /\.(css|html|js|mjs|json|md|svg|txt)$/;

const isAllowed = (url) => ALLOWED.some((a) => url === a || url.startsWith(`${a}/`) || url.startsWith(`${a}#`));

export function findExternal(raw) {
  const text = raw.replace(ESCAPED_SLASH, '/');
  const hits = [];
  // A finding that starts inside an earlier one is the same reference seen by a second pattern: report it once.
  const add = (start, end, label, at = start) => {
    if (!hits.some((h) => at >= h.start && at < h.end)) hits.push({ start, end, label });
  };
  for (const m of text.matchAll(ABSOLUTE)) {
    const url = m[0].replace(PROSE_END, '');
    if (!isAllowed(url)) add(m.index, m.index + m[0].length, url);
  }
  for (const m of text.matchAll(RELATIVE)) add(m.index, m.index + m[0].length, `protocol-relative: ${m[0]}`);
  for (const m of text.matchAll(SRCSET)) {
    const candidates = [...(m[1] ?? m[2] ?? m[3]).matchAll(/(?:^|,)\s*(\/\/[^\s,]*)/g)].map((c) => c[1]);
    if (candidates.length) add(m.index, m.index + m[0].length, `protocol-relative: srcset ${candidates.join(' ')}`);
  }
  for (const m of text.matchAll(LITERAL)) add(m.index, m.index + m[0].length, `protocol-relative: ${m[0]}`);
  for (const m of text.matchAll(CALL)) {
    const end = m.index + m[0].length;
    if (OTHER_HOST.test(m[2]) && !isAllowed(m[2].replace(PROSE_END, ''))) add(m.index, end, `request to another host: ${m[0].replace(/\s+/g, ' ')}`, end - m[2].length);
  }
  return hits.sort((a, b) => a.start - b.start).map((h) => h.label);
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
