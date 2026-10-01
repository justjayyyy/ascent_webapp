import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'motion/react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const TRIGGER = 72;
const MAX = 110;

// Nothing that scrolls on its own (a chip strip, a sheet, a chart) should start a refresh
const insideScroller = (el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.closest?.('[role="dialog"],[data-no-ptr]')) return true;
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
  }
  return false;
};

/**
 * Phones: pull the page down from the top to refresh everything on screen. The installed app turns the
 * browser's own pull-to-refresh off (overscroll-behavior), so this puts it back, app-style: a disc that
 * follows the finger, turns into an arrow past the threshold, and a tick of haptic feedback.
 */
export default function PullToRefresh({ disabled, label, children }) {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const [state, setState] = useState('idle'); // idle | pulling | armed | refreshing
  const start = useRef(null);
  const armed = useRef(false);

  const indicatorY = useTransform(y, (v) => Math.min(v, MAX) - 44);
  const rotate = useTransform(y, [0, TRIGGER], [0, 180]);
  const opacity = useTransform(y, [0, 28, TRIGGER], [0, 0.7, 1]);
  const scale = useTransform(y, [0, TRIGGER], [0.6, 1]);

  useEffect(() => {
    if (disabled) return undefined;
    const onStart = (e) => {
      if (window.innerWidth >= 768 || e.touches.length !== 1 || window.scrollY > 0 || state === 'refreshing') return;
      if (insideScroller(e.target)) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      armed.current = false;
    };
    const onMove = (e) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || window.scrollY > 0 || dx > dy) { start.current = null; y.set(0); setState('idle'); return; }
      const pulled = Math.min(MAX, dy * 0.5);
      y.set(pulled);
      const nowArmed = pulled >= TRIGGER;
      if (nowArmed !== armed.current) {
        armed.current = nowArmed;
        if (nowArmed) haptic('selection');
        setState(nowArmed ? 'armed' : 'pulling');
      }
    };
    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      if (armed.current) {
        armed.current = false;
        setState('refreshing');
        haptic('light');
        animate(y, 56, { duration: 0.2 });
        await Promise.all([
          queryClient.refetchQueries({ type: 'active' }),
          new Promise((r) => setTimeout(r, 450)), // long enough to read as a refresh
        ]).catch(() => {});
        setState('idle');
      } else {
        setState('idle');
      }
      animate(y, 0, reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 });
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, state, y, queryClient, reduce]);

  const refreshing = state === 'refreshing';

  return (
    <>
      <motion.div
        aria-hidden={!refreshing}
        role="status"
        aria-label={refreshing ? label : undefined}
        style={{ y: indicatorY, opacity: refreshing ? 1 : opacity, scale: refreshing ? 1 : scale }}
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center md:hidden"
      >
        <span
          className={cn(
            'mt-[calc(var(--header-total)+var(--safe-top))] grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-popover text-primary',
            'shadow-[0_10px_26px_-12px_hsl(0_0%_0%/0.7)] transition-colors',
            state === 'armed' && 'bg-primary text-primary-foreground',
          )}
        >
          {refreshing
            ? <Loader2 className="h-[18px] w-[18px] animate-spin" />
            : <motion.span style={{ rotate }} className="grid place-items-center"><ArrowDown className="h-[18px] w-[18px]" /></motion.span>}
        </span>
      </motion.div>
      <motion.div style={{ y }}>{children}</motion.div>
    </>
  );
}
