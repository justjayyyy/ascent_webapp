import { get, set, del } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// The query cache is kept in IndexedDB, so the app opens straight onto the last numbers it saw
// (and still shows them with no signal) while fresh data loads behind them.

export const PERSIST_KEY = 'ascent:rq-cache';
// Bump when the shape of cached data changes, so an old cache is thrown away rather than misread
// v3: transactions are cached per view (date window or link)
export const PERSIST_BUSTER = 'v3';
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Money data, lists and settings the pages open with; nothing that is cheap or per-moment
const KEEP = new Set(['transactions', 'categories', 'budgets', 'cards', 'accounts', 'plans', 'commitments', 'assist-status', 'settlements', 'groceries', 'exchange-rates']);

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: PERSIST_KEY,
  throttleTime: 1500,
  serialize: (data) => data, // IndexedDB stores structured clones; no JSON round-trip needed
  deserialize: (data) => data,
});

export const persistOptions = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  buster: PERSIST_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success' && KEEP.has(query.queryKey[0]),
  },
};
