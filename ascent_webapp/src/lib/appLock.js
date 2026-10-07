// Face ID / fingerprint app lock: per-device settings and the unlock ceremonies.
//
// Settings live on the device (localStorage "ascent_lock", keyed by user id), because the lock is
// about this phone: { enabled, after (seconds in the background before it locks), credentialIds }.
// credentialIds are the passkeys proven to work on this device, used to unlock without a connection.

const KEY = 'ascent_lock';
const UNLOCKED_KEY = 'ascent_unlocked_at';

/** Called after any sign-in or unlock, so this browsing session does not lock straight away. */
export function markUnlocked() {
  try { sessionStorage.setItem(UNLOCKED_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
export function unlockedThisSession() {
  try { return !!sessionStorage.getItem(UNLOCKED_KEY); } catch { return false; }
}
export const LOCK_AFTER_CHOICES = [0, 60, 300, 900];
const DEFAULT_AFTER = 60;

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}

export function getLockPrefs(userId) {
  const p = userId ? readAll()[userId] : null;
  return { enabled: !!p?.enabled, after: LOCK_AFTER_CHOICES.includes(p?.after) ? p.after : DEFAULT_AFTER, credentialIds: p?.credentialIds || [] };
}

export function setLockPrefs(userId, patch) {
  if (!userId) return getLockPrefs(userId);
  const all = readAll();
  const next = { ...getLockPrefs(userId), ...patch };
  all[userId] = next;
  writeAll(all);
  window.dispatchEvent(new CustomEvent('ascent:lock-prefs', { detail: { userId } }));
  return next;
}

export function rememberCredential(userId, id) {
  if (!id) return;
  const { credentialIds } = getLockPrefs(userId);
  if (!credentialIds.includes(id)) setLockPrefs(userId, { credentialIds: [...credentialIds, id].slice(-5) });
}

/** Has someone signed in or unlocked with a passkey on this device? The sign-in page then leads with it. */
export function passkeyUsedHere() {
  return Object.values(readAll()).some((p) => p?.credentialIds?.length > 0);
}

/** Does this device have a built-in authenticator (Face ID, Touch ID, fingerprint, Windows Hello)? */
export async function deviceCanUseBiometrics() {
  try {
    const { browserSupportsWebAuthn, platformAuthenticatorIsAvailable } = await import('@simplewebauthn/browser');
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());
  } catch {
    return false;
  }
}

/** Which kind of unlock this device has: 'face' | 'fingerprint' | 'key' (for the button's glyph). */
export function biometricKind() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/.test(ua)) return 'face';
  if (/iPad|Macintosh|Android/.test(ua)) return 'fingerprint';
  return 'key';
}

/** What the unlock is called on this device, for the button label. */
export function biometricName(t) {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/.test(ua)) return t('lockFaceId');
  if (/iPad|Macintosh/.test(ua)) return t('lockTouchId');
  if (/Android/.test(ua)) return t('lockFingerprint');
  if (/Windows/.test(ua)) return t('lockWindowsHello');
  return t('lockPasskey');
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Unlock without the server: ask the authenticator to verify the person (Face ID) with a passkey known
 * to be on this device. The phone itself checks the face or finger; there is no network round trip.
 */
export async function unlockOnDevice(userId) {
  const { credentialIds } = getLockPrefs(userId);
  if (!credentialIds.length || !window.PublicKeyCredential) throw new Error('no_local_passkey');
  // Nothing to load first: Safari opens Face ID only straight after the tap
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: credentialIds.map((id) => ({ type: 'public-key', id: fromBase64Url(id) })),
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!credential) throw new Error('cancelled');
  return true;
}

/**
 * Turn the Face ID lock on for this device: make a passkey here (or, when this phone already holds one
 * for the account, prove it with Face ID) and remember it for unlocking offline.
 */
// Accounts whose passkey is already on this phone: the next try goes straight to Face ID
const passkeyAlreadyHere = new Set();

export async function enableBiometricLock(userId, { register, verify }) {
  if (passkeyAlreadyHere.has(userId)) {
    const { credentialId } = await verify();
    rememberCredential(userId, credentialId);
  } else {
    try {
      const { credentialId } = await register();
      rememberCredential(userId, credentialId);
    } catch (err) {
      if (err?.name !== 'InvalidStateError') throw err;
      passkeyAlreadyHere.add(userId);
      // Safari may refuse a second prompt from the same tap; the next tap then opens it
      const { credentialId } = await verify();
      rememberCredential(userId, credentialId);
    }
  }
  markUnlocked();
  return setLockPrefs(userId, { enabled: true });
}
