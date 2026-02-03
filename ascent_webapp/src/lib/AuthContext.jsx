import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { ascent } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

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
        const member = activeWs.members.find(m =>
          (m.userId && (m.userId === currentUser.id || m.userId === currentUser._id)) ||
          m.email === currentUser.email
        );

        if (member) {
          console.log(`[AuthContext] Active Workspace: ${activeWs.name}, Role: ${member.role}`);
          if (member.role === 'owner' || member.role === 'admin') {
            setPermissions(null); // Full access
          } else {
            setPermissions(member.permissions || {});
          }
        } else {
          console.warn('[AuthContext] User is not a member of the active workspace?');
          setPermissions({}); // No access?
        }
      }
    } catch (wsError) {
      console.error('Failed to load workspaces:', wsError);
      setPermissions(null); // Fallback? Or lock out?
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await ascent.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);

      // Load workspaces and permissions
      await loadWorkspaces(currentUser);

      setIsLoadingAuth(false);
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

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
  }, [isAuthenticated, loadWorkspaces]);

  const checkAppState = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      // Skip auth check on public routes
      const pathname = window.location.pathname;
      if (isPublicRoute(pathname)) {
        // If we have a token (e.g. just logged in and about to redirect, or manually visited login),
        // don't force logout immediately. Verify the session instead.
        if (ascent.auth.isAuthenticated()) {
          console.log('[AuthContext] Public route but authenticated, verifying session...');
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        return;
      }

      // Check if user is authenticated by checking for token
      if (ascent.auth.isAuthenticated()) {
        await checkUserAuth();
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

  const refreshWorkspaces = useCallback(async () => {
    if (!user) return;

    try {
      console.log('[AuthContext] Fetching updated workspaces...');
      const wsList = await ascent.workspaces.list();

      // Find and update only the current workspace without triggering full workspaces update
      const storedWsId = localStorage.getItem('ascent_current_workspace_id');
      const updatedCurrentWs = wsList.find(w => (w.id || w._id) === storedWsId);

      if (updatedCurrentWs) {
        // Update current workspace members only (most surgical update possible)
        setCurrentWorkspace(prevWs => {
          if (!prevWs) return updatedCurrentWs;

          // Deep compare only the members array
          const membersChanged = JSON.stringify(prevWs.members) !== JSON.stringify(updatedCurrentWs.members);

          if (membersChanged) {
            console.log('[AuthContext] Members changed, updating only members array');
            // Return a new object but preserve other properties to minimize re-renders
            return { ...prevWs, members: updatedCurrentWs.members };
          }

          console.log('[AuthContext] No member changes, keeping current workspace reference');
          return prevWs;
        });

        // Update workspaces list (less frequently accessed, so lower priority)
        setWorkspaces(prevWorkspaces => {
          // Find and update only the changed workspace in the list
          const wsIndex = prevWorkspaces.findIndex(w => (w.id || w._id) === storedWsId);
          if (wsIndex !== -1) {
            const needsUpdate = JSON.stringify(prevWorkspaces[wsIndex].members) !== JSON.stringify(updatedCurrentWs.members);
            if (needsUpdate) {
              console.log('[AuthContext] Updating workspace in list');
              const newWorkspaces = [...prevWorkspaces];
              newWorkspaces[wsIndex] = updatedCurrentWs;
              return newWorkspaces;
            }
          }
          return prevWorkspaces;
        });

        // Update permissions for current user in this workspace
        const member = updatedCurrentWs.members.find(m =>
          (m.userId && (m.userId === user.id || m.userId === user._id)) ||
          m.email === user.email
        );

        if (member) {
          const newPermissions = (member.role === 'owner' || member.role === 'admin')
            ? null
            : (member.permissions || {});

          // Only update permissions if they actually changed
          setPermissions(prevPerms => {
            if (JSON.stringify(prevPerms) !== JSON.stringify(newPermissions)) {
              console.log('[AuthContext] Permissions changed, updating state');
              return newPermissions;
            }
            console.log('[AuthContext] No permission changes');
            return prevPerms;
          });
        }
      }
    } catch (wsError) {
      console.error('Failed to refresh workspaces:', wsError);
    }
  }, [user]);

  const login = useCallback(async (email, password) => {
    try {
      const response = await ascent.auth.login(email, password);
      const currentUser = response.user || response;
      const isFirstLogin = response.isFirstLogin || false;

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);

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

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);

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

      // Reload permissions
      const member = ws.members.find(m =>
        (m.userId && (m.userId === user.id || m.userId === user._id)) ||
        m.email === user.email
      );

      if (member) {
        if (member.role === 'owner' || member.role === 'admin') {
          setPermissions(null);
        } else {
          setPermissions(member.permissions || {});
        }
      }

      // Instead of reload, we'll let the app re-render with the new workspace context
      // Components using useAuth() will see the change and re-fetch their data
    }
  }, [workspaces, user]);

  const value = useMemo(() => ({
    user,
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
    logout,
    navigateToLogin,
    checkAppState
  }), [
    user,
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
