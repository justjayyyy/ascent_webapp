// Radix popper collision padding takes numbers, not CSS env(), so measure the device's
// safe-area insets once and pad popovers/menus/selects away from the notch, the home
// indicator and the mobile bottom nav.
let cached;

const measure = () => {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--safe-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const inset = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return inset;
};

export function popperCollisionPadding() {
  if (!cached) {
    const { top, bottom } = measure();
    const mobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
    // 64px mobile header and bottom nav sit above the page inside the safe area
    cached = { top: top + (mobile ? 64 : 0) + 8, bottom: bottom + (mobile ? 64 : 0) + 8, left: 8, right: 8 };
  }
  return cached;
}

const readEnvTop = () => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
};

// Some iOS versions report env(safe-area-inset-top) as 0 in a home-screen app (at
// launch, after resume, or after rotating back) even though the page runs under the
// notch / Dynamic Island. Re-measure on every lifecycle event and, for a notched iPhone
// in portrait, fall back to a typical status-bar height so the header, dialogs and pages
// never sit under it. Landscape has no top cut-out, so the fallback is dropped there.
export function ensureStandaloneTopInset() {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const apply = () => {
    const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const iphone = /iPhone/.test(navigator.userAgent);
    const portrait = window.innerHeight > window.innerWidth;
    const notched = Math.max(screen.width, screen.height) >= 812;
    root.style.removeProperty('--safe-top');
    if (!standalone || !iphone || !portrait || !notched) return;
    if (readEnvTop() < 20) root.style.setProperty('--safe-top', 'calc(47px + 0.5rem)');
  };
  const run = () => { cached = undefined; apply(); };
  const start = () => { run(); requestAnimationFrame(run); setTimeout(run, 400); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('orientationchange', () => setTimeout(run, 150));
  window.addEventListener('resize', run);
  window.addEventListener('pageshow', run);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
}
