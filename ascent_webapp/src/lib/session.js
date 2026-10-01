// Who the signed-in person is in a workspace, and what this device remembers about the session.
// Plain functions (storage is passed in), so they run under `node --test`.
import { WORKSPACE_KEY, SESSION_CACHE_KEY } from './storageKeys.js';

export const sameId = (a, b) => !!a && !!b && String(a) === String(b);
export const workspaceIdOf = (ws) => (ws ? String(ws.id || ws._id) : null);

/** The person's accepted membership in a workspace (pending or declined invitations grant nothing). */
export const findMember = (ws, user) =>
  (ws?.members || []).find(
    (m) => m.status === 'accepted' && (sameId(m.userId, user?.id) || sameId(m.userId, user?._id) || (!m.userId && !!m.email && m.email === user?.email))
  );

/** null = full access (owner or admin); otherwise the explicit permission flags ({} for a non-member). */
export function permissionsOf(member) {
  if (!member) return {};
  return member.role === 'owner' || member.role === 'admin' ? null : member.permissions || {};
}

export const hasPermissionIn = (permissions, permission) => !permissions || permissions[permission] === true;

/** The workspace to open: the one this device last used if the person still belongs to it, else the first. */
export const pickWorkspace = (list = [], storedId) => list.find((w) => workspaceIdOf(w) === storedId) || list[0] || null;

const safe = (fn, fallback) => {
  try { return fn(); } catch { return fallback; }
};
const local = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const storedWorkspaceId = (store = local()) => safe(() => store?.getItem(WORKSPACE_KEY) || null, null);

/** Makes `id` the workspace every API call goes to (the client reads it from storage). */
export function rememberWorkspace(id, store = local()) {
  safe(() => (id ? store?.setItem(WORKSPACE_KEY, String(id)) : store?.removeItem(WORKSPACE_KEY)));
}

// The last session this device confirmed (user + workspaces, no secrets). The app opens on it at once,
// offline included, and checks it with the server in the background.
export function readCachedSession(store = local()) {
  return safe(() => {
    const cached = JSON.parse(store?.getItem(SESSION_CACHE_KEY) || 'null');
    return cached?.user && Array.isArray(cached.workspaces) ? cached : null;
  }, null);
}

export function writeCachedSession(user, workspaces, store = local(), now = Date.now()) {
  safe(() => store?.setItem(SESSION_CACHE_KEY, JSON.stringify({ user, workspaces, at: now })));
}

export const clearCachedSession = (store = local()) => safe(() => store?.removeItem(SESSION_CACHE_KEY));

/** Everything the app derives from a user and their workspaces: which one is open and what they may do there. */
export function sessionState(user, workspaces, storedId) {
  const currentWorkspace = pickWorkspace(workspaces, storedId);
  return {
    user,
    workspaces,
    currentWorkspace,
    permissions: currentWorkspace ? permissionsOf(findMember(currentWorkspace, user)) : {},
  };
}
