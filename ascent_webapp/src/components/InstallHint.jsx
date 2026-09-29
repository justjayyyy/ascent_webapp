import React, { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

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

// Shows a one-time "Add to Home Screen" hint on iOS Safari (no install prompt API exists there)
export default function InstallHint() {
  const { t, colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (isIosSafari() && !isStandalone() && localStorage.getItem(DISMISS_KEY) !== '1') {
        setVisible(true);
      }
    } catch {
      /* storage unavailable: don't show */
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div
      role="status"
      className={cn(
        'fixed inset-x-3 z-50 flex items-start gap-3 rounded-xl border p-3 shadow-lg backdrop-blur',
        'bottom-[calc(1rem+env(safe-area-inset-bottom))] md:hidden',
        colors.cardBg, colors.cardBorder
      )}
    >
      <Share className={cn('mt-0.5 h-5 w-5 shrink-0', colors.accentText)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', colors.textPrimary)}>{t('installTitle')}</p>
        <p className={cn('text-xs', colors.textTertiary)}>{t('installHintIos')}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label={t('installDismiss')} className={cn('p-1', colors.textTertiary)}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
