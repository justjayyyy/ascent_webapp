import { get, set, del, keys } from '@/lib/offline/deviceStore';
import { ascent } from '@/api/client';

// Offline-first sync for notes.
//
// Every change is applied to the local cache immediately (the UI never waits for the
// network) and queued as an operation in an outbox that lives in IndexedDB. Operations
// are sent in order whenever the device is online, so edits made on a plane or in a lift
// survive a reload and reach the server later. Edits to the same note are coalesced, so a
// burst of typing is one request. Note ids are created on the client, which makes a
// retried create idempotent on the server. A checklist edit also carries the list it started from
// (itemsBase), so the server merges it with what others changed meanwhile instead of overwriting.

const safe = async (fn, fallback) => {
  try { return await fn(); } catch { return fallback; }
};

const isTransient = (e) =>
  e?.isNetworkError || e?.status === 0 || e?.status === 408 || e?.status === 401 || e?.status === 409 ||
  e?.status === 429 || (e?.status >= 500) || !e?.status;

class NotesSync {
  constructor(scope, queryClient, queryKey) {
    this.scope = scope;
    this.queryClient = queryClient;
    this.queryKey = queryKey;
    this.ops = [];
    this.flushing = null;
    this.inflight = null;
    this.rev = 0; // bumps on every local change, so a stale fetch can be told apart
    this.listeners = new Set();
    this.rejected = new Set();
    this.serverItems = new Map(); // note id -> checklist as the server last sent it
    this.outboxKey = `ascent:notes:outbox:${scope}`;
    this.cacheKey = `ascent:notes:cache:${scope}`;
    this.loaded = safe(() => get(this.outboxKey), []).then((ops) => {
      // Ops queued before this loaded (a fast first edit) stay after the stored ones
      this.ops = [...(Array.isArray(ops) ? ops : []), ...this.ops];
      this.notify();
    });
  }

  pending() { return this.ops.length; }

  pendingFor(id) { return this.ops.some(op => op.id === id); }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() { this.listeners.forEach(fn => fn()); }

  persistOutbox() {
    return safe(() => (this.ops.length ? set(this.outboxKey, this.ops) : del(this.outboxKey)));
  }

  /** Called when the server refuses an operation for good (deleted note, lost access). */
  onRejected(fn) {
    this.rejectedHandler = fn;
  }

  /** Notes as the server sent them: the checklists later edits are based on. */
  remember(notes) {
    for (const n of notes || []) if (n?.id && Array.isArray(n.items)) this.serverItems.set(n.id, n.items);
  }

  /** The checklist an edit to note `id` starts from: the last one queued for it, else the server's. */
  itemsBase(id) {
    const queued = [...this.ops].reverse().find(o => o.id === id && Array.isArray(o.data?.items));
    return queued ? queued.data.items : this.serverItems.get(id);
  }

  enqueue(op) {
    this.rev += 1;
    // The op currently on the wire can no longer be changed, so newer edits queue behind it
    const open = this.ops.filter(o => o !== this.inflight);
    if (op.type === 'patch') {
      const create = open.find(o => o.type === 'create' && o.id === op.id);
      const patch = open.find(o => o.type === 'patch' && o.id === op.id);
      if (create) create.data = { ...create.data, ...op.data };
      else if (patch) {
        // A queued edit keeps the base it started from; one that already replaces the list without a base
        // (the server's copy was unknown) goes on replacing it, or its first change would be lost
        const hadItems = Array.isArray(patch.data.items);
        const base = hadItems ? patch.data.itemsBase : (Array.isArray(op.data.items) ? this.itemsBase(op.id) : undefined);
        patch.data = { ...patch.data, ...op.data, ...(base ? { itemsBase: base } : {}) };
      } else {
        const base = Array.isArray(op.data?.items) ? this.itemsBase(op.id) : undefined;
        this.ops.push(base ? { ...op, data: { ...op.data, itemsBase: base } } : op);
      }
    } else if (op.type === 'delete') {
      const neverSent = open.some(o => o.type === 'create' && o.id === op.id) &&
        !(this.inflight && this.inflight.id === op.id);
      this.ops = this.ops.filter(o => o === this.inflight || o.id !== op.id);
      if (!neverSent) this.ops.push(op);
    } else if (op.type === 'empty-trash') {
      if (!open.some(o => o.type === 'empty-trash')) this.ops.push(op);
    } else {
      this.ops.push(op);
    }
    this.persistOutbox();
    this.notify();
    this.flush();
  }

  async run(op) {
    const { Note } = ascent.entities;
    switch (op.type) {
      case 'create': return Note.create({ ...op.data, id: op.id });
      case 'patch': return Note.update(op.id, op.data);
      case 'delete': return Note.delete(op.id);
      case 'empty-trash': return Note.emptyTrash();
      default: return null;
    }
  }

  applyServerNote(saved) {
    if (saved?.id && Array.isArray(saved.items)) this.serverItems.set(saved.id, saved.items);
    if (!saved?.id || this.pendingFor(saved.id)) return; // a newer local edit is still on its way
    this.queryClient.setQueryData(this.queryKey, (list = []) => {
      const exists = list.some(n => n.id === saved.id);
      return exists ? list.map(n => (n.id === saved.id ? saved : n)) : [saved, ...list];
    });
  }

  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await this.loaded;
      while (this.ops.length) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        const op = this.ops[0];
        let result;
        this.inflight = op;
        try {
          result = await this.run(op);
        } catch (e) {
          this.inflight = null;
          if (isTransient(e)) break; // try again later; the op stays queued
          this.ops = this.ops.filter(o => o !== op);
          this.persistOutbox();
          this.rejected.add(op.id);
          this.rejectedHandler?.(op, e);
          this.notify();
          continue;
        }
        this.inflight = null;
        this.ops = this.ops.filter(o => o !== op);
        this.persistOutbox();
        if (op.type === 'create' || op.type === 'patch') this.applyServerNote(result);
        this.notify();
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  // ---- local cache mirror (so the list opens instantly and works offline) ----

  async readCache() {
    await this.loaded;
    return safe(() => get(this.cacheKey), null);
  }

  writeCache(notes) {
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => { safe(() => set(this.cacheKey, notes)); }, 400);
  }
}

const engines = new Map();

export function getNotesSync(scope, queryClient, queryKey) {
  let engine = engines.get(scope);
  if (!engine) {
    engine = new NotesSync(scope, queryClient, queryKey);
    engines.set(scope, engine);
  }
  return engine;
}

/** Forget this device's copy of the notes, e.g. on sign-out. */
export async function clearNotesStorage() {
  const all = await safe(() => keys(), []);
  await Promise.all(all
    .filter(k => typeof k === 'string' && k.startsWith('ascent:notes:'))
    .map(k => safe(() => del(k))));
  engines.clear();
}
