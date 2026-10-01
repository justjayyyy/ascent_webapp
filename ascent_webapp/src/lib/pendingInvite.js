// An invitation opened while signed out (a scanned QR code or an emailed link). Signing in can take a
// detour (sign-up, Google, a passkey, reopening the app), so the token is kept here and the invitation is
// joined right after sign-in (AuthContext). The invitation page then finds what it joined and opens it.
const PENDING = 'ascent_pending_invite';
const JOINED = 'ascent_joined_invite';
const TTL_MS = 48 * 60 * 60 * 1000;

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};
const remove = (key) => {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
};

export const rememberInvite = (token, now = Date.now()) => write(PENDING, { token, at: now });
export const forgetInvite = () => remove(PENDING);

/** The pending invitation's token (once: it is forgotten), or null when there is none or it is too old. */
export function takePendingInvite(now = Date.now()) {
  const saved = read(PENDING);
  remove(PENDING);
  return saved?.token && now - saved.at < TTL_MS ? saved.token : null;
}

/** Joined on sign-in: which workspace the invitation `token` led to, for its page to open. */
export const rememberJoined = (token, workspaceId) => write(JOINED, { token, workspaceId });
export function joinedThrough(token) {
  const saved = read(JOINED);
  return saved?.token === token ? saved.workspaceId : null;
}
export const forgetJoined = () => remove(JOINED);
