// The offline queue for transactions, as plain data: what a queued change looks like, how a new change
// folds into the ones already waiting, and how the waiting changes are drawn on top of the server's rows.
// No browser APIs here, so it runs under `node --test`. The engine that stores and sends it is txOutbox.js.
//
// op = { id, kind: 'create', workspaceId, rows: [...], plan?: { planId, itemId } }
//    | { id, kind: 'update', workspaceId, txId, data }
//    | { id, kind: 'delete', workspaceId, txId, plan? }
// plus createdAt and, once the server refused it for good, error.

export const LOCAL_PREFIX = 'local:';
export const isLocalId = (id) => typeof id === 'string' && id.startsWith(LOCAL_PREFIX);

/** The id a queued row carries in the app until the server gives it a real one. */
export const localIdOf = (row) => `${LOCAL_PREFIX}${row.dedupeKey}`;

/**
 * A queued add. Every row gets an "app:" dedupeKey, so if the upload reached the server but the answer
 * was lost, sending it again returns the stored row instead of adding a second one.
 */
export function createOp({ rows, uuid, workspaceId, plan = null, now = Date.now() }) {
  const key = `app:${uuid}`;
  return {
    id: key,
    kind: 'create',
    workspaceId,
    rows: rows.map((r, i) => ({ ...r, dedupeKey: rows.length > 1 ? `${key}:${i}` : key })),
    plan,
    createdAt: now,
  };
}

export const updateOp = ({ uuid, workspaceId, txId, data, now = Date.now() }) =>
  ({ id: `upd:${uuid}`, kind: 'update', workspaceId, txId, data, createdAt: now });

export const deleteOp = ({ uuid, workspaceId, txId, plan = null, now = Date.now() }) =>
  ({ id: `del:${uuid}`, kind: 'delete', workspaceId, txId, plan, createdAt: now });

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

  if (op.kind === 'delete') {
    const host = ops.find((o) => open(o) && ownsRow(o, op.txId));
    const rest = ops.filter((o) => !(open(o) && o.kind === 'update' && o.txId === op.txId));
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
export function applyOutbox(serverRows = [], ops = [], idMap = {}) {
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
      queued.push({ ...row, ...(edits.get(id) || {}), id, _sync: op.error ? 'failed' : 'pending' });
    }
  }

  const stored = serverRows
    .filter((r) => !deleted.has(r.id))
    .map((r) => (edits.has(r.id) ? { ...r, ...edits.get(r.id), _sync: 'pending' } : r));

  return [...queued, ...stored];
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
