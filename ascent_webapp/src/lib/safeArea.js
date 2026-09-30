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

