import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ScanFace, Fingerprint, KeyRound, Loader2, CloudOff } from 'lucide-react';
import AscentLogo from '@/components/AscentLogo';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { getLockPrefs, rememberCredential, unlockOnDevice, biometricName, biometricKind, markUnlocked, unlockedThisSession } from '@/lib/appLock';
import { isOnline, isNetworkError, useOnline } from '@/lib/offline/network';
import { haptic } from '@/lib/haptics';

const IDLE_MS = 10 * 60 * 1000;

const LockContext = createContext({ enabled: false, locked: false, lockNow: () => {} });
export const useAppLock = () => useContext(LockContext);

/**
 * Face ID lock. When turned on for this device (Settings > Security), the app locks when it is opened
 * fresh, after it has been in the background for the chosen time, and after ten idle minutes, and the
 * money underneath stays blurred until Face ID / the fingerprint confirms it is the owner. It replaces
 * the sign-out after inactivity, so a quick check-in no longer means typing a password.
 */
export function AppLockProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const [prefs, setPrefs] = useState(() => getLockPrefs(userId));
  const enabled = !!userId && prefs.enabled;
  const [locked, setLocked] = useState(() => enabled && !unlockedThisSession());
  const hiddenAt = useRef(null);

  useEffect(() => {
    const read = () => setPrefs(getLockPrefs(userId));
    read();
    window.addEventListener('ascent:lock-prefs', read);
    return () => window.removeEventListener('ascent:lock-prefs', read);
  }, [userId]);

  const lockNow = useCallback(() => { if (enabled) setLocked(true); }, [enabled]);

  // Background: lock on return once the chosen time has passed; blur the app while it is away so the
  // app switcher's snapshot shows no figures
  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        root.setAttribute('data-privacy-curtain', '');
      } else {
        root.removeAttribute('data-privacy-curtain');
        if (hiddenAt.current && Date.now() - hiddenAt.current >= prefs.after * 1000) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeAttribute('data-privacy-curtain');
    };
  }, [enabled, prefs.after]);

  // Foreground: lock after ten idle minutes
  useEffect(() => {
    if (!enabled || locked) return undefined;
    let timer;
    let last = 0;
    const arm = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => setLocked(true), IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [enabled, locked]);

  // Nothing behind the lock can be reached with the keyboard or a screen reader
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    root.inert = locked;
    return () => { root.inert = false; };
  }, [locked]);

  const onUnlocked = useCallback(() => {
    markUnlocked();
    setLocked(false);
  }, []);

  const value = useMemo(() => ({ enabled, locked, lockNow, prefs }), [enabled, locked, lockNow, prefs]);

  return (
    <LockContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>{locked && enabled && <LockScreen key="lock" userId={userId} onUnlocked={onUnlocked} />}</AnimatePresence>,
        document.body,
      )}
    </LockContext.Provider>
  );
}

function LockScreen({ userId, onUnlocked }) {
  const { t, user } = useTheme();
  const { loginWithPasskey, logout } = useAuth();
  const online = useOnline();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tried = useRef(false);
  const method = biometricName(t);
  const MethodIcon = { face: ScanFace, fingerprint: Fingerprint, key: KeyRound }[biometricKind()];
  const firstName = (user?.full_name || '').split(' ')[0];

  const unlock = useCallback(async ({ auto = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      if (isOnline()) {
        try {
          const result = await loginWithPasskey();
          rememberCredential(userId, result.credentialId);
          // Someone else's passkey on a shared device: the app now belongs to that account
          const id = result.user?.id || result.user?._id;
          if (id && String(id) !== String(userId)) { markUnlocked(); window.location.reload(); return; }
        } catch (err) {
          if (!isNetworkError(err)) throw err;
          await unlockOnDevice(userId);
        }
      } else {
        await unlockOnDevice(userId);
      }
      haptic('success');
      onUnlocked();
    } catch (err) {
      // A cancelled prompt is not an error worth shouting about, and an automatic first try may be
      // refused by the browser for lack of a tap
      const cancelled = err?.name === 'NotAllowedError' || err?.name === 'AbortError';
      if (!auto) {
        haptic('error');
        setError(cancelled ? 'lockCancelled' : 'lockFailed');
      }
    } finally {
      setBusy(false);
    }
  }, [loginWithPasskey, onUnlocked, userId]);

  // Offer Face ID as soon as the lock appears
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const id = setTimeout(() => unlock({ auto: true }), 350);
    return () => clearTimeout(id);
  }, [unlock]);

  const ease = [0.32, 0.72, 0, 1];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      className="fixed inset-0 z-[200] grid place-items-center overflow-hidden px-6"
      initial={{ opacity: 0, backdropFilter: 'blur(0px) saturate(100%)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(28px) saturate(140%)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px) saturate(100%)' }}
      transition={{ duration: reduce ? 0 : 0.45, ease }}
      style={{ WebkitBackdropFilter: 'blur(28px) saturate(140%)' }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-background/70" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(55%_40%_at_50%_38%,hsl(var(--glow)/0.2),transparent_72%)]" />

      <motion.div
        className="relative flex w-full max-w-xs flex-col items-center text-center"
        initial={reduce ? false : { y: 24, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={reduce ? undefined : { scale: 1.08, filter: 'blur(8px)' }}
        transition={{ duration: 0.5, ease }}
      >
        <AscentLogo motion="none" className="w-20" />
        <h1 id="lock-title" className="mt-6 text-2xl font-bold tracking-tight text-balance">{t('lockTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
          {firstName ? t('lockGreeting').replace('{name}', firstName) : t('lockGreetingAnon')}
        </p>

        <button
          type="button"
          onClick={() => unlock()}
          disabled={busy}
          className="mt-9 inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground shadow-[0_14px_34px_-12px_hsl(var(--glow)/0.8)] outline-none transition-transform active:scale-[0.97] disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <MethodIcon className="h-6 w-6" aria-hidden="true" />}
          {t('lockUnlockWith').replace('{method}', method)}
        </button>

        <p className="mt-3 min-h-5 text-sm text-danger" aria-live="polite">{error ? t(error) : ''}</p>

        {!online && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs text-muted-foreground">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> {t('lockOffline')}
          </p>
        )}

        <button
          type="button"
          onClick={() => logout(false)}
          className="mt-6 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('lockUsePassword')}
        </button>
      </motion.div>
    </motion.div>
  );
}
