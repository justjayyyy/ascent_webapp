import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOp, updateOp, deleteOp, entryOp, enqueue, applyOutbox, applyListOutbox, withRealIds, opsForWorkspace, opsForEntity, entityOf,
  localIdOf, isTransientError, pendingCount,
} from './outboxModel.js';

const ws = 'ws1';
const coffee = { type: 'Expense', amount: 18, category: 'food', date: '2026-10-01', description: 'Coffee' };

test('a queued add gets an app dedupe key, one per row of a batch', () => {
  const one = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  assert.equal(one.rows[0].dedupeKey, 'app:aaaaaaaa-1');
  const three = createOp({ rows: [coffee, coffee, coffee], uuid: 'bbbbbbbb-2', workspaceId: ws });
  assert.deepEqual(three.rows.map((r) => r.dedupeKey), ['app:bbbbbbbb-2:0', 'app:bbbbbbbb-2:1', 'app:bbbbbbbb-2:2']);
});

test('editing a row that was never sent changes the queued add', () => {
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  const ops = enqueue([add], updateOp({ uuid: 'u1', workspaceId: ws, txId: localIdOf(add.rows[0]), data: { amount: 21 } }));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].rows[0].amount, 21);
  assert.equal(ops[0].rows[0].dedupeKey, 'app:aaaaaaaa-1');
});

test('deleting a row that was never sent drops it without telling the server', () => {
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  const ops = enqueue([add], deleteOp({ uuid: 'd1', workspaceId: ws, txId: localIdOf(add.rows[0]) }));
  assert.deepEqual(ops, []);
});

test('an add already on the wire cannot change; later edits queue behind it', () => {
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  const ops = enqueue([add], updateOp({ uuid: 'u1', workspaceId: ws, txId: localIdOf(add.rows[0]), data: { amount: 21 } }), add.id);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].rows[0].amount, 18);
});

test('repeated edits to a stored row become one, and deleting it cancels them', () => {
  let ops = enqueue([], updateOp({ uuid: 'u1', workspaceId: ws, txId: 'srv1', data: { amount: 5 } }));
  ops = enqueue(ops, updateOp({ uuid: 'u2', workspaceId: ws, txId: 'srv1', data: { category: 'fun' } }));
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].data, { amount: 5, category: 'fun' });
  ops = enqueue(ops, deleteOp({ uuid: 'd1', workspaceId: ws, txId: 'srv1' }));
  assert.deepEqual(ops.map((o) => o.kind), ['delete']);
  assert.equal(enqueue(ops, deleteOp({ uuid: 'd2', workspaceId: ws, txId: 'srv1' })).length, 1);
});

test('queued changes are drawn over the server rows', () => {
  const server = [{ id: 'srv1', amount: 50, category: 'food' }, { id: 'srv2', amount: 9, category: 'fun' }];
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  let ops = enqueue([add], updateOp({ uuid: 'u1', workspaceId: ws, txId: 'srv1', data: { amount: 55 } }));
  ops = enqueue(ops, deleteOp({ uuid: 'd1', workspaceId: ws, txId: 'srv2' }));
  const rows = applyOutbox(server, ops);
  assert.deepEqual(rows.map((r) => [r.id, r.amount, r._sync]), [
    ['local:app:aaaaaaaa-1', 18, 'pending'],
    ['srv1', 55, 'pending'],
  ]);
});

test('an add the server already stored is not shown twice while its op is being cleared', () => {
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  const rows = applyOutbox([{ id: 'srv9', ...add.rows[0] }], [add]);
  assert.deepEqual(rows.map((r) => r.id), ['srv9']);
});

test('edits queued behind a sent add find it by its new id', () => {
  const add = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws });
  const local = localIdOf(add.rows[0]);
  const ops = [updateOp({ uuid: 'u1', workspaceId: ws, txId: local, data: { amount: 30 } })];
  const rows = applyOutbox([{ id: 'srv9', ...add.rows[0] }], ops, { [local]: 'srv9' });
  assert.equal(rows[0].amount, 30);
});

test('a refused add stays visible, marked failed, and no longer counts as waiting', () => {
  const add = { ...createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws }), error: 'Validation error' };
  assert.equal(applyOutbox([], [add])[0]._sync, 'failed');
  assert.equal(pendingCount([add]), 0);
});

test('only lost connections and server trouble are worth retrying', () => {
  assert.equal(isTransientError({ isNetworkError: true, status: 0 }), true);
  assert.equal(isTransientError({ status: 503 }), true);
  assert.equal(isTransientError({ status: 429 }), true);
  assert.equal(isTransientError({ status: 400 }), false);
  assert.equal(isTransientError({ status: 403 }), false);
});

test('each workspace only sees the changes queued in it (older ops without a workspace show everywhere)', () => {
  const here = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: 'ws1' });
  const there = createOp({ rows: [coffee], uuid: 'bbbbbbbb-2', workspaceId: 'ws2' });
  const legacy = { ...createOp({ rows: [coffee], uuid: 'cccccccc-3' }), workspaceId: undefined };
  assert.deepEqual(opsForWorkspace([here, there, legacy], 'ws1').map((o) => o.id), [here.id, legacy.id]);
  assert.equal(applyOutbox([], opsForWorkspace([here, there], 'ws2')).length, 1);
});

test('views: the default window, the earliest day, and which rows belong', async () => {
  const { windowStart, earliestDay, inView, mergeRows, HISTORY_MONTHS } = await import('./outboxModel.js');
  assert.equal(HISTORY_MONTHS, 14);
  assert.equal(windowStart(new Date(2026, 9, 15)), '2025-08-01');
  assert.equal(windowStart(new Date(2026, 0, 31), 1), '2025-12-01');
  assert.equal(earliestDay('2026-01-01', undefined, '2024-05-01'), '2024-05-01');
  assert.equal(inView({ date: '2026-01-05' }, { from: '2026-01-01' }), true);
  assert.equal(inView({ date: '2025-12-31' }, { from: '2026-01-01' }), false);
  assert.equal(inView({ planId: 'p1' }, { has: 'planId' }), true);
  assert.equal(inView({ planId: null }, { has: 'planId' }), false);
  assert.deepEqual(mergeRows([{ id: 1, v: 'a' }], [{ id: 1, v: 'b' }, { id: 2 }]).map((r) => r.v ?? r.id), ['a', 2]);
});

test('a queued add only shows in the views it belongs to', () => {
  const add = createOp({ rows: [{ ...coffee, date: '2026-10-01' }], uuid: 'aaaaaaaa-1', workspaceId: ws });
  assert.equal(applyOutbox([], [add], {}, (r) => r.date >= '2026-01-01').length, 1);
  assert.equal(applyOutbox([], [add], {}, (r) => !!r.planId).length, 0);
});

// ---- the household lists (budgets, plans, loans, settle-ups) ----

const trip = { name: 'Trip', items: [{ id: 'i1', name: 'Flights', amount: 900 }] };

test('a list change says which list it is for; old queued changes are transactions', () => {
  const add = createOp({ rows: [trip], uuid: 'pppppppp-1', workspaceId: ws, entity: 'plans' });
  assert.equal(add.entity, 'plans');
  assert.equal(entityOf(add), 'plans');
  assert.equal(createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: ws }).entity, undefined);
  assert.equal(entityOf({ kind: 'update', txId: 'x' }), 'transactions');
  assert.deepEqual(opsForEntity([add, updateOp({ uuid: 'u', workspaceId: ws, txId: 't' })], 'plans'), [add]);
});

test('an entry added to a plan that was never sent goes out inside it', () => {
  const add = createOp({ rows: [trip], uuid: 'pppppppp-1', workspaceId: ws, entity: 'plans' });
  const id = localIdOf(add.rows[0]);
  const ops = enqueue([add], entryOp({ uuid: 'e1', workspaceId: ws, txId: id, list: 'items', change: { op: 'put', item: { id: 'i2', name: 'Hotel' } }, entity: 'plans' }));
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].rows[0].items.map((i) => i.id), ['i1', 'i2']);
});

test('entries to a stored plan stay separate and in order; deleting the plan drops them', () => {
  const e = (n, change) => entryOp({ uuid: `e${n}`, workspaceId: ws, txId: 'p1', list: 'items', change, entity: 'plans' });
  let ops = enqueue([], e(1, { op: 'patch', id: 'i1', changes: { status: 'booked' } }));
  ops = enqueue(ops, e(2, { op: 'patch', id: 'i1', changes: { status: 'planned' } }));
  assert.equal(ops.length, 2);
  ops = enqueue(ops, deleteOp({ uuid: 'd1', workspaceId: ws, txId: 'p1', entity: 'plans' }));
  assert.deepEqual(ops.map((o) => o.kind), ['delete']);
});

test('a plan list is drawn with its waiting changes in the order they were made', () => {
  const server = [{ id: 'p1', name: 'Wedding', items: [{ id: 'a', status: 'planned' }] }, { id: 'p2', name: 'Old' }];
  const add = createOp({ rows: [trip], uuid: 'pppppppp-1', workspaceId: ws, entity: 'plans' });
  const ops = [
    entryOp({ uuid: 'e1', workspaceId: ws, txId: 'p1', list: 'items', change: { op: 'patch', id: 'a', changes: { status: 'booked' } }, entity: 'plans' }),
    updateOp({ uuid: 'u1', workspaceId: ws, txId: 'p1', data: { name: 'Our wedding' }, entity: 'plans' }),
    deleteOp({ uuid: 'd1', workspaceId: ws, txId: 'p2', entity: 'plans' }),
    add,
  ];
  const rows = applyListOutbox(server, ops);
  assert.deepEqual(rows.map((r) => [r.id, r.name, r._sync]), [['p1', 'Our wedding', 'pending'], [localIdOf(add.rows[0]), 'Trip', 'pending']]);
  assert.equal(rows[0].items[0].status, 'booked');
  // Once the server has the new plan (same dedupeKey), it is not drawn twice
  const stored = [...server, { ...add.rows[0], id: 'p9' }];
  assert.equal(applyListOutbox(stored, [add]).filter((r) => r.name === 'Trip').length, 1);
});

test('local ids of rows the server has since stored are swapped for their real ids', () => {
  const map = { 'local:app:x': 'real-1' };
  assert.deepEqual(withRealIds({ planId: 'local:app:x', other: 'local:app:y', n: 2, list: ['local:app:x'] }, map),
    { planId: 'real-1', other: 'local:app:y', n: 2, list: ['real-1'] });
});
