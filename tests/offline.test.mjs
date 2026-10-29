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

test('the allowed strings stay allowed when prose punctuation follows them', () => {
  assert.deepEqual(findExternal('Source: https://github.com/HARISPAARTAN/portfolio-kit.'), []);
  assert.deepEqual(findExternal('(see https://github.com/HARISPAARTAN/portfolio-kit), then'), []);
  assert.deepEqual(findExternal('Releases: https://github.com/HARISPAARTAN/portfolio-kit/releases, and the namespace http://www.w3.org/2000/svg.'), []);
  assert.deepEqual(findExternal('namespace (http://www.w3.org/2000/svg)'), []);
  assert.deepEqual(findExternal('see http://www.w3.org/2000/svg.example.org'), ['http://www.w3.org/2000/svg.example.org']);
});

test('ws, wss and ftp URLs are reported', () => {
  assert.deepEqual(findExternal("const s = 'ws://localhost:8080/live';"), ['ws://localhost:8080/live']);
  assert.deepEqual(findExternal('const s = "wss://stream.example.org/feed";'), ['wss://stream.example.org/feed']);
  assert.deepEqual(findExternal('<a href="ftp://files.example.org/a.zip">a</a>'), ['ftp://files.example.org/a.zip']);
  assert.deepEqual(findExternal("new WebSocket('wss://stream.example.org/feed')"), ['wss://stream.example.org/feed']);
});

test('srcset candidates with a host are reported', () => {
  assert.deepEqual(findExternal('<img srcset="//cdn.example.org/a.png 1x, //cdn.example.org/b.png 2x">'), ['protocol-relative: srcset //cdn.example.org/a.png //cdn.example.org/b.png']);
  assert.deepEqual(findExternal('<img srcset="a.png 1x, //cdn.example.org/b.png 2x">'), ['protocol-relative: srcset //cdn.example.org/b.png']);
  assert.deepEqual(findExternal("<source srcset='https://cdn.example.org/a.webp 1x, b.webp 2x'>"), ['https://cdn.example.org/a.webp']);
  assert.deepEqual(findExternal('<img srcset="img/a.png 1x, img/b.png 2x">'), []);
});

test('string literals that start with // and a host are reported, other // strings are not', () => {
  assert.deepEqual(findExternal("const a = '//cdn.example.org/x.js';"), ["protocol-relative: '//cdn.example.org"]);
  assert.deepEqual(findExternal('const a = "//cdn.example.org/x.js";'), ['protocol-relative: "//cdn.example.org']);
  assert.deepEqual(findExternal('const a = `//cdn.example.org/${name}.js`;'), ['protocol-relative: `//cdn.example.org']);
  assert.deepEqual(findExternal('import(`//cdn.example.org/x.js`)'), ['protocol-relative: `//cdn.example.org']);
  assert.deepEqual(findExternal("const sep = '//'; const t = '// not a url'; const h = \"//localhost\";"), []);
});

test('calls that load from another host are reported once', () => {
  assert.deepEqual(findExternal("fetch('//localhost:8080/api')"), ["request to another host: fetch('//localhost:8080/api"]);
  assert.deepEqual(findExternal("fetch('https://' + host + '/data.json')"), ["request to another host: fetch('https://"]);
  assert.deepEqual(findExternal("window.fetch( \"HTTP://\" + host )"), ['request to another host: fetch( "HTTP://']);
  assert.deepEqual(findExternal("new EventSource(`//${host}/events`)"), ['request to another host: new EventSource(`//${host}/events']);
  assert.deepEqual(findExternal("navigator.sendBeacon('https://' + host, data)"), ["request to another host: navigator.sendBeacon('https://"]);
  assert.deepEqual(findExternal("const x = new XMLHttpRequest(); x.open('GET', 'https://' + base);"), ["request to another host: .open('GET', 'https://"]);
  assert.deepEqual(findExternal("fetch('https://cdn.example.org/data.json')"), ['https://cdn.example.org/data.json']);
  assert.deepEqual(findExternal("x.open('GET', 'http://cdn.example.org/a')"), ['http://cdn.example.org/a']);
  assert.deepEqual(findExternal("fetch('//localhost/a'); const u = \"ws://x.example.org\";"), ["request to another host: fetch('//localhost/a", 'ws://x.example.org']);
});

test('calls to the same site, to variables or to the allowed repository link are not reported', () => {
  const calls = [
    "fetch('data/a.json')",
    "fetch('/api/data')",
    'fetch(`./${name}.json`)',
    'fetch(url)',
    "prefetch('//')",
    "x.open('GET', 'data.csv')",
    "dialog.open('details')",
    'new WebSocket(endpoint)',
    "navigator.sendBeacon('/log', data)",
    "fetch('https://github.com/HARISPAARTAN/portfolio-kit/releases.json')",
  ];
  for (const call of calls) assert.deepEqual(findExternal(call), [], call);
});

test('escaped slashes do not hide a URL', () => {
  assert.deepEqual(findExternal('{"url":"https:\\/\\/cdn.example.org\\/lib.js"}'), ['https://cdn.example.org/lib.js']);
  assert.deepEqual(findExternal("const u = 'https:\\u002f\\u002fcdn.example.org/lib.js';"), ['https://cdn.example.org/lib.js']);
  assert.deepEqual(findExternal("const u = 'https:\\x2f\\x2fcdn.example.org/lib.js';"), ['https://cdn.example.org/lib.js']);
});
