// The notes outbox: ordering, coalescing, retries, and the checklist base sent for merging.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const idb = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({
  get: async (k) => idb.get(k),
  set: async (k, v) => { idb.set(k, v); },
  del: async (k) => { idb.delete(k); },
  keys: async () => [...idb.keys()],
}));
const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), emptyTrash: vi.fn() }));
vi.mock('@/api/client', () => ({ ascent: { entities: { Note: api } } }));

const { getNotesSync, clearNotesStorage } = await import('./notesSync');

const KEY = ['notes', 's'];
const item = (id, done = false) => ({ id, text: id, done });
const refused = (status) => Object.assign(new Error('refused'), { status });
let sync;
let scope = 0;

beforeEach(async () => {
  await clearNotesStorage();
  idb.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.update.mockImplementation(async (id, data) => ({ id, ...data }));
  api.create.mockImplementation(async (data) => data);
  scope += 1;
  sync = getNotesSync(`s${scope}`, new QueryClient(), KEY);
  await sync.loaded;
});

describe('checklist edits carry the list they started from', () => {
  test('an edit to a fetched note sends the server\'s list as its base', async () => {
    sync.remember([{ id: 'n1', items: [item('a'), item('b')] }]);
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a', true), item('b')] } });
    await sync.flush();
    expect(api.update).toHaveBeenCalledWith('n1', { items: [item('a', true), item('b')], itemsBase: [item('a'), item('b')] });
  });

  test('a burst of edits is one request that keeps the first base', async () => {
    sync.remember([{ id: 'n1', items: [item('a')] }]);
    // hold the first request so the next edits coalesce behind it
    let release;
    api.update.mockImplementationOnce((id, data) => new Promise((r) => { release = () => r({ id, ...data }); }));
    sync.enqueue({ type: 'patch', id: 'n1', data: { title: 'Shop' } });
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a', true)] } });
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a', true), item('b')] } });
    release();
    await sync.flush();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update.mock.calls[1][1]).toEqual({ items: [item('a', true), item('b')], itemsBase: [item('a')] });
  });

  test('an edit queued behind one on the wire is based on what that one sends', async () => {
    sync.remember([{ id: 'n1', items: [item('a')] }]);
    let release;
    api.update.mockImplementationOnce((id, data) => new Promise((r) => { release = () => r({ id, ...data }); }));
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a', true)] } });
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a', true), item('b')] } });
    release();
    await sync.flush();
    expect(api.update.mock.calls[1][1].itemsBase).toEqual([item('a', true)]);
  });

  test('without the server\'s copy (offline since opening) the list is replaced, as before', async () => {
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a')] } });
    sync.enqueue({ type: 'patch', id: 'n1', data: { items: [item('a'), item('b')] } });
    await sync.flush();
    expect(api.update).toHaveBeenCalledWith('n1', { items: [item('a'), item('b')] });
  });

  test('edits that do not touch the list carry no base', async () => {
    sync.remember([{ id: 'n1', items: [item('a')] }]);
    sync.enqueue({ type: 'patch', id: 'n1', data: { title: 'x' } });
    await sync.flush();
    expect(api.update).toHaveBeenCalledWith('n1', { title: 'x' });
  });
});

describe('the outbox', () => {
  test('edits to a note not yet created fold into its creation; deleting it before sending sends nothing', async () => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    sync.enqueue({ type: 'create', id: 'n2', data: { title: '' } });
    sync.enqueue({ type: 'patch', id: 'n2', data: { title: 'Hi', items: [item('a')] } });
    expect(sync.pending()).toBe(1);
    sync.enqueue({ type: 'delete', id: 'n2' });
    offline.mockRestore();
    await sync.flush();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('a network failure or a conflict keeps the edit queued (and stored) for later', async () => {
    for (const err of [Object.assign(new Error('offline'), { isNetworkError: true }), refused(409), refused(503)]) {
      api.update.mockRejectedValueOnce(err);
      sync.enqueue({ type: 'patch', id: 'n1', data: { title: 'x' } });
      await sync.flush();
      expect(sync.pending()).toBe(1);
      expect(idb.get(`ascent:notes:outbox:s${scope}`)).toHaveLength(1);
      await sync.flush();
      expect(sync.pending()).toBe(0);
    }
  });

  test('a refusal for good drops the edit and says so', async () => {
    const rejected = vi.fn();
    sync.onRejected(rejected);
    api.update.mockRejectedValueOnce(refused(404));
    sync.enqueue({ type: 'patch', id: 'n1', data: { title: 'x' } });
    sync.enqueue({ type: 'patch', id: 'n3', data: { title: 'y' } });
    await sync.flush();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenLastCalledWith('n3', { title: 'y' });
    expect(sync.pending()).toBe(0);
  });
});
