import { del } from 'idb-keyval';
import { PERSIST_KEY } from './persist';
import { clearOutboxes } from './txOutbox';
import { queryClientInstance } from '@/lib/query-client';

/** Everything this app keeps about the account on the device, gone (sign-out). */
export async function clearDeviceData() {
  queryClientInstance.clear();
  await Promise.all([
    del(PERSIST_KEY).catch(() => {}),
    clearOutboxes(),
  ]);
  // Face ID lock settings stay: they are per account and hold no secrets, and signing back in with
  // a passkey should find the lock as it was left
  try { localStorage.removeItem('ascent_cached_session'); } catch { /* storage unavailable */ }
}
