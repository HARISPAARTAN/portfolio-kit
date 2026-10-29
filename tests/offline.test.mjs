import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, findExternal } from '../tools/check_offline.mjs';

test('the repository link and the SVG namespace are allowed', () => {
  assert.deepEqual(ALLOWED, ['https://github.com/HARISPAARTAN/portfolio-kit', 'http://www.w3.org/2000/svg']);
  assert.deepEqual(findExternal('<a href="https://github.com/HARISPAARTAN/portfolio-kit">x</a> <a href="https://github.com/HARISPAARTAN/portfolio-kit/releases">y</a>'), []);
  assert.deepEqual(findExternal("const NS = 'http://www.w3.org/2000/svg';"), []);
});

test('any other absolute URL is reported', () => {
  assert.deepEqual(findExternal('<script src="https://cdn.example.org/lib.js"></script>'), ['https://cdn.example.org/lib.js']);
  assert.deepEqual(findExternal('@import url("http://fonts.example.com/a.css");'), ['http://fonts.example.com/a.css']);
  assert.deepEqual(findExternal('see https://github.com/HARISPAARTAN/portfolio-kit-fork'), ['https://github.com/HARISPAARTAN/portfolio-kit-fork']);
});

test('protocol-relative references are reported', () => {
  assert.deepEqual(findExternal('<img src="//cdn.example.org/a.png">'), ['protocol-relative: src="//']);
  assert.deepEqual(findExternal('a{background:url(//cdn.example.org/a.png)}'), ['protocol-relative: url(//']);
  assert.deepEqual(findExternal("import x from '//cdn.example.org/x.js';"), ["protocol-relative: from '//"]);
});

test('comments and relative paths are not URLs', () => {
  assert.deepEqual(findExternal('// a comment\n/* block */ <link href="../dist/base.css"> url("inter-latin-wght-normal.woff2")'), []);
});
