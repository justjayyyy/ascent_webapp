import React, { createContext, useState, useContext, useEffect } from 'react';
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
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  
  // Get queryClient - we'll use it in a child component that has access to QueryClientProvider
  // For now, we'll clear cache in logout via a callback

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      
      // Skip auth check on public routes
      const pathname = window.location.pathname;
      if (isPublicRoute(pathname)) {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
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
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await ascent.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
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
  };

  const login = async (email, password) => {
    try {
      const currentUser = await ascent.auth.login(email, password);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'login_failed',
        message: error.message || 'Login failed'
      });
      throw error;
    }
  };

  const register = async (email, password, full_name) => {
    try {
      const currentUser = await ascent.auth.register(email, password, full_name);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'registration_failed',
        message: error.message || 'Registration failed'
      });
      throw error;
    }
  };

  const loginWithGoogle = async (credential, clientId, userInfo = null) => {
    try {
      // If userInfo is provided, we're using the OAuth2 access token flow
      // Otherwise, we're using the ID token (credential) flow
      const currentUser = await ascent.auth.googleLogin(credential, clientId, userInfo);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      setAuthError({
        type: 'google_login_failed',
        message: error.message || 'Google login failed'
      });
      throw error;
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      ascent.auth.logout(window.location.href);
    } else {
      ascent.auth.logout();
    }
  };

  const navigateToLogin = () => {
    ascent.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
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
    }}>
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
