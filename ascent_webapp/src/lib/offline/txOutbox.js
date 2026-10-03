import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, set, del, keys } from '@/lib/offline/deviceStore';
import { ascent } from '@/api/client';
import { queryClientInstance } from '@/lib/query-client';
import { setPlanItem } from '@/components/expenses/planLink';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { workspaceKey } from '@/lib/workspaceKey';
export { mergeRows } from './outboxModel';
import {
  enqueue, applyOutbox, applyListOutbox, opsForWorkspace, opsForEntity, entityOf, withRealIds, inView, windowStart, earliestDay,
  isLocalId, localIdOf, isTransientError, pendingCount, failedCount, TRANSACTIONS, LIST_ENTITIES,
} from './outboxModel';
import { isOnline } from './network';

// Offline-first writes. Every add, edit and delete of a transaction, budget, plan, loan or grocery item goes
// through this one queue: it is stored in IndexedDB first (so it survives the app being closed), drawn
// into the lists at once, and sent in the order it was made whenever there is a connection. With signal
// it syncs within the same tap; without, it waits and goes out when the phone is back online. See
// outboxModel.js for the folding rules. (The storage key still says "tx" so queues saved earlier carry on.)

const REQUEST = { timeout: 15000, retries: 0 };
// A safety cap per view (the server allows no more); a view is a date window or one kind of link
const TRANSACTION_LIMIT = 10000;
const BACKOFF = [3000, 10000, 30000, 60000, 180000];
const Tx = () => ascent.entities.ExpenseTransaction;
// The household lists' APIs, by entity name
const LIST_API = {
  budgets: () => ascent.entities.Budget,
  plans: () => ascent.entities.Plan,
  commitments: () => ascent.entities.Commitment,
  groceries: () => ascent.entities.GroceryItem,
  goals: () => ascent.entities.FinancialGoal,
  tasks: () => ascent.entities.HouseTask,
};
const rowId = (row) => row?.id || row?._id;

class TxOutbox {
  constructor(userId) {
    this.userId = userId;
    this.key = `ascent:tx:outbox:${userId}`;
    this.state = { ops: [], idMap: {}, syncing: false, loaded: false };
    this.listeners = new Set();
    this.waiters = new Map(); // op id -> { resolve, reject }
    this.busyId = null;
    this.flushing = null;
    this.attempt = 0;
    this.ready = get(this.key)
      .then((saved) => {
        const ops = Array.isArray(saved?.ops) ? saved.ops : [];
        this.setState({ ops: [...ops, ...this.state.ops], idMap: { ...(saved?.idMap || {}), ...this.state.idMap }, loaded: true });
      })
      .catch(() => this.setState({ loaded: true }))
      .then(() => { if (this.state.ops.length) this.flush(); });
  }

  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.state;

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  persist() {
    const { ops, idMap } = this.state;
    // Keep only the id mappings a waiting edit still needs
    const needed = new Set(ops.map((o) => o.txId).filter(Boolean));
    const map = Object.fromEntries(Object.entries(idMap).filter(([k]) => needed.has(k)));
    return (ops.length ? set(this.key, { ops, idMap: map }) : del(this.key)).catch(() => {});
  }

  /**
   * Queue a change and try to send it now. Resolves 'synced' once the server has it, or 'queued' when
   * there is no connection (or it takes longer than `waitMs`); rejects when the server refuses it.
   */
  async submit(op, { waitMs = 7000 } = {}) {
    await this.ready;
    const done = new Promise((resolve, reject) => this.waiters.set(op.id, { resolve, reject }));
    this.setState({ ops: enqueue(this.state.ops, op, this.busyId) });
    await this.persist();
    // Folded into a change that is still waiting: it goes out with that one
    if (!this.state.ops.some((o) => o.id === op.id)) this.settle(op.id, 'queued');
    this.flush();
    const timer = new Promise((resolve) => setTimeout(() => resolve('queued'), waitMs));
    return Promise.race([done, timer]);
  }

  settle(id, value, error) {
    const w = this.waiters.get(id);
    if (!w) return;
    this.waiters.delete(id);
    if (error) w.reject(error); else w.resolve(value);
  }

  async retry(id) {
    this.setState({ ops: this.state.ops.map((o) => (o.id === id ? { ...o, error: undefined } : o)) });
    await this.persist();
    this.attempt = 0;
    return this.flush();
  }

  async discard(id) {
    this.setState({ ops: this.state.ops.filter((o) => o.id !== id) });
    await this.persist();
  }

  resolveId(id) {
    return this.state.idMap[id] || id;
  }

  /** A household list change: its row, or what became of it. */
  async runList(op, opts) {
    const api = LIST_API[op.entity]?.();
    if (!api) return {}; // a change saved before that kind of list was removed (settle-ups): nothing to send
    const real = (value) => withRealIds(value, this.state.idMap);
    const base = { entity: op.entity, workspaceId: op.workspaceId };
    if (op.kind === 'create') {
      const [row] = op.rows;
      const created = await api.create(real(row), opts);
      return { ...base, created: [created], idMap: { [localIdOf(row)]: rowId(created) } };
    }
    const id = this.resolveId(op.txId);
    if (isLocalId(id)) return {}; // its add was refused, so there is nothing on the server to change
    try {
      if (op.kind === 'update') return { ...base, updated: await api.update(id, real(op.data), opts) };
      if (op.kind === 'entry') return { ...base, updated: await api.changeEntry(id, op.list, real(op.change), opts) };
      await api.delete(id, opts);
      return { ...base, deleted: id };
    } catch (err) {
      if (err?.status === 404) return {}; // already gone
      throw err;
    }
  }

  async run(op) {
    const opts = { ...REQUEST, headers: { 'x-workspace-id': op.workspaceId } };
    if (entityOf(op) !== TRANSACTIONS) return this.runList(op, opts);
    if (op.kind === 'create') {
      // A plan or loan made offline a moment before has its real id by now
      const rows = withRealIds(op.rows, this.state.idMap);
      const plan = withRealIds(op.plan, this.state.idMap);
      const created = rows.length > 1
        ? await Tx().bulkCreate(rows, opts)
        : [await Tx().create(rows[0], opts)];
      const idMap = {};
      created.forEach((row) => {
        const mine = op.rows.find((r) => r.dedupeKey === row?.dedupeKey);
        if (mine) idMap[localIdOf(mine)] = row.id || row._id;
      });
      if (plan && created[0]) {
        await setPlanItem(plan.planId, plan.itemId, { status: 'paid', transactionId: created[0].id || created[0]._id || null }, opts).catch(() => {});
      }
      return { created, idMap, workspaceId: op.workspaceId };
    }
    const id = this.resolveId(op.txId);
    if (isLocalId(id)) return {}; // its add was refused, so there is nothing on the server to change
    try {
      if (op.kind === 'update') return { updated: await Tx().update(id, withRealIds(op.data, this.state.idMap), opts), workspaceId: op.workspaceId };
      await Tx().delete(id, opts);
      if (op.plan) await setPlanItem(op.plan.planId, op.plan.itemId, { status: 'planned', transactionId: null }, opts).catch(() => {});
      return { deleted: id, workspaceId: op.workspaceId };
    } catch (err) {
      if (err?.status === 404) return {}; // already gone
      throw err;
    }
  }

  /** Put what the server answered into the cached list right away, so nothing blinks while it refetches. */
  absorb(result) {
    if (!result.workspaceId) return;
    if (result.entity) {
      queryClientInstance.setQueryData(workspaceKey(result.entity, result.workspaceId), (list) => {
        if (!Array.isArray(list)) return list;
        let next = list;
        for (const row of [...(result.created || []), ...(result.updated ? [result.updated] : [])]) {
          const id = rowId(row);
          next = next.some((r) => r.id === id) ? next.map((r) => (r.id === id ? { ...row, id } : r)) : [...next, { ...row, id }];
        }
        if (result.deleted) next = next.filter((r) => r.id !== result.deleted);
        return next;
      });
      return;
    }
    // Every loaded view of this workspace's transactions, each taking only the rows it shows
    const views = queryClientInstance.getQueryCache().findAll({ queryKey: workspaceKey('transactions', result.workspaceId) });
    for (const { queryKey } of views) {
      const view = queryKey[2] || {};
      queryClientInstance.setQueryData(queryKey, (list) => {
        if (!Array.isArray(list)) return list;
        let next = list;
        if (result.created?.length) {
          const ids = new Set(result.created.map((r) => r.id));
          next = [...result.created.filter((r) => inView(r, view)), ...next.filter((r) => !ids.has(r.id))];
        }
        if (result.updated?.id) {
          next = next
            .map((r) => (r.id === result.updated.id ? result.updated : r))
            .filter((r) => r.id !== result.updated.id || inView(r, view));
        }
        if (result.deleted) next = next.filter((r) => r.id !== result.deleted);
        return next;
      });
    }
  }

  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await this.ready;
      let sent = 0;
      const touched = new Set();
      this.setState({ syncing: true });
      try {
        for (;;) {
          const op = this.state.ops.find((o) => !o.error);
          if (!op) break;
          if (!isOnline()) break;
          this.busyId = op.id;
          let result;
          try {
            result = await this.run(op);
          } catch (err) {
            this.busyId = null;
            if (isTransientError(err)) { this.scheduleRetry(); break; }
            const message = err?.data?.error || err?.message || 'Refused';
            this.setState({ ops: this.state.ops.map((o) => (o.id === op.id ? { ...o, error: message } : o)) });
            await this.persist();
            this.settle(op.id, null, err);
            continue;
          }
          this.busyId = null;
          this.attempt = 0;
          sent += 1;
          touched.add(entityOf(op));
          this.setState({
            ops: this.state.ops.filter((o) => o.id !== op.id),
            idMap: { ...this.state.idMap, ...(result.idMap || {}) },
          });
          this.absorb(result);
          await this.persist();
          this.settle(op.id, 'synced');
        }
      } finally {
        this.busyId = null;
        // Whatever is still waiting will go out later
        this.state.ops.forEach((o) => { if (!o.error) this.settle(o.id, 'queued'); });
        this.setState({ syncing: false, lastSyncedAt: sent ? Date.now() : this.state.lastSyncedAt });
        if (sent) {
          touched.forEach((entity) => queryClientInstance.invalidateQueries({ queryKey: [entity] }));
          // A transaction paid from a plan also changed that plan's item
          if (touched.has(TRANSACTIONS) && this.state.ops.length === 0) queryClientInstance.invalidateQueries({ queryKey: ['plans'] });
        }
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!isOnline()) return; // the 'online' event will wake us
    const wait = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => this.flush(), wait);
  }
}

const boxes = new Map();

export function getOutbox(userId) {
  if (!userId) return null;
  let box = boxes.get(userId);
  if (!box) {
    box = new TxOutbox(userId);
    boxes.set(userId, box);
  }
  return box;
}

if (typeof window !== 'undefined') {
  const wake = () => boxes.forEach((b) => b.flush());
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
}

/** Forget queued changes on this device (sign-out). */
export async function clearOutboxes() {
  boxes.clear();
  const all = await keys().catch(() => []);
  await Promise.all(all.filter((k) => typeof k === 'string' && k.startsWith('ascent:tx:outbox:')).map((k) => del(k).catch(() => {})));
}

const EMPTY = { ops: [], idMap: {}, syncing: false, loaded: true };
const noop = () => () => {};

export function useOutboxState(userId) {
  const box = getOutbox(userId);
  return useSyncExternalStore(box ? box.subscribe : noop, box ? box.getSnapshot : () => EMPTY, () => EMPTY);
}

/** Queue size and sync state for the status pill and the sign-out warning. */
export function useOutbox() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const state = useOutboxState(userId);
  return {
    box: getOutbox(userId),
    ops: state.ops,
    pending: pendingCount(state.ops),
    failed: failedCount(state.ops),
    syncing: state.syncing,
    lastSyncedAt: state.lastSyncedAt,
  };
}

/** One view of the household's transactions, with changes still waiting on this device drawn in. */
function useTransactionView(view, enabled) {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const workspaceId = useWorkspaceId();
  const query = useQuery({
    queryKey: [...workspaceKey('transactions', workspaceId), view],
    queryFn: () => ascent.entities.ExpenseTransaction.filter(view, '-date', TRANSACTION_LIMIT, { headers: { 'x-workspace-id': workspaceId } }),
    enabled: !!userId && !!workspaceId && enabled,
    // A longer window keeps showing the shorter one while it loads, never another workspace's rows
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === workspaceId ? previous : undefined),
    staleTime: 3 * 60 * 1000,
    // New rows from other devices (another member, an Apple Pay tap) arrive through the workspace pulse
    // (useWorkspaceSync), which refetches when anything changed; and on return to the app
    refetchOnWindowFocus: 'always',
  });
  const { ops, idMap } = useOutboxState(userId);
  // Only this workspace's waiting changes to transactions belong in this list
  const here = useMemo(() => opsForEntity(opsForWorkspace(ops, workspaceId), TRANSACTIONS), [ops, workspaceId]);
  const data = useMemo(() => applyOutbox(query.data || [], here, idMap, (row) => inView(row, view)), [query.data, here, idMap, view]);
  // Offline with nothing cached yet: the query is paused, so show the empty list instead of a spinner.
  // loadFailed: the server answered with an error and nothing is cached, so the list is not the household's
  // (rows saved earlier on this device still show during a later failure, which is the offline promise)
  return { ...query, data, isLoading: query.isPending && query.fetchStatus !== 'paused', loadFailed: query.isError && query.data === undefined };
}

/**
 * The household's transactions from `from` (YYYY-MM-DD) on, or from the default window
 * (HISTORY_MONTHS back) when that is earlier. Future rows (installments, recurring) are included.
 */
export function useTransactions({ from, enabled = true } = {}) {
  const start = earliestDay(from, windowStart());
  const view = useMemo(() => ({ from: start }), [start]);
  return useTransactionView(view, enabled);
}

/**
 * Every transaction where `field` is set, whatever its date: 'planId', 'commitmentId',
 * or 'installmentGroupId' (all parts of big purchases).
 */
export function useLinkedTransactions(field, { enabled = true } = {}) {
  const view = useMemo(() => ({ has: field }), [field]);
  return useTransactionView(view, enabled);
}

/** The date of the household's oldest transaction (YYYY-MM-DD), so screens can offer every year there is. */
export function useOldestTransactionDate() {
  const workspaceId = useWorkspaceId();
  const query = useQuery({
    queryKey: ['transactions-oldest', workspaceId],
    queryFn: async () => {
      const [oldest] = await ascent.entities.ExpenseTransaction.list('date', 1, { headers: { 'x-workspace-id': workspaceId } });
      return oldest?.date ? String(oldest.date).slice(0, 10) : null;
    },
    enabled: !!workspaceId,
    staleTime: 60 * 60 * 1000,
  });
  return query.data ?? null;
}

/**
 * A household list (`entity` is one of LIST_ENTITIES) with this workspace's waiting changes drawn in.
 * Other lists come back as they are.
 */
export function useQueuedChanges(entity, rows) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { ops, idMap } = useOutboxState(user?.id || user?._id);
  return useMemo(() => {
    if (!LIST_ENTITIES.includes(entity)) return rows;
    const mine = opsForEntity(opsForWorkspace(ops, workspaceId), entity);
    return mine.length ? applyListOutbox(rows || [], mine, idMap) : rows;
  }, [entity, rows, ops, idMap, workspaceId]);
}

/** The real id of a row made on this device, once the server has it (else the id as given). */
export function useRealId(id) {
  const { user } = useAuth();
  const { idMap } = useOutboxState(user?.id || user?._id);
  return (id && idMap[id]) || id;
}
