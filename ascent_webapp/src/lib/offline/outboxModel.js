// The offline queue, as plain data: what a queued change looks like, how a new change folds into the ones
// already waiting, and how the waiting changes are drawn on top of the server's rows. No browser APIs
// here, so it runs under `node --test`. The engine that stores and sends it is txOutbox.js.
//
// One queue holds every kind of row, in the order the changes were made: transactions, and the
// household's lists (budgets, plans, loans, settle-ups). `entity` says which; queues saved before it
// existed hold transactions only. `txId` is the id of the row a change is for, whatever its kind.
//
// op = { id, kind: 'create', entity?, workspaceId, rows: [...], plan?: { planId, itemId } }
//    | { id, kind: 'update', entity?, workspaceId, txId, data }
//    | { id, kind: 'entry',  entity, workspaceId, txId, list, change }   (one plan item or loan payment)
//    | { id, kind: 'delete', entity?, workspaceId, txId, plan? }
// plus createdAt and, once the server refused it for good, error.
import { applyEntryChange } from '../listEntries.js';

export const TRANSACTIONS = 'transactions';
/** The household lists that save through the queue, by the name of their API path and cache key. */
export const LIST_ENTITIES = ['budgets', 'plans', 'commitments', 'settlements'];
export const entityOf = (op) => op.entity || TRANSACTIONS;
/** The waiting changes to one kind of row. */
export const opsForEntity = (ops, entity) => ops.filter((o) => entityOf(o) === entity);

export const LOCAL_PREFIX = 'local:';
export const isLocalId = (id) => typeof id === 'string' && id.startsWith(LOCAL_PREFIX);

/** The id a queued row carries in the app until the server gives it a real one. */
export const localIdOf = (row) => `${LOCAL_PREFIX}${row.dedupeKey}`;

/**
 * A queued add. Every row gets an "app:" dedupeKey, so if the upload reached the server but the answer
 * was lost, sending it again returns the stored row instead of adding a second one.
 */
export function createOp({ rows, uuid, workspaceId, plan = null, entity, now = Date.now() }) {
  const key = `app:${uuid}`;
  return {
    id: key,
    kind: 'create',
    ...(entity && entity !== TRANSACTIONS ? { entity } : {}),
    workspaceId,
    rows: rows.map((r, i) => ({ ...r, dedupeKey: rows.length > 1 ? `${key}:${i}` : key })),
    plan,
    createdAt: now,
  };
}

const tagged = (entity) => (entity && entity !== TRANSACTIONS ? { entity } : {});

export const updateOp = ({ uuid, workspaceId, txId, data, entity, now = Date.now() }) =>
  ({ id: `upd:${uuid}`, kind: 'update', ...tagged(entity), workspaceId, txId, data, createdAt: now });

/** One entry of a row's list field: `change` as in listEntries.js ({ op: 'put' | 'patch' | 'remove', ... }). */
export const entryOp = ({ uuid, workspaceId, txId, list, change, entity, now = Date.now() }) =>
  ({ id: `ent:${uuid}`, kind: 'entry', ...tagged(entity), workspaceId, txId, list, change, createdAt: now });

export const deleteOp = ({ uuid, workspaceId, txId, plan = null, entity, now = Date.now() }) =>
  ({ id: `del:${uuid}`, kind: 'delete', ...tagged(entity), workspaceId, txId, plan, createdAt: now });

const ownsRow = (op, localId) => op.kind === 'create' && op.rows.some((r) => localIdOf(r) === localId);

/**
 * Add `op` to the queue, folding it into earlier changes where that is exact: an edit to a row that has
 * not been sent yet is merged into it, deleting it drops it, and repeated edits to one row become one.
 * `busyId` is the op currently on the wire, which can no longer change.
 */
export function enqueue(ops, op, busyId = null) {
  const open = (o) => o.id !== busyId && !o.error;

  if (op.kind === 'update') {
    const host = ops.find((o) => open(o) && ownsRow(o, op.txId));
    if (host) {
      return ops.map((o) => (o !== host ? o : {
        ...o,
        rows: o.rows.map((r) => (localIdOf(r) === op.txId ? { ...r, ...op.data, dedupeKey: r.dedupeKey } : r)),
      }));
    }
    const prior = ops.find((o) => open(o) && o.kind === 'update' && o.txId === op.txId);
    if (prior) return ops.map((o) => (o === prior ? { ...o, data: { ...o.data, ...op.data } } : o));
    return [...ops, op];
  }

  if (op.kind === 'entry') {
    // A row that has not been sent yet simply goes out with the entry in it
    const host = ops.find((o) => open(o) && ownsRow(o, op.txId));
    if (host) {
      return ops.map((o) => (o !== host ? o : {
        ...o,
        rows: o.rows.map((r) => (localIdOf(r) === op.txId ? { ...r, [op.list]: applyEntryChange(r[op.list] || [], op.change) } : r)),
      }));
    }
    // Entries are never folded together: each one is a separate change other people may also be making
    return [...ops, op];
  }

  if (op.kind === 'delete') {
    const host = ops.find((o) => open(o) && ownsRow(o, op.txId));
    const rest = ops.filter((o) => !(open(o) && (o.kind === 'update' || o.kind === 'entry') && o.txId === op.txId));
    if (host) {
      // Never sent, so the server never needs to hear about it
      return rest
        .map((o) => (o !== host ? o : { ...o, rows: o.rows.filter((r) => localIdOf(r) !== op.txId) }))
        .filter((o) => o.kind !== 'create' || o.rows.length > 0);
    }
    if (rest.some((o) => o.kind === 'delete' && o.txId === op.txId)) return rest;
    return [...rest, op];
  }

  return [...ops, op];
}

/**
 * The server's rows with the queued changes drawn on top. Queued adds come first and carry
 * `_sync: 'pending' | 'failed'`; edited rows carry `_sync: 'pending'`. `idMap` turns the local id of an
 * add that has already reached the server into its real id, for edits queued behind it.
 */
export function applyOutbox(serverRows = [], ops = [], idMap = {}, include = () => true) {
  if (!ops.length) return serverRows;
  const resolve = (id) => idMap[id] || id;
  const deleted = new Set();
  const edits = new Map();
  for (const op of ops) {
    if (op.kind === 'delete') deleted.add(resolve(op.txId));
    if (op.kind === 'update') edits.set(resolve(op.txId), { ...(edits.get(resolve(op.txId)) || {}), ...op.data });
  }
  const storedKeys = new Set(serverRows.map((r) => r.dedupeKey).filter(Boolean));

  const queued = [];
  for (const op of ops) {
    if (op.kind !== 'create') continue;
    for (const row of op.rows) {
      const id = localIdOf(row);
      if (storedKeys.has(row.dedupeKey) || deleted.has(id)) continue;
      const drawn = { ...row, ...(edits.get(id) || {}), id, _sync: op.error ? 'failed' : 'pending' };
      if (include(drawn)) queued.push(drawn);
    }
  }

  const stored = serverRows
    .filter((r) => !deleted.has(r.id))
    .map((r) => (edits.has(r.id) ? { ...r, ...edits.get(r.id), _sync: 'pending' } : r));

  return [...queued, ...stored];
}

/**
 * A household list (budgets, plans...) with its waiting changes drawn on top, in the order they were
 * made: `ops` are that list's own. New rows go at the end with `_sync`; changed rows carry `_sync` too.
 */
export function applyListOutbox(serverRows = [], ops = [], idMap = {}) {
  if (!ops.length) return serverRows;
  const resolve = (id) => idMap[id] || id;
  const storedKeys = new Set(serverRows.map((r) => r.dedupeKey).filter(Boolean));
  let rows = [...serverRows];
  const mark = (row, op) => ({ ...row, _sync: op.error ? 'failed' : 'pending' });
  for (const op of ops) {
    if (op.kind === 'create') {
      for (const row of op.rows) {
        if (!storedKeys.has(row.dedupeKey)) rows.push(mark({ ...row, id: localIdOf(row) }, op));
      }
      continue;
    }
    const id = resolve(op.txId);
    if (op.kind === 'delete') rows = rows.filter((r) => r.id !== id);
    else if (op.kind === 'update') rows = rows.map((r) => (r.id === id ? mark({ ...r, ...op.data }, op) : r));
    else if (op.kind === 'entry') rows = rows.map((r) => (r.id === id ? mark({ ...r, [op.list]: applyEntryChange(r[op.list] || [], op.change) }, op) : r));
  }
  return rows;
}

/** Every string in `value` that is the local id of a row the server has since stored, swapped for its real id. */
export function withRealIds(value, idMap = {}) {
  if (typeof value === 'string') return isLocalId(value) && idMap[value] ? idMap[value] : value;
  if (Array.isArray(value)) return value.map((v) => withRealIds(v, idMap));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withRealIds(v, idMap)]));
  return value;
}

// ---- views: which transactions a screen loads ----
// A view is { from: 'YYYY-MM-DD' } (everything dated from then on, future months included) or
// { has: 'planId' } (every row where that field is set, whatever its date).

/** How far back the app loads history by default: enough for trends, forecasts and recaps. */
export const HISTORY_MONTHS = 14;

/** The first day of the month `months` before the month of `now`, as YYYY-MM-DD. */
export function windowStart(now = new Date(), months = HISTORY_MONTHS) {
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** The earliest of some YYYY-MM-DD days (missing ones ignored). */
export const earliestDay = (...days) => days.filter(Boolean).sort()[0];

/** Several views' rows as one list, each row once (the first list wins). */
export function mergeRows(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const row of list || []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/** Whether a row belongs in a view. */
export function inView(row, view = {}) {
  if (view.from && String(row?.date || '') < view.from) return false;
  if (view.has && !row?.[view.has]) return false;
  return true;
}

/** The waiting changes made in one workspace (ops queued before workspaces were recorded count everywhere). */
export const opsForWorkspace = (ops, workspaceId) => ops.filter((o) => !o.workspaceId || !workspaceId || o.workspaceId === workspaceId);

/** How many changes are still waiting (a batch of installments counts once). */
export const pendingCount = (ops) => ops.filter((o) => !o.error).length;
export const failedCount = (ops) => ops.filter((o) => o.error).length;

/**
 * Whether an error means "try again later" (no connection, timeout, server trouble, rate limit,
 * signed out) rather than "the server will never accept this".
 */
export const isTransientError = (e) =>
  !e || e.isNetworkError || !e.status || e.status === 0 || e.status === 408 || e.status === 401 ||
  e.status === 429 || e.status >= 500;
