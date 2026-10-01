// The offline queue engine: storing, sending in order, folding, failures and recovery.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOp, updateOp, deleteOp, localIdOf } from './outboxModel';

const idb = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({
  get: async (k) => structuredClone(idb.get(k)),
  set: async (k, v) => { idb.set(k, structuredClone(v)); },
  del: async (k) => { idb.delete(k); },
  keys: async () => [...idb.keys()],
}));

const api = vi.hoisted(() => ({ create: vi.fn(), bulkCreate: vi.fn(), update: vi.fn(), remove: vi.fn(), planGet: vi.fn(), planUpdate: vi.fn() }));
vi.mock('@/api/client', () => ({
  ascent: {
    entities: {
      ExpenseTransaction: { create: api.create, bulkCreate: api.bulkCreate, update: api.update, delete: api.remove, list: vi.fn() },
      Plan: { get: api.planGet, update: api.planUpdate },
    },
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: null }), useWorkspaceId: () => null }));

const { getOutbox, clearOutboxes } = await import('./txOutbox');
const { queryClientInstance } = await import('@/lib/query-client');

let user = 0;
const freshBox = () => getOutbox(`user-${(user += 1)}`);
const coffee = { type: 'Expense', amount: 18, category: 'food', date: '2026-10-01', description: 'Coffee' };
const setOnline = (on) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on });
const refused = (status, error = 'nope') => Object.assign(new Error(error), { status, data: { error } });

beforeEach(() => {
  idb.clear();
  queryClientInstance.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.create.mockImplementation(async (row) => ({ ...row, id: 'srv-1' }));
  setOnline(true);
});
afterEach(() => setOnline(true));

describe('with a connection', () => {
  test('an add is sent at once, for its own workspace, and drawn into that workspace\'s list', async () => {
    const box = freshBox();
    queryClientInstance.setQueryData(['transactions', 'ws1'], [{ id: 'old' }]);
    const op = createOp({ rows: [coffee], uuid: 'aaaaaaaa-1', workspaceId: 'ws1' });
    await expect(box.submit(op)).resolves.toBe('synced');
    const [row, opts] = api.create.mock.calls[0];
    expect(row.dedupeKey).toBe('app:aaaaaaaa-1');
    expect(opts.headers['x-workspace-id']).toBe('ws1');
    expect(opts.retries).toBe(0);
    expect(queryClientInstance.getQueryData(['transactions', 'ws1']).map((r) => r.id)).toEqual(['srv-1', 'old']);
    expect(box.getSnapshot().ops).toEqual([]);
    expect([...idb.keys()]).toEqual([]); // nothing left waiting on the device
  });

  test('a batch of installments goes as one request', async () => {
    const box = freshBox();
    api.bulkCreate.mockImplementation(async (rows) => rows.map((r, i) => ({ ...r, id: `srv-${i}` })));
    await box.submit(createOp({ rows: [coffee, coffee, coffee], uuid: 'bbbbbbbb-2', workspaceId: 'ws1' }));
    expect(api.bulkCreate).toHaveBeenCalledTimes(1);
    expect(api.bulkCreate.mock.calls[0][0]).toHaveLength(3);
  });

  test('paying a plan item marks it paid, in the same workspace', async () => {
    const box = freshBox();
    api.planGet.mockResolvedValue({ id: 'p1', items: [{ id: 'i1', status: 'planned' }] });
    await box.submit(createOp({ rows: [coffee], uuid: 'cccccccc-3', workspaceId: 'ws1', plan: { planId: 'p1', itemId: 'i1' } }));
    expect(api.planGet.mock.calls[0][1].headers['x-workspace-id']).toBe('ws1');
    expect(api.planUpdate.mock.calls[0][1].items[0]).toMatchObject({ status: 'paid', transactionId: 'srv-1' });
  });

  test('deleting a row someone else already deleted counts as done', async () => {
    const box = freshBox();
    api.remove.mockRejectedValue(refused(404));
    await expect(box.submit(deleteOp({ uuid: 'd1', workspaceId: 'ws1', txId: 'srv-9' }))).resolves.toBe('synced');
    expect(box.getSnapshot().ops).toEqual([]);
  });
});

describe('without a connection', () => {
  test('changes wait on the device and go out, in order, when the connection is back', async () => {
    const box = freshBox();
    setOnline(false);
    const add = createOp({ rows: [coffee], uuid: 'dddddddd-4', workspaceId: 'ws1' });
    await expect(box.submit(add, { waitMs: 50 })).resolves.toBe('queued');
    await box.submit(updateOp({ uuid: 'u1', workspaceId: 'ws1', txId: localIdOf(add.rows[0]), data: { amount: 25 } }), { waitMs: 50 });
    expect(api.create).not.toHaveBeenCalled();
    expect(box.getSnapshot().ops).toHaveLength(1); // the edit folded into the waiting add
    expect([...idb.values()][0].ops).toHaveLength(1); // and it survives the app closing

    setOnline(true);
    await box.flush();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.mock.calls[0][0].amount).toBe(25);
    expect(box.getSnapshot().ops).toEqual([]);
  });

  test('server trouble keeps the change waiting rather than failing it', async () => {
    const box = freshBox();
    api.create.mockRejectedValue(refused(503));
    await expect(box.submit(createOp({ rows: [coffee], uuid: 'eeeeeeee-5', workspaceId: 'ws1' }), { waitMs: 50 })).resolves.toBe('queued');
    expect(box.getSnapshot().ops[0].error).toBeUndefined();
    clearTimeout(box.retryTimer);
  });

  test('a queue left on the device by an earlier session is sent when the app opens again', async () => {
    const op = createOp({ rows: [coffee], uuid: 'ffffffff-6', workspaceId: 'ws1' });
    const userId = `user-${(user += 1)}`;
    idb.set(`ascent:tx:outbox:${userId}`, { ops: [op], idMap: {} });
    const box = getOutbox(userId);
    await box.ready;
    await box.flush();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(box.getSnapshot().ops).toEqual([]);
  });
});

describe('when the server refuses', () => {
  test('the change is kept, marked failed, and the caller hears about it', async () => {
    const box = freshBox();
    api.create.mockRejectedValue(refused(400, 'Validation error: amount'));
    const op = createOp({ rows: [coffee], uuid: 'gggggggg-7', workspaceId: 'ws1' });
    await expect(box.submit(op)).rejects.toMatchObject({ status: 400 });
    expect(box.getSnapshot().ops[0].error).toBe('Validation error: amount');
  });

  test('a failed change can be retried or discarded', async () => {
    const box = freshBox();
    api.create.mockRejectedValueOnce(refused(400));
    const op = createOp({ rows: [coffee], uuid: 'hhhhhhhh-8', workspaceId: 'ws1' });
    await box.submit(op).catch(() => {});
    await box.retry(op.id);
    expect(box.getSnapshot().ops).toEqual([]);

    api.create.mockRejectedValueOnce(refused(400));
    const other = createOp({ rows: [coffee], uuid: 'iiiiiiii-9', workspaceId: 'ws1' });
    await box.submit(other).catch(() => {});
    await box.discard(other.id);
    expect(box.getSnapshot().ops).toEqual([]);
  });

  test('a failed add does not block the changes queued behind it', async () => {
    const box = freshBox();
    api.create.mockRejectedValueOnce(refused(400)).mockResolvedValueOnce({ ...coffee, id: 'srv-2' });
    const bad = createOp({ rows: [coffee], uuid: 'jjjjjjjj-10', workspaceId: 'ws1' });
    const good = createOp({ rows: [coffee], uuid: 'kkkkkkkk-11', workspaceId: 'ws1' });
    setOnline(false);
    await box.submit(bad, { waitMs: 10 });
    await box.submit(good, { waitMs: 10 });
    setOnline(true);
    await box.flush();
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(box.getSnapshot().ops.map((o) => o.id)).toEqual([bad.id]);
  });
});

test('signing out forgets every queue on the device', async () => {
  idb.set('ascent:tx:outbox:someone', { ops: [] });
  idb.set('ascent:rq-cache', {});
  await clearOutboxes();
  expect([...idb.keys()]).toEqual(['ascent:rq-cache']);
});

test('a synced add lands in every loaded view it belongs to, and only those', async () => {
  const box = freshBox();
  queryClientInstance.setQueryData(['transactions', 'ws1', { from: '2026-01-01' }], []);
  queryClientInstance.setQueryData(['transactions', 'ws1', { from: '2026-11-01' }], []);
  queryClientInstance.setQueryData(['transactions', 'ws1', { has: 'planId' }], []);
  queryClientInstance.setQueryData(['transactions', 'ws2', { from: '2026-01-01' }], []);
  await box.submit(createOp({ rows: [coffee], uuid: 'llllllll-12', workspaceId: 'ws1' }));
  const ids = (view, w = 'ws1') => (queryClientInstance.getQueryData(['transactions', w, view]) || []).map((r) => r.id);
  expect(ids({ from: '2026-01-01' })).toEqual(['srv-1']);
  expect(ids({ from: '2026-11-01' })).toEqual([]); // dated before that window
  expect(ids({ has: 'planId' })).toEqual([]); // not for a plan
  expect(ids({ from: '2026-01-01' }, 'ws2')).toEqual([]); // another workspace
});
