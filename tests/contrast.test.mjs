import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTokens, hexToRgb, luminance, mix, parseTokens, ratio } from '../tools/contrast.mjs';

const tokens = parseTokens(readFileSync(new URL('../dist/tokens.css', import.meta.url), 'utf8'));
const CHARTS = Array.from({ length: 8 }, (_, i) => `chart-${i + 1}`);
const COLOURS = ['bg', 'surface', 'surface-2', 'border', 'text', 'muted', 'accent', 'accent-fg', 'ok', 'warn', 'danger', 'info', ...CHARTS];

test('ratio and luminance follow the WCAG 2.x formula', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#FFFFFF').toFixed(6), '1.000000');
  assert.equal(ratio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(ratio('#FFFFFF', '#000000').toFixed(2), '21.00');
  assert.equal(ratio('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(ratio('#0B0F14', '#0B0F14'), 1);
});

test('mix matches color-mix(in srgb) rounded to whole channels', () => {
  assert.equal(mix('#FFFFFF', '#000000', 0.5), '#808080');
  assert.equal(mix('#FF0000', '#0000FF', 1), '#FF0000');
  assert.equal(mix('#FF0000', '#0000FF', 0), '#0000FF');
  assert.equal(mix('#3ddc97', '#121820', 0.18), '#1A3B35');
});

test('colours must be #rrggbb', () => {
  assert.deepEqual(hexToRgb('#0b0f14'), [11, 15, 20]);
  assert.throws(() => hexToRgb('#FFF'), /not a #rrggbb colour/);
  assert.throws(() => ratio('red', '#000000'), /not a #rrggbb colour/);
});

test('parseTokens reads the dark block and the light block', () => {
  const css = ':root{\n  color-scheme:dark;\n  --bg:#0b0f14;\n  --font-text:"Inter",sans-serif;\n}\n:root[data-theme="light"]{\n  --bg:#F7F7F4;\n}\n';
  assert.deepEqual(parseTokens(css), { dark: { bg: '#0B0F14' }, light: { bg: '#F7F7F4' } });
  assert.throws(() => parseTokens('body{}'), /block not found/);
});

test('both themes define every colour token', () => {
  for (const theme of ['dark', 'light']) {
    for (const name of COLOURS) assert.match(tokens[theme][name] ?? '', /^#[0-9A-F]{6}$/, `${theme} --${name}`);
  }
});

test('the hub colours are unchanged', () => {
  const pick = (t) => ['bg', 'surface', 'surface-2', 'border', 'text', 'muted', 'accent', 'accent-fg', 'ok'].map((k) => t[k]);
  assert.deepEqual(pick(tokens.dark), ['#0B0F14', '#121820', '#182130', '#1F2A36', '#E6EDF3', '#93A1B0', '#F2A93B', '#1A1200', '#3DDC97']);
  assert.deepEqual(pick(tokens.light), ['#F7F7F4', '#FFFFFF', '#F0EFEA', '#DDD9D0', '#14181D', '#5B6472', '#B45309', '#FFFFFF', '#15803D']);
});

for (const theme of ['dark', 'light']) {
  test(`${theme} theme meets every contrast floor`, () => {
    const rows = checkTokens(tokens[theme]);
    assert.equal(rows.length, 29);
    assert.deepEqual(rows.filter((r) => !r.pass).map((r) => `${r.pair}: ${r.value} < ${r.min}`), []);
  });
}

test('checkTokens reports a pair below its floor', () => {
  const row = checkTokens({ ...tokens.dark, muted: '#3A4350' }).find((r) => r.pair === '--muted on --bg');
  assert.equal(row.pass, false);
  assert.ok(row.value < 4.5);
});
