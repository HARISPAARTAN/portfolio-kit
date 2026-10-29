import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt } from '../dist/kit.js';

const M = '\u2212';
const NB = '\u00A0';
const DASH = '\u2013';

test('int rounds and groups with en-GB separators', () => {
  assert.equal(fmt.int(0), '0');
  assert.equal(fmt.int(1234567.4), '1,234,567');
  assert.equal(fmt.int(-1234.5), `${M}1,235`);
  assert.equal(fmt.int(-0.4), '0');
  assert.equal(fmt.int('12'), '12');
});

test('dec keeps a fixed number of digits', () => {
  assert.equal(fmt.dec(1234.56), '1,234.6');
  assert.equal(fmt.dec(0), '0.0');
  assert.equal(fmt.dec(-2.3456, 2), `${M}2.35`);
  assert.equal(fmt.dec(7, 0), '7');
});

test('money uses the currency symbol and whole units by default', () => {
  assert.equal(fmt.money(1234.5), '€1,235');
  assert.equal(fmt.money(-1234), `${M}€1,234`);
  assert.equal(fmt.money(0), '€0');
  assert.equal(fmt.money(1999.999, 'EUR', 2), '€2,000.00');
  assert.equal(fmt.money(42, 'USD'), 'US$42');
});

test('compact shortens large numbers with lower-case suffixes', () => {
  assert.equal(fmt.compact(0), '0');
  assert.equal(fmt.compact(999), '999');
  assert.equal(fmt.compact(1234), '1.2k');
  assert.equal(fmt.compact(-1500), `${M}1.5k`);
  assert.equal(fmt.compact(3.4e6), '3.4m');
  assert.equal(fmt.compact(2.5e9), '2.5b');
});

test('pct turns a fraction into a percentage', () => {
  assert.equal(fmt.pct(0.123), `12.3${NB}%`);
  assert.equal(fmt.pct(0), `0.0${NB}%`);
  assert.equal(fmt.pct(-0.05, 0), `${M}5${NB}%`);
  assert.equal(fmt.pct(1.5), `150.0${NB}%`);
});

test('pp shows a signed difference of two shares in percentage points', () => {
  assert.equal(fmt.pp(0.012), `+1.2${NB}pp`);
  assert.equal(fmt.pp(-0.034), `${M}3.4${NB}pp`);
  assert.equal(fmt.pp(0), `0.0${NB}pp`);
  assert.equal(fmt.pp(-0.0004), `0.0${NB}pp`);
});

test('signed always shows the sign except for zero', () => {
  assert.equal(fmt.signed(3), '+3');
  assert.equal(fmt.signed(-2), `${M}2`);
  assert.equal(fmt.signed(0), '0');
  assert.equal(fmt.signed(1234), '+1,234');
  assert.equal(fmt.signed(1.25, 1), '+1.3');
});

test('large values keep the en-GB grouping', () => {
  assert.equal(fmt.int(1234567890123), '1,234,567,890,123');
  assert.equal(fmt.money(12345678.9), '€12,345,679');
  assert.equal(fmt.dec(9876543.21, 2), '9,876,543.21');
});

test('null, undefined, NaN, Infinity, empty strings and booleans render as an en dash', () => {
  for (const f of [fmt.int, fmt.dec, fmt.money, fmt.compact, fmt.pct, fmt.pp, fmt.signed]) {
    for (const v of [null, undefined, NaN, Infinity, '', true]) assert.equal(f(v), DASH, `${f.name}(${String(v)})`);
  }
});

test('every formatter writes negatives with the minus sign, never a hyphen', () => {
  for (const out of [fmt.int(-5), fmt.dec(-5), fmt.money(-5), fmt.compact(-5000), fmt.pct(-0.5), fmt.pp(-0.5), fmt.signed(-5)]) {
    assert.ok(out.startsWith(M), out);
    assert.ok(!out.includes('-'), out);
  }
});

test('date and dateTime show the wall-clock value written in the ISO string', () => {
  assert.equal(fmt.date('2025-10-01'), '01 Oct 2025');
  assert.equal(fmt.date('2025-09-15T23:30:00Z'), '15 Sep 2025');
  assert.equal(fmt.dateTime('2025-10-01T09:00'), '01 Oct 2025 09:00');
  assert.equal(fmt.dateTime('2025-10-01 17:45:12'), '01 Oct 2025 17:45');
  assert.equal(fmt.dateTime('2025-10-01'), '01 Oct 2025 00:00');
  assert.equal(fmt.date(new Date(Date.UTC(2025, 0, 2, 12))), '02 Jan 2025');
  assert.equal(fmt.dateTime('2025-10-01T09:00:00Z'), '01 Oct 2025 09:00');
  assert.equal(fmt.dateTime('2025-10-01T09:00:00.250+02:00'), '01 Oct 2025 09:00');
});

test('dates that cannot be read render as an en dash', () => {
  for (const v of [null, undefined, '', 'not a date', '2025-13-01', '01.10.2025', '2025-10-01garbage', '2025-10-01T09', '2025-10-01T9:00', new Date('nope'), 20251001]) {
    assert.equal(fmt.date(v), DASH, String(v));
    assert.equal(fmt.dateTime(v), DASH, String(v));
  }
});
