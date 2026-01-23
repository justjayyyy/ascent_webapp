import { useEffect, useRef, useCallback } from 'react';
import { ascent } from '@/api/client';
import { toast } from 'sonner';

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds
const WARNING_BEFORE_LOGOUT = 60 * 1000; // Show warning 1 minute before logout

export function useSessionTimeout(isAuthenticated, t = (key) => key) {
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const warningShownRef = useRef(false);

  const logout = useCallback(async () => {
    try {
      await ascent.auth.logout();
      toast.info(t('sessionExpired') || 'Session expired. Please log in again.');
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect to login even if logout fails
      localStorage.removeItem('authToken');
      window.location.href = '/Login';
    }
  }, [t]);

  const showWarning = useCallback(() => {
    if (!warningShownRef.current) {
      warningShownRef.current = true;
      toast.warning(t('sessionExpiringSoon') || 'Your session will expire in 1 minute due to inactivity.', {
        duration: 10000, // Show for 10 seconds
      });
    }
  }, [t]);

  const resetTimeout = useCallback(() => {
    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    
    // Reset warning flag
    warningShownRef.current = false;

    if (isAuthenticated) {
      // Set warning timeout (1 minute before logout)
      warningTimeoutRef.current = setTimeout(() => {
        showWarning();
      }, SESSION_TIMEOUT - WARNING_BEFORE_LOGOUT);

      // Set logout timeout
      timeoutRef.current = setTimeout(() => {
        logout();
      }, SESSION_TIMEOUT);
    }
  }, [isAuthenticated, logout, showWarning]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timeouts if not authenticated
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      return;
    }

    // Events that indicate user activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ];

    // Throttle the reset to avoid excessive calls
    let lastActivity = Date.now();
    const throttledReset = () => {
      const now = Date.now();
      // Only reset if more than 1 second has passed since last reset
      if (now - lastActivity > 1000) {
        lastActivity = now;
        resetTimeout();
      }
    };

    // Add event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, throttledReset, { passive: true });
    });

    // Initial timeout setup
    resetTimeout();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, throttledReset);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isAuthenticated, resetTimeout]);

  return { resetTimeout };
}

