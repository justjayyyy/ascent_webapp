import { useEffect } from 'react';

const PHONE = '(max-width: 767px)';
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.55; // px per ms

/**
 * Phones: drag a bottom sheet down to close it, like a native sheet. The drag starts on the grab
 * handle, or anywhere in the sheet once its own content is scrolled to the top; past the threshold
 * (or with a quick flick) the sheet closes by pressing its close button, and it springs back otherwise.
 * `el` is the sheet element itself (state, not a ref, so this runs when the sheet actually mounts).
 */
export function useSheetDrag(el, closeRef, enabled = true) {
  useEffect(() => {
    if (!enabled || !el || !window.matchMedia?.(PHONE).matches) return undefined;

    let start = null;
    let dragging = false;
    let last = { y: 0, t: 0 };
    let velocity = 0;

    const overlay = () => el.ownerDocument.querySelector('[data-sheet-overlay][data-state="open"]');

    const reset = (animated) => {
      el.style.transition = animated ? 'transform 0.38s cubic-bezier(0.32,0.72,0,1)' : '';
      el.style.transform = '';
      const o = overlay();
      if (o) { o.style.transition = animated ? 'opacity 0.3s' : ''; o.style.opacity = ''; }
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.target;
      // Controls inside the sheet keep their own gestures (sliders, horizontal strips, text selection)
      if (t.closest?.('input[type="range"],[data-no-sheet-drag],textarea:focus')) return;
      const onHandle = e.touches[0].clientY - el.getBoundingClientRect().top < 36;
      if (!onHandle && el.scrollTop > 0) return;
      start = { y: e.touches[0].clientY, x: e.touches[0].clientX };
      last = { y: start.y, t: performance.now() };
      velocity = 0;
      dragging = false;
    };

    const onMove = (e) => {
      if (!start) return;
      const y = e.touches[0].clientY;
      const dy = y - start.y;
      const dx = Math.abs(e.touches[0].clientX - start.x);
      if (!dragging) {
        if (dy < 6 && dx < 6) return;
        if (dy <= 0 || dx > dy || el.scrollTop > 0) { start = null; return; }
        dragging = true;
        el.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault(); // this pull moves the sheet, not the page
      const now = performance.now();
      velocity = (y - last.y) / Math.max(1, now - last.t);
      last = { y, t: now };
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      const o = overlay();
      if (o) { o.style.transition = 'none'; o.style.opacity = String(Math.max(0.15, 1 - dy / (el.offsetHeight * 1.1))); }
    };

    const onEnd = () => {
      if (!start) return;
      const wasDragging = dragging;
      const dy = last.y - start.y;
      start = null;
      dragging = false;
      if (!wasDragging) return;
      if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
        // The closing animation starts from where the finger left the sheet
        el.style.transition = '';
        const o = overlay();
        if (o) { o.style.transition = ''; o.style.opacity = ''; }
        closeRef.current?.click();
      } else {
        reset(true);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [el, closeRef, enabled]);
}
