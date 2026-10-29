import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../dist/kit.js';

const columns = [{ key: 'id', label: 'Order' }, { key: 'note', label: 'Note' }, { key: 'amount', label: 'Amount' }];

test('header from the columns in their order, CRLF line ends and a BOM by default', () => {
  assert.equal(toCsv([{ amount: 12.5, note: 'ok', id: 'SO-1' }], columns), '\uFEFFOrder,Note,Amount\r\nSO-1,ok,12.5\r\n');
});

test('bom: false leaves the BOM out', () => {
  assert.equal(toCsv([], columns, { bom: false }), 'Order,Note,Amount\r\n');
});

test('cells with commas, quotes or line breaks are quoted (RFC 4180)', () => {
  const rows = [{ id: 'a,b', note: 'say "hi"', amount: 'two\nlines' }, { id: 'cr\rx', note: '', amount: null }];
  assert.equal(toCsv(rows, columns, { bom: false }), 'Order,Note,Amount\r\n"a,b","say ""hi""","two\nlines"\r\n"cr\rx",,\r\n');
});

test('text starting with = + - @ gets a leading apostrophe; numbers do not', () => {
  const rows = [{ id: '=SUM(A1:A2)', note: '+1+1', amount: -5 }, { id: '@cmd', note: '-x', amount: 0 }];
  assert.equal(toCsv(rows, columns, { bom: false }), "Order,Note,Amount\r\n'=SUM(A1:A2),'+1+1,-5\r\n'@cmd,'-x,0\r\n");
});

test('a formula cell that also needs quotes is escaped first and quoted second', () => {
  assert.equal(toCsv([{ id: '=A1,B1', note: '', amount: 1 }], columns, { bom: false }), `Order,Note,Amount\r\n"'=A1,B1",,1\r\n`);
});

test('escapeFormulas: false keeps the text as it is', () => {
  assert.equal(toCsv([{ id: '=1+1', note: '', amount: 1 }], columns, { bom: false, escapeFormulas: false }), 'Order,Note,Amount\r\n=1+1,,1\r\n');
});

test('a custom delimiter is used for joining and quoting', () => {
  assert.equal(toCsv([{ id: 'a;b', note: 'c,d', amount: 1.5 }], columns, { delimiter: ';', bom: false }), 'Order;Note;Amount\r\n"a;b";c,d;1.5\r\n');
});

test('dates become ISO strings; booleans, missing keys and labels default sensibly', () => {
  const out = toCsv([{ id: new Date(Date.UTC(2025, 9, 1)), flag: true }], [{ key: 'id' }, { key: 'flag', label: 'Flag' }, { key: 'missing', label: 'Missing' }], { bom: false });
  assert.equal(out, 'id,Flag,Missing\r\n2025-10-01T00:00:00.000Z,true,\r\n');
});
