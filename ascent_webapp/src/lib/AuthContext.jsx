import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { ascent, systemPrefs } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { isNetworkError } from '@/lib/offline/network';
import { markUnlocked } from '@/lib/appLock';

const AuthContext = createContext();

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/privacy-policy', '/terms-of-service', '/accept-invitation'];

const isPublicRoute = (pathname) => {
  return PUBLIC_ROUTES.some(route => {
    if (route.includes(':')) {
      // Handle dynamic routes like /accept-invitation/:token
      const routePattern = route.replace(/:[^/]+/g, '[^/]+');
      const regex = new RegExp(`^${routePattern}`);
      return regex.test(pathname);
    }
    return pathname.startsWith(route);
  });
};

const sameId = (a, b) => !!a && !!b && String(a) === String(b);

// The caller's accepted membership in a workspace (pending or declined invitations grant nothing).
const findMe = (ws, u) =>
  (ws?.members || []).find(
    (m) => m.status === 'accepted' && (sameId(m.userId, u?.id) || sameId(m.userId, u?._id) || (!m.userId && m.email === u?.email))
  );

// null = full access (owner/admin), otherwise the explicit permission flags.
const permissionsOf = (member) => {
  if (!member) return {};
  return member.role === 'owner' || member.role === 'admin' ? null : member.permissions || {};
};

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The last session this device confirmed (user + workspaces, no secrets). The app opens on it at once,
// offline included, and checks it with the server in the background.
const SESSION_CACHE = 'ascent_cached_session';
const readCachedSession = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(SESSION_CACHE) || 'null');
    return cached?.user && Array.isArray(cached.workspaces) ? cached : null;
  } catch { return null; }
};
const writeCachedSession = (user, workspaces) => {
  try { localStorage.setItem(SESSION_CACHE, JSON.stringify({ user, workspaces, at: Date.now() })); } catch { /* storage full or unavailable */ }
};
const clearCachedSession = () => {
  try { localStorage.removeItem(SESSION_CACHE); } catch { /* storage unavailable */ }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // Get queryClient - we'll use it in a child component that has access to QueryClientProvider
  // For now, we'll clear cache in logout via a callback

  const loadWorkspaces = useCallback(async (currentUser) => {
    try {
      const wsList = await ascent.workspaces.list();
      setWorkspaces(wsList);

      let activeWs = null;
      const storedWsId = localStorage.getItem('ascent_current_workspace_id');

      if (storedWsId) {
        activeWs = wsList.find(w => (w.id || w._id) === storedWsId);
      }

      if (!activeWs && wsList.length > 0) {
        activeWs = wsList[0];
      }

      // Create default workspace if user has none
      if (!activeWs && wsList.length === 0) {
        console.log('[AuthContext] No workspaces found. Creating default.');
        try {
          // Create a default workspace name
          const workspaceName = 'My Workspace';

          const newWs = await ascent.workspaces.create({ name: workspaceName });
          setWorkspaces([newWs]);
          activeWs = newWs;
        } catch (createError) {
          console.error('Failed to create default workspace:', createError);
        }
      }

      if (activeWs) {
        setCurrentWorkspace(activeWs);
        localStorage.setItem('ascent_current_workspace_id', activeWs.id || activeWs._id);

        // Determine permissions for this workspace
        const member = findMe(activeWs, currentUser);
        setPermissions(permissionsOf(member));
        if (!member) console.warn('[AuthContext] User is not a member of the active workspace');
      }
      writeCachedSession(currentUser, activeWs && !wsList.length ? [activeWs] : wsList);
    } catch (wsError) {
      // No signal: keep the workspaces and permissions this device already knows
      if (isNetworkError(wsError) && readCachedSession()) return;
      console.error('Failed to load workspaces:', wsError);
      setPermissions(null); // Fallback? Or lock out?
    }
  }, []);

  // Open on the cached session: same state a completed sign-in check would produce
  const applyCachedSession = useCallback((cached) => {
    setUser(cached.user);
    setIsAuthenticated(true);
    setWorkspaces(cached.workspaces);
    const storedWsId = localStorage.getItem('ascent_current_workspace_id');
    const ws = cached.workspaces.find((w) => (w.id || w._id) === storedWsId) || cached.workspaces[0] || null;
    setCurrentWorkspace(ws);
    if (ws) setPermissions(permissionsOf(findMe(ws, cached.user)));
    setIsLoadingAuth(false);
  }, []);

  // silent: background refresh (e.g. after saving a setting) must not flip isLoadingAuth,
  // or App swaps the whole UI for the loading screen and remounts the page.
  const checkUserAuth = useCallback(async (silent = false) => {
    const cached = readCachedSession();
    if (!silent && cached) {
      applyCachedSession(cached);
      silent = true;
    }
    try {
      if (!silent) setIsLoadingAuth(true);
      const currentUser = await ascent.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);

      // Load workspaces and permissions
      await loadWorkspaces(currentUser);

      setIsLoadingAuth(false);
    } catch (error) {
      setIsLoadingAuth(false);
      // No signal (or the server is unreachable): carry on with what this device knows
      if (isNetworkError(error) && cached) return;
      setIsAuthenticated(false);
      clearCachedSession();

      // If user auth fails, it might be an expired or invalid token
      if (error.status === 401 || error.status === 403) {
        // Clear invalid token silently - this is expected behavior
        // Don't log as error or set authError for initial auth check
        // Only set authError if we're already authenticated (token expired during session)
        if (isAuthenticated) {
          setAuthError({
            type: 'auth_required',
            message: 'Session expired. Please log in again.'
          });
        }
        // Clear the invalid token
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ascent_access_token');
        }
      } else {
        // Only log unexpected errors
        console.error('User auth check failed:', error);
        setAuthError({
          type: 'unknown',
          message: error.message || 'Authentication check failed'
        });
      }
    }
  }, [isAuthenticated, loadWorkspaces, applyCachedSession]);

  const checkAppState = useCallback(async (options) => {
    const silent = options?.silent === true;
    try {
      if (!silent) setIsLoadingAuth(true);
      setAuthError(null);

      // Skip auth check on public routes
      const pathname = window.location.pathname;
      if (isPublicRoute(pathname)) {
        // If we have a token (e.g. just logged in and about to redirect, or manually visited login),
        // don't force logout immediately. Verify the session instead.
        if (ascent.auth.isAuthenticated()) {
          console.log('[AuthContext] Public route but authenticated, verifying session...');
          await checkUserAuth(silent);
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        return;
      }

      // Check if user is authenticated by checking for token
      if (ascent.auth.isAuthenticated()) {
        await checkUserAuth(silent);
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingAuth(false);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  // Quiet background sync: picks up renames, new members, role and permission changes made by others,
  // and recovers when the caller has been removed from the workspace they are viewing.
  const refreshWorkspaces = useCallback(async () => {
    if (!user) return;

    try {
      const wsList = await ascent.workspaces.list();
      const storedWsId = localStorage.getItem('ascent_current_workspace_id');
      const updatedCurrentWs = wsList.find((w) => (w.id || w._id) === storedWsId);

      if (!updatedCurrentWs) {
        await loadWorkspaces(user);
        return;
      }

      setWorkspaces((prev) => (sameJson(prev, wsList) ? prev : wsList));
      setCurrentWorkspace((prev) => (prev && sameJson(prev, updatedCurrentWs) ? prev : updatedCurrentWs));

      const newPermissions = permissionsOf(findMe(updatedCurrentWs, user));
      setPermissions((prev) => (sameJson(prev, newPermissions) ? prev : newPermissions));
    } catch (wsError) {
      console.error('Failed to refresh workspaces:', wsError);
    }
  }, [user, loadWorkspaces]);

  const login = useCallback(async (email, password) => {
    try {
      const response = await ascent.auth.login(email, password);
      const currentUser = response.user || response;
      const isFirstLogin = response.isFirstLogin || false;

      // First login: adopt the device's language/theme (also for accounts created before sign-up sent them)
      if (isFirstLogin) {
        const prefs = systemPrefs();
        Object.assign(currentUser, prefs);
        // Saved before anything re-fetches the user, so a refresh can't bring the defaults back
        try { await ascent.auth.updateMe(prefs); } catch { /* keep the local prefs */ }
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      markUnlocked();

      // Load workspaces
      await loadWorkspaces(currentUser);

      // Store first login flag for welcome message
      if (isFirstLogin) {
        sessionStorage.setItem('showWelcomeMessage', 'true');
      }

      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'login_failed',
        message: error.message || 'Login failed'
      });
      throw error;
    }
  }, [loadWorkspaces]);

  const register = useCallback(async (email, password, full_name) => {
    try {
      const currentUser = await ascent.auth.register(email, password, full_name);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);

      // Load workspaces
      await loadWorkspaces(currentUser);

      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'registration_failed',
        message: error.message || 'Registration failed'
      });
      throw error;
    }
  }, [loadWorkspaces]);

  const loginWithGoogle = useCallback(async (credential, clientId, userInfo = null) => {
    try {
      // If userInfo is provided, we're using the OAuth2 access token flow
      // Otherwise, we're using the ID token (credential) flow
      const response = await ascent.auth.googleLogin(credential, clientId, userInfo);
      const currentUser = response.user || response;
      const isFirstLogin = response.isFirstLogin || false;

      // First login: adopt the device's language/theme (also for accounts created before sign-up sent them)
      if (isFirstLogin) {
        const prefs = systemPrefs();
        Object.assign(currentUser, prefs);
        // Saved before anything re-fetches the user, so a refresh can't bring the defaults back
        try { await ascent.auth.updateMe(prefs); } catch { /* keep the local prefs */ }
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      markUnlocked();

      // Load workspaces
      await loadWorkspaces(currentUser);

      // Store first login flag for welcome message
      if (isFirstLogin) {
        sessionStorage.setItem('showWelcomeMessage', 'true');
      }

      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'google_login_failed',
        message: error.message || 'Google login failed'
      });
      throw error;
    }
  }, [loadWorkspaces]);

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

    if (shouldRedirect) {
      ascent.auth.logout(window.location.href);
    } else {
      ascent.auth.logout();
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    ascent.auth.redirectToLogin(window.location.href);
  }, []);

  const hasPermission = useCallback((permission) => {
    // If no permissions object exists, user is owner and has all permissions
    if (!permissions) return true;
    // For shared users, check if the specific permission is granted
    return permissions?.[permission] === true;
  }, [permissions]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const ws = workspaces.find(w => (w.id || w._id) === workspaceId);
    if (ws) {
      setCurrentWorkspace(ws);
      localStorage.setItem('ascent_current_workspace_id', ws.id || ws._id);

      setPermissions(permissionsOf(findMe(ws, user)));

      // Instead of reload, we'll let the app re-render with the new workspace context
      // Components using useAuth() will see the change and re-fetch their data
    }
  }, [workspaces, user]);

  const currentMember = useMemo(() => findMe(currentWorkspace, user), [currentWorkspace, user]);
  const isWorkspaceOwner = currentMember?.role === 'owner' || sameId(currentWorkspace?.ownerId, user?.id || user?._id);

  const value = useMemo(() => ({
    currentMember,
    isWorkspaceOwner,
    user,
    setUser,
    isAuthenticated,
    permissions,
    hasPermission,
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    switchWorkspace,
    refreshWorkspaces,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    login,
    register,
    loginWithGoogle,
    loginWithPasskey,
    logout,
    navigateToLogin,
    checkAppState
  }), [
    currentMember,
    isWorkspaceOwner,
    user,
    setUser,
    isAuthenticated,
    permissions,
    hasPermission,
    workspaces,
    currentWorkspace,
    switchWorkspace,
    refreshWorkspaces,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    login,
    register,
    loginWithGoogle,
    loginWithPasskey,
    logout,
    navigateToLogin,
    checkAppState
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
