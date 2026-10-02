// The language the first screen will most likely use, known before anything is drawn
import { readCachedSession } from './session.js';
import { LOGIN_LANG_KEY } from './storageKeys.js';

const SUPPORTED = ['en', 'he', 'ru'];

/** The signed-in person's language from the cached session, else the sign-in page's choice, else the device's, else Hebrew. */
export function likelyLanguage(store = globalThis.localStorage, device = globalThis.navigator?.language) {
  const fromUser = readCachedSession(store)?.user?.language;
  if (SUPPORTED.includes(fromUser)) return fromUser;
  try {
    const saved = store?.getItem(LOGIN_LANG_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  const code = String(device || '').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(code) ? code : 'he';
}
