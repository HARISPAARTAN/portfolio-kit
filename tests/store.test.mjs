import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../dist/kit.js';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
const blocked = () => {
  throw new Error('SecurityError: storage is disabled');
};
const throwing = { getItem: blocked, setItem: blocked, removeItem: blocked };

test('the key carries the namespace and the version', () => {
  assert.equal(createStore('orders', { storage: memoryStorage() }).key, 'pf.orders.v1');
  assert.equal(createStore('orders', { version: 3, storage: memoryStorage() }).key, 'pf.orders.v3');
});

test('save and load round-trip JSON through the storage', () => {
  const storage = memoryStorage();
  const store = createStore('demo', { storage });
  assert.equal(store.available, true);
  assert.equal(store.load(), null);
  assert.equal(store.save({ region: ['North'], page: 2 }), true);
  assert.equal(storage.map.get('pf.demo.v1'), '{"region":["North"],"page":2}');
  assert.deepEqual(store.load(), { region: ['North'], page: 2 });
  assert.deepEqual(createStore('demo', { storage }).load(), { region: ['North'], page: 2 });
});

test('the availability probe leaves nothing behind', () => {
  const storage = memoryStorage();
  createStore('demo', { storage });
  assert.equal(storage.map.size, 0);
});

test('a new version starts empty and leaves the old key alone', () => {
  const storage = memoryStorage();
  createStore('demo', { storage }).save({ a: 1 });
  assert.equal(createStore('demo', { version: 2, storage }).load(), null);
  assert.equal(storage.map.get('pf.demo.v1'), '{"a":1}');
});

test('clear removes the stored value', () => {
  const storage = memoryStorage();
  const store = createStore('demo', { storage });
  store.save({ a: 1 });
  store.clear();
  assert.equal(store.load(), null);
  assert.equal(storage.map.has('pf.demo.v1'), false);
});

test('a throwing storage gives available false and in-memory behaviour', () => {
  const store = createStore('demo', { storage: throwing });
  assert.equal(store.available, false);
  assert.equal(store.load(), null);
  assert.equal(store.save({ a: 1 }), false);
  assert.deepEqual(store.load(), { a: 1 });
  store.clear();
  assert.equal(store.load(), null);
});

test('a localStorage getter that throws is handled', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: blocked });
  try {
    const store = createStore('demo');
    assert.equal(store.available, false);
    assert.equal(store.save([1, 2]), false);
    assert.deepEqual(store.load(), [1, 2]);
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  }
});

test('a full storage keeps the value in memory', () => {
  const storage = memoryStorage();
  const full = {
    ...storage,
    setItem: (k, v) => {
      if (k === 'pf.demo.v1') throw new Error('QuotaExceededError');
      storage.setItem(k, v);
    },
  };
  const store = createStore('demo', { storage: full });
  assert.equal(store.available, true);
  assert.equal(store.save({ big: true }), false);
  assert.deepEqual(store.load(), { big: true });
});

test('corrupt JSON loads as null', () => {
  const storage = memoryStorage();
  storage.map.set('pf.demo.v1', '{oops');
  assert.equal(createStore('demo', { storage }).load(), null);
});

test('the namespace must be a non-empty string', () => {
  assert.throws(() => createStore(''), TypeError);
  assert.throws(() => createStore(42), TypeError);
});
