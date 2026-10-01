// A light tap of feedback on the moments that matter (saving, pulling to refresh, a tab change).
// Android: the Vibration API. iPhone Safari has no vibration, but toggling a native switch control
// plays the system "selection" haptic (iOS 18+), so a hidden one stands in there (it only fires inside
// a tap, so after a network wait it may stay silent). Does nothing on devices with neither.

const PATTERNS = { light: 8, selection: 6, success: [10, 40, 14], warning: [18, 60, 18], error: [24, 50, 24, 50, 24] };

let iosSwitch;
const isIOS = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function haptic(kind = 'light') {
  try {
    if (typeof window === 'undefined') return;
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind] ?? PATTERNS.light);
      return;
    }
    if (isIOS()) iosTick();
  } catch { /* feedback is a nicety */ }
}
