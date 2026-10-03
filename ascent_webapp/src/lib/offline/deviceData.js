import { del } from '@/lib/offline/deviceStore';
import { PERSIST_KEY } from './persist';
import { clearOutboxes } from './txOutbox';
import { queryClientInstance } from '@/lib/query-client';
import { CALENDAR_EXPIRY_KEY, CALENDAR_TOKEN_KEY, SESSION_CACHE_KEY } from '@/lib/storageKeys';

/** Everything this app keeps about the account on the device, gone (sign-out). */
export async function clearDeviceData() {
  queryClientInstance.clear();
  await Promise.all([
    del(PERSIST_KEY).catch(() => {}),
    clearOutboxes(),
  ]);
  // Face ID lock settings stay: they are per account and hold no secrets, and signing back in with
  // a passkey should find the lock as it was left
  // The Google Calendar connection too: the next person to sign in here must not see this one's calendar
  try {
    [SESSION_CACHE_KEY, CALENDAR_TOKEN_KEY, CALENDAR_EXPIRY_KEY].forEach((key) => localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}
