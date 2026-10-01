import { useSyncExternalStore } from 'react';

// Whether the device thinks it has a connection. navigator.onLine can say "online" on a captive
// portal or a dead cell, so writes still treat a failed request as offline (see isNetworkError).

const subscribe = (fn) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
};
const snapshot = () => navigator.onLine !== false;

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function useOnline() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/** A request that never got an answer (no signal, timeout, server unreachable). */
export const isNetworkError = (err) =>
  !isOnline() || err?.isNetworkError === true || err?.status === 0 || err?.status === 408 || err instanceof TypeError;

export const uuid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
