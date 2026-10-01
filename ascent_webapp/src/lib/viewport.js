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
