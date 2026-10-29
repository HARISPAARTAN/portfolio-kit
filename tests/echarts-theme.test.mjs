import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diverging, palette, registerThemes, sequential, statusColors, theme } from '../dist/echarts-theme.js';
import { hexToRgb, luminance, parseTokens } from '../tools/contrast.mjs';

const tokens = parseTokens(readFileSync(new URL('../dist/tokens.css', import.meta.url), 'utf8'));
const MODES = ['dark', 'light'];

test('the categorical palette equals --chart-1 … --chart-8 of tokens.css', () => {
  for (const m of MODES) assert.deepEqual([...palette[m]], Array.from({ length: 8 }, (_, i) => tokens[m][`chart-${i + 1}`]));
});

test('every exported colour list is frozen', () => {
  for (const group of [palette, sequential, diverging]) {
    assert.ok(Object.isFrozen(group));
    for (const m of MODES) assert.ok(Object.isFrozen(group[m]));
  }
});

test('the sequential ramp runs from the lowest to the highest value', () => {
  const light = sequential.light.map(luminance);
  const dark = sequential.dark.map(luminance);
  assert.equal(light.length, 6);
  assert.equal(dark.length, 6);
  for (let i = 1; i < 6; i++) {
    assert.ok(light[i] < light[i - 1], `light step ${i} is darker`);
    assert.ok(dark[i] > dark[i - 1], `dark step ${i} is lighter`);
  }
});

test('the diverging ramp has seven steps around a neutral grey', () => {
  for (const m of MODES) {
    assert.equal(diverging[m].length, 7);
    const [r, g, b] = hexToRgb(diverging[m][3]);
    assert.ok(r === g && g === b, `${m} midpoint is grey`);
  }
});

test('statusColors equal the status tokens', () => {
  for (const m of MODES) assert.deepEqual(statusColors(m), { ok: tokens[m].ok, warn: tokens[m].warn, danger: tokens[m].danger, info: tokens[m].info });
});

test('theme(mode) maps the tokens onto the ECharts theme keys', () => {
  const t = theme('light');
  assert.deepEqual(t.color, [...palette.light]);
  assert.equal(t.backgroundColor, 'transparent');
  assert.equal(t.textStyle.color, tokens.light.text);
  assert.deepEqual(t.tooltip, { backgroundColor: tokens.light.surface, borderColor: tokens.light.border, borderWidth: 1, textStyle: { color: tokens.light.text } });
  for (const k of ['categoryAxis', 'valueAxis', 'logAxis', 'timeAxis']) {
    assert.equal(t[k].axisLine.lineStyle.color, tokens.light.border);
    assert.equal(t[k].axisLabel.color, tokens.light.muted);
    assert.equal(t[k].splitLine.lineStyle.color, 'rgba(221,217,208,0.5)');
  }
  assert.deepEqual(t.visualMap.inRange.color, [...sequential.light]);
  assert.equal(theme('dark').valueAxis.splitLine.lineStyle.color, 'rgba(31,42,54,0.5)');
});

test('theme returns a new object on every call', () => {
  const a = theme('dark');
  a.color.push('#000000');
  a.valueAxis.axisLabel.color = 'red';
  assert.equal(theme('dark').color.length, 8);
  assert.equal(theme('dark').valueAxis.axisLabel.color, tokens.dark.muted);
  const b = theme('dark');
  assert.notEqual(b.valueAxis, b.categoryAxis);
});

test('an unknown mode is rejected', () => {
  assert.throws(() => theme('sepia'), RangeError);
  assert.throws(() => statusColors(), RangeError);
});

test('registerThemes registers pf-dark and pf-light', () => {
  const seen = [];
  const names = registerThemes({ registerTheme: (name, obj) => seen.push([name, obj.color[0]]) });
  assert.deepEqual(names, { dark: 'pf-dark', light: 'pf-light' });
  assert.deepEqual(seen, [['pf-dark', palette.dark[0]], ['pf-light', palette.light[0]]]);
});
