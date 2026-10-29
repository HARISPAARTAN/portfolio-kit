// Writes dist/MANIFEST.json (file, bytes and sha256 of every file in dist/); --check compares instead. Usage: node tools/manifest.mjs [--check]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'MANIFEST.json';
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function readTree(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? readTree(dir, `${prefix}${e.name}/`) : [{ file: `${prefix}${e.name}`, data: readFileSync(join(dir, prefix, e.name)) }]))
    .filter((e) => e.file !== MANIFEST)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export function buildManifest(entries, version) {
  return { name: 'portfolio-kit', version, files: entries.map(({ file, data }) => ({ file, bytes: data.length, sha256: sha256(data) })) };
}

export function diffManifest(manifest, entries) {
  const want = new Map(manifest.files.map((f) => [f.file, f]));
  const problems = [];
  for (const { file, data } of entries) {
    const entry = want.get(file);
    if (!entry) problems.push(`not in ${MANIFEST}: ${file}`);
    else if (entry.bytes !== data.length || entry.sha256 !== sha256(data)) problems.push(`changed: ${file}`);
    want.delete(file);
  }
  for (const file of want.keys()) problems.push(`missing: ${file}`);
  return problems;
}

if (/manifest\.mjs$/.test(process.argv[1] ?? '')) {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  const entries = readTree(dist);
  if (process.argv.includes('--check')) {
    let manifest = null;
    try {
      manifest = JSON.parse(readFileSync(join(dist, MANIFEST), 'utf8'));
    } catch (e) {
      console.error(`cannot read dist/${MANIFEST}: ${e.message}`);
      process.exit(1);
    }
    const problems = diffManifest(manifest, entries);
    if (manifest.version !== version) problems.push(`version ${manifest.version} in ${MANIFEST}, ${version} in VERSION`);
    for (const p of problems) console.error(p);
    console.log(problems.length ? `${problems.length} problem(s): run node tools/manifest.mjs and commit dist/${MANIFEST}` : `dist/${MANIFEST} matches ${entries.length} files (${version})`);
    process.exit(problems.length ? 1 : 0);
  }
  writeFileSync(join(dist, MANIFEST), `${JSON.stringify(buildManifest(entries, version), null, 2)}\n`);
  console.log(`wrote dist/${MANIFEST}: ${entries.length} files (${version})`);
}
