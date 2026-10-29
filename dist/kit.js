// portfolio-kit kit.js: storage, filter bus, formatters, CSV, sorting, renderers, tabs, device frames and the flow player. ES module, no dependencies.
export { createFlowState } from './flow-state.js';

const DASH = '–';
const MINUS = '−';
const NBSP = ' ';

export function createStore(ns, { version = 1, storage } = {}) {
  if (typeof ns !== 'string' || ns === '') throw new TypeError('createStore: ns must be a non-empty string');
  const key = `pf.${ns}.v${version}`;
  let backend = null;
  try {
    backend = storage ?? globalThis.localStorage ?? null;
    backend?.setItem(`${key}.probe`, '1');
    backend?.removeItem(`${key}.probe`);
  } catch {
    backend = null;
  }
  let mem = null;
  let inMemory = !backend;
  return {
    key,
    available: Boolean(backend),
    load() {
      if (inMemory) return mem === null ? null : JSON.parse(mem);
      try {
        const raw = backend.getItem(key);
        return raw === null || raw === undefined ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    save(obj) {
      const text = JSON.stringify(obj);
      if (backend) {
        try {
          backend.setItem(key, text);
          inMemory = false;
          mem = null;
          return true;
        } catch {
          /* full or blocked: keep the value in memory */
        }
      }
      mem = text;
      inMemory = true;
      return false;
    },
    clear() {
      mem = null;
      inMemory = !backend;
      try {
        backend?.removeItem(key);
      } catch {
        /* nothing to remove */
      }
    },
  };
}

const same = (a, b) => a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

export function createFilterBus() {
  let state = Object.freeze({});
  const subs = new Set();
  const emit = (change) => {
    for (const fn of [...subs]) fn(state, change);
  };
  const put = (dim, value) => {
    const has = Object.hasOwn(state, dim);
    if (value === null || value === undefined ? !has : has && same(state[dim], value)) return;
    const next = { ...state };
    if (value === null || value === undefined) delete next[dim];
    else next[dim] = value;
    state = Object.freeze(next);
    emit({ dim, value: value ?? null });
  };
  return {
    state: () => state,
    get: (dim) => (Object.hasOwn(state, dim) ? state[dim] : null),
    set: put,
    toggle: (dim, value) => put(dim, Object.hasOwn(state, dim) && same(state[dim], value) ? null : value),
    clear(dim) {
      if (dim !== undefined) return put(dim, null);
      if (Object.keys(state).length === 0) return undefined;
      state = Object.freeze({});
      return emit({ dim: null, value: null });
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

const formats = new Map();
const nf = (opts) => {
  const k = JSON.stringify(opts);
  if (!formats.has(k)) formats.set(k, new Intl.NumberFormat('en-GB', opts));
  return formats.get(k);
};
const toNumber = (v) => {
  if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && v.trim() === '')) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, opts, tail = (s) => s) => {
  const n = toNumber(v);
  return n === null ? DASH : tail(nf(opts).format(n).replace('-', MINUS));
};
const fixed = (digits, signDisplay = 'negative') => ({ minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
function wallClock(v) {
  let p;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    p = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes()];
  } else {
    const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v) : null;
    if (!m) return null;
    p = m.slice(1).map((x) => Number(x ?? 0));
  }
  const [y, mo, d, hh, mi] = p;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d && hh < 24 && mi < 60 ? p : null;
}

export const fmt = {
  int: (n) => num(n, fixed(0)),
  dec: (n, digits = 1) => num(n, fixed(digits)),
  money: (n, currency = 'EUR', digits = 0) => num(n, { style: 'currency', currency, ...fixed(digits) }),
  compact: (n) => num(n, { notation: 'compact', maximumFractionDigits: 1, signDisplay: 'negative' }, (s) => s.toLowerCase()),
  pct: (x, digits = 1) => num(x, { style: 'percent', ...fixed(digits) }, (s) => s.replace('%', `${NBSP}%`)),
  pp: (x, digits = 1) => num(x, { style: 'percent', ...fixed(digits, 'exceptZero') }, (s) => s.replace('%', `${NBSP}pp`)),
  signed: (n, digits = 0) => num(n, fixed(digits, 'exceptZero')),
  date(iso) {
    const p = wallClock(iso);
    return p ? `${pad2(p[2])} ${MONTHS[p[1] - 1]} ${p[0]}` : DASH;
  },
  dateTime(iso) {
    const p = wallClock(iso);
    return p ? `${pad2(p[2])} ${MONTHS[p[1] - 1]} ${p[0]} ${pad2(p[3])}:${pad2(p[4])}` : DASH;
  },
};

export function toCsv(rows, columns, { delimiter = ',', bom = true, escapeFormulas = true } = {}) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    if (escapeFormulas && typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label ?? c.key)), ...rows.map((row) => columns.map((c) => cell(row[c.key])))];
  return `${bom ? '﻿' : ''}${lines.map((l) => l.join(delimiter)).join('\r\n')}\r\n`;
}

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });
const sortValue = (v) => (v instanceof Date ? v.getTime() : typeof v === 'boolean' ? Number(v) : v);
const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

export function sortRows(rows, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: sortValue(row[key]) }))
    .sort((a, b) => {
      const ba = isBlank(a.v);
      const bb = isBlank(b.v);
      if (ba || bb) return ba === bb ? a.i - b.i : ba ? 1 : -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : collator.compare(String(a.v), String(b.v));
      return sign * Math.sign(c) || a.i - b.i;
    })
    .map((e) => e.row);
}
