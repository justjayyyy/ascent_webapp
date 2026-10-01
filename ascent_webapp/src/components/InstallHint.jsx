import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Share, X, Download } from 'lucide-react';
import { useTheme } from './ThemeProvider';

const DISMISS_KEY = 'ascent_install_hint_dismissed';

const isIosSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
};

const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

const dismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return true; }
};

// Chrome and Edge fire this early; keep it so the card can open the real install dialog later
let deferredPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new Event('ascent:installable'));
  });
}

/**
 * Phones, in the browser: a one-time card that turns the site into an app. Android and desktop Chrome
 * get a real Install button (the browser's own dialog); iPhone Safari, which has no such dialog, gets
 * the Share > Add to Home Screen steps. Sits above the dock.
 */
export default function InstallHint() {
  const { t } = useTheme();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState(null); // 'ios' | 'prompt' | null

  useEffect(() => {
    if (isStandalone() || dismissed()) return undefined;
    if (isIosSafari()) { setMode('ios'); return undefined; }
    const ready = () => { if (deferredPrompt && !dismissed()) setMode('prompt'); };
    ready();
    window.addEventListener('ascent:installable', ready);
    const installed = () => setMode(null);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('ascent:installable', ready);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setMode(null);
  };

  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    deferredPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') setMode(null);
    else dismiss();
  };

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed inset-x-3 bottom-[calc(var(--dock-space)+0.25rem)] z-40 flex items-center gap-3 rounded-3xl border border-border/70 bg-popover/95 p-3 ps-4 shadow-[0_18px_40px_-18px_hsl(0_0%_0%/0.75)] backdrop-blur-xl md:inset-x-auto md:bottom-6 md:end-6 md:w-96"
        >
          {mode === 'ios'
            ? <Share className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            : <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t('installTitle')}</p>
            <p className="text-xs text-muted-foreground text-pretty">{mode === 'ios' ? t('installHintIos') : t('installHintPrompt')}</p>
          </div>
          {mode === 'prompt' && (
            <button
              type="button"
              onClick={install}
              className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('installAction')}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('installDismiss')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
