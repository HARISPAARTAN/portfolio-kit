import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFilterBus } from '../dist/kit.js';

test('starts empty with a frozen state', () => {
  const bus = createFilterBus();
  assert.deepEqual(bus.state(), {});
  assert.ok(Object.isFrozen(bus.state()));
  assert.equal(bus.get('region'), null);
});

test('set stores a value and set(dim, null) removes the dimension', () => {
  const bus = createFilterBus();
  bus.set('region', 'North');
  bus.set('year', 2025);
  assert.deepEqual(bus.state(), { region: 'North', year: 2025 });
  assert.equal(bus.get('region'), 'North');
  bus.set('region', null);
  assert.deepEqual(bus.state(), { year: 2025 });
  assert.equal('region' in bus.state(), false);
});

test('toggle sets the value, or removes it when it is already the value', () => {
  const bus = createFilterBus();
  bus.toggle('region', 'North');
  assert.equal(bus.get('region'), 'North');
  bus.toggle('region', 'South');
  assert.equal(bus.get('region'), 'South');
  bus.toggle('region', 'South');
  assert.equal(bus.get('region'), null);
});

test('toggle compares arrays and objects by value', () => {
  const bus = createFilterBus();
  bus.toggle('regions', ['North', 'East']);
  bus.toggle('regions', ['North', 'East']);
  assert.deepEqual(bus.state(), {});
});

test('set keeps a frozen copy, so changing the array afterwards changes nothing', () => {
  const bus = createFilterBus();
  const calls = [];
  bus.subscribe((state, change) => calls.push(change));
  const regions = ['North'];
  bus.set('regions', regions);
  assert.ok(Object.isFrozen(bus.get('regions')));
  assert.notEqual(bus.get('regions'), regions);
  regions.push('South');
  assert.deepEqual(bus.get('regions'), ['North']);
  assert.deepEqual(bus.state(), { regions: ['North'] });
  bus.set('regions', regions);
  assert.deepEqual(bus.get('regions'), ['North', 'South']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { dim: 'regions', value: ['North', 'South'] });
  assert.throws(() => bus.get('regions').push('East'), TypeError);
});

test('plain objects are copied and frozen too, and toggle stores a copy', () => {
  const bus = createFilterBus();
  const range = { from: 1, to: 5 };
  bus.set('range', range);
  range.to = 9;
  assert.deepEqual(bus.get('range'), { from: 1, to: 5 });
  assert.ok(Object.isFrozen(bus.get('range')));
  const ids = [1, 2];
  bus.toggle('ids', ids);
  ids.length = 0;
  assert.deepEqual(bus.get('ids'), [1, 2]);
  bus.toggle('ids', [1, 2]);
  assert.equal(bus.get('ids'), null);
  const when = new Date(0);
  bus.set('when', when);
  assert.equal(bus.get('when'), when);
});

test('clear(dim) removes one dimension and clear() removes all', () => {
  const bus = createFilterBus();
  bus.set('region', 'North');
  bus.set('status', 'Open');
  bus.clear('region');
  assert.deepEqual(bus.state(), { status: 'Open' });
  bus.set('region', 'West');
  bus.clear();
  assert.deepEqual(bus.state(), {});
});

test('subscribers receive (state, { dim, value }) synchronously after every change', () => {
  const bus = createFilterBus();
  const seen = [];
  bus.subscribe((state, change) => seen.push([{ ...state }, change]));
  bus.set('region', 'North');
  assert.equal(seen.length, 1);
  bus.toggle('region', 'North');
  bus.set('status', 'Open');
  bus.clear();
  assert.deepEqual(seen, [
    [{ region: 'North' }, { dim: 'region', value: 'North' }],
    [{}, { dim: 'region', value: null }],
    [{ status: 'Open' }, { dim: 'status', value: 'Open' }],
    [{}, { dim: null, value: null }],
  ]);
});

test('calls that change nothing do not notify', () => {
  const bus = createFilterBus();
  let calls = 0;
  bus.subscribe(() => {
    calls += 1;
  });
  bus.set('region', 'North');
  bus.set('region', 'North');
  bus.clear('status');
  bus.set('status', null);
  bus.clear('region');
  bus.clear();
  assert.equal(calls, 2);
});

test('unsubscribe stops notifications', () => {
  const bus = createFilterBus();
  let calls = 0;
  const off = bus.subscribe(() => {
    calls += 1;
  });
  bus.set('a', 1);
  off();
  bus.set('a', 2);
  assert.equal(calls, 1);
});

test('old snapshots stay as they were', () => {
  const bus = createFilterBus();
  bus.set('a', 1);
  const first = bus.state();
  bus.set('b', 2);
  assert.deepEqual(first, { a: 1 });
  assert.notEqual(first, bus.state());
});

test('a subscriber may change the bus again without looping', () => {
  const bus = createFilterBus();
  bus.subscribe((state) => {
    if (state.region && !state.page) bus.set('page', 1);
  });
  bus.set('region', 'North');
  assert.deepEqual(bus.state(), { region: 'North', page: 1 });
});
