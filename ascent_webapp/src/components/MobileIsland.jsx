import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from '@/lib/motion';
import { CalendarDays } from 'lucide-react';
import AscentLogo from '@/components/AscentLogo';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 };
const COMPACT_WIDTH = 156;
const SIDE_GUTTER = 24; // 12px each side

const useViewportWidth = () => {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 393 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return w;
};

// Size of an element, kept current through the morph (the capsule's width animates)
const useSize = (ref) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.target.getBoundingClientRect();
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

// Capsule outline that starts at the top centre, runs clockwise and carries on 10px past its own
// start (an open path, not Z) so the finished ring overlaps itself and leaves no seam
const capsulePath = (w, h, inset) => {
  const r = h / 2 - inset;
  const left = inset;
  const right = w - inset;
  const top = inset;
  const bottom = h - inset;
  const cx = w / 2;
  return `M ${cx} ${top} H ${right - r} A ${r} ${r} 0 0 1 ${right - r} ${bottom} H ${left + r} A ${r} ${r} 0 0 1 ${left + r} ${top} H ${cx + 10}`;
};

/**
 * Phone header, "the island": a capsule that hangs below the status bar and morphs with the page.
 * Expanded: menu, logo + current page, calendar. Scrolling down morphs it (spring) into a small
 * capsule; scrolling up expands it again. Page scroll progress is drawn as a gold line that traces
 * the whole outline of the capsule, starting at the top centre. Nothing tappable sits in the
 * system blur zone.
 */
export default function MobileIsland({ compact, menuOpen, onMenu, onCalendar, title, t }) {
  const reduce = useReducedMotion();
  const viewport = useViewportWidth();
  const shell = useRef(null);
  const { w, h } = useSize(shell);
  const { scrollYProgress } = useScroll();
  // The ring closes a little before the very bottom (iOS never reports exactly 1 at the end) and
  // overlaps its own start by ~1% so the seam at the top centre is fully covered,
  // and stays invisible at the top instead of drawing a dot.
  const scaled = useTransform(scrollYProgress, [0, 0.98], [0, 1], { clamp: true });
  const progress = useSpring(scaled, { stiffness: 260, damping: 40, restDelta: 0.0005 });
  const ringOpacity = useTransform(progress, [0, 0.03], [0, 1], { clamp: true });
  const isCompact = compact && !menuOpen;
  const spring = reduce ? { duration: 0 } : SPRING;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center md:hidden"
      style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}
    >
      <motion.div
        ref={shell}
        initial={false}
        animate={{ width: isCompact ? COMPACT_WIDTH : viewport - SIDE_GUTTER }}
        transition={spring}
        className="pointer-events-auto relative h-[var(--header-bar)] rounded-full border border-border/70 bg-card shadow-[0_14px_34px_-16px_hsl(var(--glow)/0.5),0_8px_22px_-14px_hsl(0_0%_0%/0.8)]"
      >
        <div className="relative flex h-full w-full items-center overflow-hidden rounded-full">
          <button
            type="button"
            onClick={onMenu}
            aria-label={t('menu')}
            aria-expanded={menuOpen}
            className={cn(
              'relative z-10 ms-1 grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors',
              'active:bg-foreground/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              menuOpen ? 'text-primary' : 'text-foreground',
            )}
          >
            <span className="relative block h-3.5 w-[18px]" aria-hidden="true">
              <span className={cn('absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300', menuOpen ? 'top-1.5 rotate-45' : 'top-0')} />
              <span className={cn('absolute inset-x-0 top-1.5 h-0.5 rounded-full bg-current transition-opacity duration-200', menuOpen && 'opacity-0')} />
              <span className={cn('absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300', menuOpen ? 'top-1.5 -rotate-45' : 'top-3')} />
            </span>
          </button>

          {/* Centre: logo, plus the current page when expanded */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5">
            <motion.div layout transition={spring}>
              <AscentLogo motion="full" alt="Ascent logo" className={isCompact ? 'w-9' : 'w-11'} />
            </motion.div>
            <AnimatePresence mode="popLayout" initial={false}>
              {!isCompact && (
                <motion.span
                  key={title}
                  initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                  transition={{ duration: reduce ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="max-w-[9rem] truncate text-sm font-semibold tracking-tight text-foreground"
                >
                  {title}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Calendar shortcut, only when there is room */}
          <AnimatePresence initial={false}>
            {!isCompact && (
              <motion.button
                key="cal"
                type="button"
                onClick={onCalendar}
                aria-label={t('calendar')}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={spring}
                className="relative z-10 me-1 ms-auto grid h-12 w-12 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-foreground/[0.1] active:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CalendarDays className="h-5 w-5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Scroll progress: a gold line tracing the whole outline of the capsule */}
        {w > 0 && (
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${w} ${h}`}
            className="pointer-events-none absolute -left-px -top-px overflow-visible"
            style={{ width: w, height: h }}
          >
            <motion.path
              d={capsulePath(w, h, 1)}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ pathLength: progress, opacity: ringOpacity, filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.7))' }}
            />
          </svg>
        )}
      </motion.div>
    </div>
  );
}
