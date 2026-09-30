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


const readEnv = (side) => {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;padding-top:env(safe-area-inset-${side})`;
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
};

// The installed iPhone app can end up drawn under the status bar / notch even though
// env(safe-area-inset-top) says 0 (it depends on iOS version, status-bar style and the
// launch state). Ignore what env() claims and look at the geometry instead: when the page
// fills the whole physical screen in portrait, the status bar is on top of it, so reserve
// its height. When the page starts below an opaque status bar the viewport is shorter than
// the screen and nothing is added, so this never double-pads.
export function ensureStandaloneTopInset() {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const apply = () => {
    const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const iphone = /iPhone/.test(navigator.userAgent);
    const portrait = window.innerHeight > window.innerWidth;
    const long = Math.max(screen.width, screen.height);
    const envTop = readEnv('top');
    const fullScreen = window.innerHeight >= long - 12;
    let top = null;
    // env() > 0 means the page really runs under the status bar. That reading is
    // stable; the viewport height is not (it shifts while scrolling), so only fall
    // back to the geometry check when env() claims 0.
    if (standalone && iphone && portrait && (envTop >= 20 || fullScreen)) {
      // The system draws a soft edge a little below the status bar, so keep content
      // clear of it: the real inset (or a typical one if iOS reports 0) plus a margin.
      const base = envTop >= 20 ? envTop : long >= 930 ? 59 : long >= 850 ? 54 : long >= 812 ? 47 : 20;
      top = base;
      root.style.setProperty('--safe-top', `${base + 8}px`);
    } else {
      root.style.removeProperty('--safe-top');
    }
    const header = document.querySelector('.fixed.top-0.z-50');
    const hr = header?.getBoundingClientRect();
    const scripts = [...document.scripts].map((x) => x.src).find((u) => /assets\/index-/.test(u)) || '';
    renderDebug({ build: scripts.split('index-')[1] || '?', bodyBg: getComputedStyle(document.body).backgroundColor, headerBg: header ? (header.style.background || '').slice(0, 40) : 'none', headerTop: hr ? Math.round(hr.top) : '-', headerH: hr ? Math.round(hr.height) : '-', cssSafeTop: getComputedStyle(root).getPropertyValue('--safe-top') || 'env', standalone, iphone, portrait, envTop, inner: `${window.innerWidth}x${window.innerHeight}`, screen: `${screen.width}x${screen.height}`, fullScreen, applied: top });
  };
  const run = () => { cached = undefined; apply(); };
  const start = () => { run(); requestAnimationFrame(run); setTimeout(run, 400); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('orientationchange', () => setTimeout(run, 150));
  window.addEventListener('ascent:safe-refresh', run);
  window.addEventListener('pageshow', run);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
}

// Open the app once with ?safedebug=1 to show what the device reports (stays on until ?safedebug=0)
function renderDebug(info) {
  let on = false;
  try {
    const q = new URLSearchParams(location.search).get('safedebug');
    if (q === '1') localStorage.setItem('ascent_safedebug', '1');
    if (q === '0') localStorage.removeItem('ascent_safedebug');
    on = localStorage.getItem('ascent_safedebug') === '1';
  } catch { /* storage unavailable */ }
  let el = document.getElementById('safe-debug');
  if (!on) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('pre');
    el.id = 'safe-debug';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;margin:0;padding:6px 8px;font:10px/1.3 monospace;color:#0f0;background:rgba(0,0,0,.85);border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:70vw';
    document.body.appendChild(el);
  }
  el.textContent = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n');
}

// Installed iPhone apps keep their own storage and always open at "/", so a URL flag can't
// reach them. Tap five times quickly in the top strip of the screen to toggle the readout.
if (typeof window !== 'undefined') {
  let taps = [];
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t || t.clientY > 140) return;
    const now = Date.now();
    taps = [...taps.filter((x) => now - x < 2500), now];
    if (taps.length >= 5) {
      taps = [];
      try {
        if (localStorage.getItem('ascent_safedebug') === '1') localStorage.removeItem('ascent_safedebug');
        else localStorage.setItem('ascent_safedebug', '1');
      } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event('ascent:safe-refresh'));
    }
  }, { passive: true });
}
