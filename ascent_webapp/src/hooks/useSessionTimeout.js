import { useEffect, useRef, useCallback } from 'react';
import { ascent } from '@/api/client';
import { toast } from 'sonner';

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds
const WARNING_BEFORE_LOGOUT = 60 * 1000; // Show warning 1 minute before logout

/**
 * Signs out after SESSION_TIMEOUT without activity. `mustWait()` true (changes on this device not synced
 * yet) puts it off: signing out would throw those changes away.
 */
export function useSessionTimeout(isAuthenticated, t = (key) => key, mustWait = () => false) {
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const warningShownRef = useRef(false);

  // auth.logout never throws: it forgets this device's session and data and goes to /login
  const logout = useCallback(() => {
    toast.info(t('sessionExpired'));
    ascent.auth.logout();
  }, [t]);

  const showWarning = useCallback(() => {
    if (!warningShownRef.current) {
      warningShownRef.current = true;
      toast.warning(t('sessionExpiringSoon'), {
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
      const expire = () => {
        if (mustWait()) { timeoutRef.current = setTimeout(expire, WARNING_BEFORE_LOGOUT); return; }
        logout();
      };
      timeoutRef.current = setTimeout(expire, SESSION_TIMEOUT);
    }
  }, [isAuthenticated, logout, showWarning, mustWait]);

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

