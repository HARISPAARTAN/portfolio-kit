import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, createFlowState } from '../dist/flow-state.js';

const steps = () => [
  { id: 'intake', label: 'Intake', detail: 'Read the export' },
  { id: 'validate', label: 'Validate' },
  { id: 'classify', label: 'Classify' },
];

test('the statuses are fixed', () => {
  assert.deepEqual([...STATUSES], ['idle', 'running', 'ok', 'failed', 'skipped']);
  assert.ok(Object.isFrozen(STATUSES));
});

test('edges default to the linear chain', () => {
  const s = createFlowState({ steps: steps() });
  assert.deepEqual(s.edges(), [['intake', 'validate'], ['validate', 'classify']]);
  assert.deepEqual(s.steps(), [
    { id: 'intake', label: 'Intake', detail: 'Read the export' },
    { id: 'validate', label: 'Validate', detail: '' },
    { id: 'classify', label: 'Classify', detail: '' },
  ]);
});

test('custom edges are kept and checked', () => {
  const s = createFlowState({ steps: steps(), edges: [['intake', 'classify'], ['intake', 'validate']] });
  assert.deepEqual(s.edges(), [['intake', 'classify'], ['intake', 'validate']]);
  assert.throws(() => createFlowState({ steps: steps(), edges: [['intake', 'nope']] }), /unknown step/);
});

test('invalid steps are rejected', () => {
  assert.throws(() => createFlowState({ steps: [] }), /non-empty array/);
  assert.throws(() => createFlowState({}), /non-empty array/);
  assert.throws(() => createFlowState({ steps: [{ label: 'No id' }] }), /string id/);
  assert.throws(() => createFlowState({ steps: [{ id: 'a' }, { id: 'a' }] }), /unique/);
});

test('a new state is idle with no current step', () => {
  const s = createFlowState({ steps: steps() });
  assert.equal(s.current(), null);
  assert.deepEqual(s.statuses(), { intake: 'idle', validate: 'idle', classify: 'idle' });
  assert.equal(s.done(), false);
});

test('start marks the first step running', () => {
  const s = createFlowState({ steps: steps() });
  s.start();
  assert.deepEqual(s.current(), { id: 'intake', index: 0, label: 'Intake', detail: 'Read the export', status: 'running' });
  assert.equal(s.statuses().intake, 'running');
});

test('next walks the chain to the end and then returns false', () => {
  const s = createFlowState({ steps: steps() });
  assert.equal(s.next(), true);
  assert.equal(s.current().id, 'intake');
  assert.equal(s.next(), true);
  assert.deepEqual(s.statuses(), { intake: 'ok', validate: 'running', classify: 'idle' });
  assert.equal(s.next(), true);
  assert.equal(s.current().id, 'classify');
  assert.equal(s.done(), false);
  assert.equal(s.next(), false);
  assert.deepEqual(s.statuses(), { intake: 'ok', validate: 'ok', classify: 'ok' });
  assert.equal(s.done(), true);
  assert.equal(s.next(), false);
});

test('show sets status and detail and makes the step current', () => {
  const s = createFlowState({ steps: steps() });
  s.show('validate', { status: 'running', detail: '12 rows checked' });
  assert.deepEqual(s.current(), { id: 'validate', index: 1, label: 'Validate', detail: '12 rows checked', status: 'running' });
  s.show(2);
  assert.equal(s.current().id, 'classify');
  assert.equal(s.statuses().classify, 'ok');
  assert.equal(s.steps()[1].detail, '12 rows checked');
  assert.throws(() => s.show('nope'), /unknown step/);
  assert.throws(() => s.show(7), /unknown step/);
  assert.throws(() => s.show('intake', { status: 'done' }), /unknown status/);
});

test('fail marks a step failed with a detail and makes it current', () => {
  const s = createFlowState({ steps: steps() });
  s.start();
  s.fail('validate', 'Date column missing');
  assert.deepEqual(s.current(), { id: 'validate', index: 1, label: 'Validate', detail: 'Date column missing', status: 'failed' });
});

test('skip marks a step skipped and keeps the current step', () => {
  const s = createFlowState({ steps: steps() });
  s.start();
  s.skip('validate');
  assert.equal(s.statuses().validate, 'skipped');
  assert.equal(s.current().id, 'intake');
  assert.equal(s.next(), true);
  assert.equal(s.current().id, 'classify');
});

test('done is true once every step is ok, failed or skipped', () => {
  const s = createFlowState({ steps: steps() });
  s.show('intake');
  s.fail('validate');
  assert.equal(s.done(), false);
  s.skip('classify');
  assert.equal(s.done(), true);
});

test('reset returns to idle and restores the details', () => {
  const s = createFlowState({ steps: steps() });
  s.show('intake', { detail: 'changed' });
  s.reset();
  assert.equal(s.current(), null);
  assert.deepEqual(s.statuses(), { intake: 'idle', validate: 'idle', classify: 'idle' });
  assert.equal(s.steps()[0].detail, 'Read the export');
});

test('subscribers receive (state, change) after every change and can unsubscribe', () => {
  const s = createFlowState({ steps: steps() });
  const seen = [];
  const off = s.subscribe((state, change) => seen.push(`${change.type}:${change.id}:${state.statuses()[change.id ?? 'intake']}`));
  s.start();
  s.next();
  s.skip('classify');
  s.fail('validate', 'x');
  s.reset();
  off();
  s.start();
  assert.deepEqual(seen, ['start:intake:running', 'next:validate:running', 'skip:classify:skipped', 'fail:validate:failed', 'reset:null:idle']);
});

test('steps() and edges() return copies', () => {
  const s = createFlowState({ steps: steps() });
  s.steps()[0].label = 'Changed';
  s.edges()[0][1] = 'classify';
  assert.equal(s.steps()[0].label, 'Intake');
  assert.deepEqual(s.edges()[0], ['intake', 'validate']);
});

test('next after a jump continues with the next idle step, then wraps to earlier ones', () => {
  const s = createFlowState({ steps: [...steps(), { id: 'report', label: 'Report' }] });
  s.show('classify', { status: 'running' });
  assert.equal(s.next(), true);
  assert.equal(s.current().id, 'report');
  assert.equal(s.next(), true);
  assert.equal(s.current().id, 'intake');
});
