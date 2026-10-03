// The device's own database (IndexedDB, through idb-keyval), for what is kept for offline use. idb-keyval opens the
// database the first time it is used, and where the browser refuses it (some private modes and privacy settings)
// that throws at once instead of failing the promise, which stopped the whole app from starting. Here a refusal is
// an ordinary failed promise: callers already treat those as "nothing kept on this device" and carry on online.
import * as idb from 'idb-keyval';

const safe = (fn) => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return Promise.reject(err);
  }
};

export const get = safe(idb.get);
export const set = safe(idb.set);
export const del = safe(idb.del);
export const keys = safe(idb.keys);
