import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRows } from '../dist/kit.js';

const rows = [
  { n: 3, s: 'b' },
  { n: null, s: 'a' },
  { n: 1, s: 'B' },
  { n: 3, s: 'c' },
  { n: undefined, s: 'd' },
  { n: 2, s: 'item 10' },
  { n: 2, s: 'item 9' },
];

test('numbers sort ascending with blanks last and ties in their original order', () => {
  assert.deepEqual(sortRows(rows, 'n').map((r) => r.s), ['B', 'item 10', 'item 9', 'b', 'c', 'a', 'd']);
});

test('descending keeps blanks last and ties stable', () => {
  assert.deepEqual(sortRows(rows, 'n', 'desc').map((r) => r.s), ['b', 'c', 'item 10', 'item 9', 'B', 'a', 'd']);
});

test('text compares in en-GB order, ignores case and reads numbers inside text', () => {
  assert.deepEqual(sortRows(rows, 's').map((r) => r.s), ['a', 'b', 'B', 'c', 'd', 'item 9', 'item 10']);
});

test('dates, booleans and empty strings', () => {
  const d = [{ v: new Date('2025-10-02') }, { v: '' }, { v: new Date('2025-09-30') }];
  assert.deepEqual(sortRows(d, 'v').map((r) => (r.v === '' ? '' : r.v.toISOString().slice(0, 10))), ['2025-09-30', '2025-10-02', '']);
  assert.deepEqual(sortRows([{ v: true }, { v: false }], 'v').map((r) => r.v), [false, true]);
});

test('the input array is not changed', () => {
  const copy = rows.map((r) => ({ ...r }));
  sortRows(rows, 'n', 'desc');
  assert.deepEqual(rows, copy);
});
