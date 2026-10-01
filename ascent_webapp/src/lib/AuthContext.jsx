import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { ascent, systemPrefs } from '@/api/client';
import { isNetworkError } from '@/lib/offline/network';
import { markUnlocked } from '@/lib/appLock';
import {
  findMember, permissionsOf, hasPermissionIn, sameId, workspaceIdOf, sessionState,
  storedWorkspaceId, rememberWorkspace, readCachedSession, writeCachedSession, clearCachedSession,
} from '@/lib/session';

const AuthContext = createContext(null);

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const authenticatedRef = useRef(false);
  authenticatedRef.current = isAuthenticated;

  // Preference edits made on this device that the server hasn't confirmed yet ({ field: { value, seq } }).
  // A /me response that left before the save landed must not bring the old value back.
  const pendingPrefs = useRef({});
  const prefsSeq = useRef(0);
  // Saves go out one at a time, so a quick double tap can't reach the server in the wrong order
  const prefsQueue = useRef(Promise.resolve());

  const withPendingPrefs = useCallback((u) => {
    const pending = Object.entries(pendingPrefs.current);
    if (!u || !pending.length) return u;
    return { ...u, ...Object.fromEntries(pending.map(([k, p]) => [k, p.value])) };
  }, []);

  const applySession = useCallback((nextUser, list) => {
    const state = sessionState(nextUser, list, storedWorkspaceId());
    setUser(nextUser);
    setIsAuthenticated(true);
    setWorkspaces(list);
    setCurrentWorkspace(state.currentWorkspace);
    setPermissions(state.permissions);
    rememberWorkspace(workspaceIdOf(state.currentWorkspace));
    return state;
  }, []);

  // The person's workspaces from the server; offline, what this device already knows stays
  const loadWorkspaces = useCallback(async (currentUser) => {
    try {
      let list = await ascent.workspaces.list();
      // Every account is created with its own workspace; this only repairs one that lost it
      if (!list.length) list = [await ascent.workspaces.create({ name: 'My Workspace' })];
      applySession(currentUser, list);
      writeCachedSession(currentUser, list);
    } catch (err) {
      if (isNetworkError(err) && readCachedSession()) return;
      console.error('[Auth] Failed to load workspaces:', err?.message);
      setPermissions({}); // no workspace we can confirm: no access until it loads
    }
  }, [applySession]);

  // Checks the saved token with the server. With a cached session the app opens on it at once and
  // this runs behind it; `silent` never swaps the screen for the loading splash.
  const checkUserAuth = useCallback(async (silent = false) => {
    const cached = readCachedSession();
    if (!silent && cached) {
      applySession(cached.user, cached.workspaces);
      setIsLoadingAuth(false);
      silent = true;
    }
    try {
      if (!silent) setIsLoadingAuth(true);
      const currentUser = withPendingPrefs(await ascent.auth.me());
      setUser(currentUser);
      setIsAuthenticated(true);
      await loadWorkspaces(currentUser);
    } catch (error) {
      // No signal (or the server is unreachable): carry on with what this device knows
      if (isNetworkError(error) && cached) return;
      const wasSignedIn = authenticatedRef.current;
      setIsAuthenticated(false);
      clearCachedSession();
      if (error.status === 401 || error.status === 403) {
        ascent.auth.forgetToken();
        if (wasSignedIn) setAuthError({ type: 'auth_required', message: 'Session expired. Please log in again.' });
      } else {
        console.error('[Auth] Sign-in check failed:', error?.message);
        setAuthError({ type: 'unknown', message: error.message || 'Authentication check failed' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, [applySession, loadWorkspaces, withPendingPrefs]);

  const checkAppState = useCallback(async (options) => {
    setAuthError(null);
    if (!ascent.auth.isAuthenticated()) {
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      return;
    }
    await checkUserAuth(options?.silent === true);
  }, [checkUserAuth]);

  // Once, on start
  useEffect(() => { checkAppState(); }, [checkAppState]);

  // Change the user's own preferences (theme, blurValues, language...): shown at once, kept in the
  // cached session, then saved. Rejects if the save fails; the caller decides how to recover.
  const saveUserPrefs = useCallback((updates) => {
    const seq = ++prefsSeq.current;
    for (const [k, value] of Object.entries(updates)) pendingPrefs.current[k] = { value, seq };
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    const cached = readCachedSession();
    if (cached) writeCachedSession({ ...cached.user, ...updates }, cached.workspaces);

    const save = prefsQueue.current.then(() => ascent.auth.updateMe(updates));
    prefsQueue.current = save.catch(() => {});
    return save.finally(() => {
      // Forget each field unless a newer edit replaced it meanwhile
      for (const k of Object.keys(updates)) {
        if (pendingPrefs.current[k]?.seq === seq) delete pendingPrefs.current[k];
      }
    });
  }, []);

  // Quiet background sync: picks up renames, new members, role and permission changes made by others,
  // and recovers when the person has been removed from the workspace they are viewing.
  const refreshWorkspaces = useCallback(async () => {
    if (!user) return;
    try {
      const list = await ascent.workspaces.list();
      const current = list.find((w) => workspaceIdOf(w) === storedWorkspaceId());
      if (!current) {
        await loadWorkspaces(user);
        return;
      }
      setWorkspaces((prev) => (sameJson(prev, list) ? prev : list));
      setCurrentWorkspace((prev) => (prev && sameJson(prev, current) ? prev : current));
      const next = permissionsOf(findMember(current, user));
      setPermissions((prev) => (sameJson(prev, next) ? prev : next));
      writeCachedSession(user, list);
    } catch (err) {
      if (!isNetworkError(err)) console.error('[Auth] Failed to refresh workspaces:', err?.message);
    }
  }, [user, loadWorkspaces]);

  // What every way of signing in has in common
  const completeSignIn = useCallback(async ({ user: signedInUser, isFirstLogin }) => {
    let currentUser = signedInUser;
    if (isFirstLogin) {
      // A first sign-in adopts the device's language and theme. Saved before anything re-fetches the
      // user, so a refresh can't bring the defaults back.
      currentUser = { ...currentUser, ...systemPrefs() };
      try { await ascent.auth.updateMe(systemPrefs()); } catch { /* keep the local prefs */ }
      try { sessionStorage.setItem('showWelcomeMessage', 'true'); } catch { /* storage unavailable */ }
    }
    setUser(currentUser);
    setIsAuthenticated(true);
    setAuthError(null);
    markUnlocked();
    await loadWorkspaces(currentUser);
    return currentUser;
  }, [loadWorkspaces]);

  const failed = (type) => (error) => {
    setAuthError({ type, message: error.message });
    throw error;
  };

  const login = useCallback(
    (email, password) => ascent.auth.login(email, password).then(completeSignIn).catch(failed('login_failed')),
    [completeSignIn]
  );
  const register = useCallback(
    (email, password, fullName) => ascent.auth.register(email, password, fullName).then(completeSignIn).catch(failed('registration_failed')),
    [completeSignIn]
  );
  const loginWithGoogle = useCallback(
    (credential) => ascent.auth.googleLogin(credential).then(completeSignIn).catch(failed('google_login_failed')),
    [completeSignIn]
  );

  // Face ID / fingerprint sign-in (and the lock screen's unlock, which keeps this device's session)
  const loginWithPasskey = useCallback(async ({ autofill = false } = {}) => {
    const result = await ascent.auth.passkeyLogin({ autofill });
    markUnlocked();
    setUser(result.user);
    setIsAuthenticated(true);
    setAuthError(null);
    if (!result.unlocked) await loadWorkspaces(result.user);
    return result;
  }, [loadWorkspaces]);

  const logout = useCallback((shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    ascent.auth.logout(shouldRedirect ? window.location.href : undefined);
  }, []);

  const navigateToLogin = useCallback(() => ascent.auth.redirectToLogin(window.location.href), []);

  const hasPermission = useCallback((permission) => hasPermissionIn(permissions, permission), [permissions]);

  const switchWorkspace = useCallback((workspaceId) => {
    const ws = workspaces.find((w) => workspaceIdOf(w) === String(workspaceId));
    if (!ws) return;
    rememberWorkspace(workspaceIdOf(ws));
    setCurrentWorkspace(ws);
    setPermissions(permissionsOf(findMember(ws, user)));
  }, [workspaces, user]);

  const currentMember = useMemo(() => findMember(currentWorkspace, user), [currentWorkspace, user]);
  const isWorkspaceOwner = currentMember?.role === 'owner' || sameId(currentWorkspace?.ownerId, user?.id || user?._id);

  const value = useMemo(() => ({
    currentMember, isWorkspaceOwner, user, setUser, isAuthenticated, permissions, hasPermission,
    workspaces, currentWorkspace, setCurrentWorkspace, switchWorkspace, refreshWorkspaces,
    isLoadingAuth, authError, login, register, loginWithGoogle, loginWithPasskey, logout,
    navigateToLogin, checkAppState, saveUserPrefs,
  }), [
    currentMember, isWorkspaceOwner, user, isAuthenticated, permissions, hasPermission,
    workspaces, currentWorkspace, switchWorkspace, refreshWorkspaces,
    isLoadingAuth, authError, login, register, loginWithGoogle, loginWithPasskey, logout,
    navigateToLogin, checkAppState, saveUserPrefs,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/** The id of the workspace on screen, or null before it is known. */
export const useWorkspaceId = () => workspaceIdOf(useAuth().currentWorkspace);
