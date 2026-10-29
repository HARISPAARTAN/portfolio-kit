import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MANIFEST, buildManifest, diffManifest, readTree, sha256 } from '../tools/manifest.mjs';

const entries = [{ file: 'a.css', data: Buffer.from('a{}\n') }, { file: 'fonts/x.woff2', data: Buffer.from([0, 1, 2]) }];

test('sha256 is the hex digest', () => {
  assert.equal(sha256(Buffer.from('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('buildManifest lists file, bytes and sha256 in the given order', () => {
  assert.deepEqual(buildManifest(entries, 'v9.9.9'), {
    name: 'portfolio-kit',
    version: 'v9.9.9',
    files: [
      { file: 'a.css', bytes: 4, sha256: sha256('a{}\n') },
      { file: 'fonts/x.woff2', bytes: 3, sha256: sha256(Buffer.from([0, 1, 2])) },
    ],
  });
});

test('diffManifest is empty when nothing changed', () => {
  assert.deepEqual(diffManifest(buildManifest(entries, 'v1'), entries), []);
});

test('diffManifest reports changed, unlisted and missing files', () => {
  const now = [{ file: 'a.css', data: Buffer.from('a{color:red}\n') }, { file: 'b.js', data: Buffer.from('') }];
  assert.deepEqual(diffManifest(buildManifest(entries, 'v1'), now), ['changed: a.css', `not in ${MANIFEST}: b.js`, 'missing: fonts/x.woff2']);
});

test('dist/MANIFEST.json lists exactly the files in dist/ with their sizes and hashes', () => {
  const tree = readTree(fileURLToPath(new URL('../dist/', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL(`../dist/${MANIFEST}`, import.meta.url), 'utf8'));
  assert.deepEqual(diffManifest(manifest, tree), []);
  assert.equal(manifest.version, readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim());
  assert.deepEqual(tree.map((e) => e.file), [
    'base.css',
    'echarts-theme.js',
    'flow-state.js',
    'fonts/LICENSES.md',
    'fonts/fonts.css',
    'fonts/inter-latin-wght-normal.woff2',
    'fonts/jetbrains-mono-latin-wght-normal.woff2',
    'fonts/space-grotesk-latin-wght-normal.woff2',
    'kit.js',
    'theme-boot.js',
    'tokens.css',
  ]);
});
