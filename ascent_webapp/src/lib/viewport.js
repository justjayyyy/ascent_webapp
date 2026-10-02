// Tracks the on-screen keyboard through the Visual Viewport API and publishes it to CSS:
//   --kb        height the keyboard covers at the bottom of the layout viewport (0 when closed)
//   --vvh       height of the part of the screen that is actually visible
//   html[data-keyboard]  set while the keyboard is up
// Bottom sheets sit on --kb and cap their height to --vvh, so a form never ends up under the keyboard;
// the dock and other bottom bars step aside while it is up.

export function trackVisualViewport() {
  if (typeof window === 'undefined' || !window.visualViewport) return;
  const vv = window.visualViewport;
  const root = document.documentElement;
  let frame = 0;

  const update = () => {
    frame = 0;
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Small differences are browser chrome sliding, not a keyboard
    const kb = covered > 80 ? Math.round(covered) : 0;
    root.style.setProperty('--kb', `${kb}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.toggleAttribute('data-keyboard', kb > 0);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  update();
}

// iOS zooms the page into any field whose text is under 16px when it takes focus, and never zooms back
// out. maximum-scale=1 stops that; iOS still lets people pinch-zoom. Other platforms don't auto-zoom, and
// there the same setting would block pinch-zoom, so it is applied on iOS only.
export function preventFocusZoom() {
  if (typeof navigator === 'undefined') return;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const meta = document.querySelector('meta[name="viewport"]');
  if (!iOS || !meta || /maximum-scale/.test(meta.content)) return;
  meta.content += ', maximum-scale=1';
}
