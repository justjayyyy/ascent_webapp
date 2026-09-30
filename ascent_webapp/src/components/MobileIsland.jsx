import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
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

/**
 * Phone header, "the island": a capsule that hangs below the status bar and morphs with the page.
 * Expanded: menu, logo + current page, calendar. Scrolling down morphs it (spring) into a small
 * capsule; scrolling up expands it again. A gold light orbits its edge and a hairline along the
 * bottom fills with the page's scroll progress. Nothing tappable sits in the system blur zone.
 */
export default function MobileIsland({ compact, menuOpen, onMenu, onCalendar, title, t }) {
  const reduce = useReducedMotion();
  const viewport = useViewportWidth();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 });
  const isCompact = compact && !menuOpen;
  const spring = reduce ? { duration: 0 } : SPRING;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center md:hidden"
      style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}
    >
      <motion.div
        initial={false}
        animate={{ width: isCompact ? COMPACT_WIDTH : viewport - SIDE_GUTTER }}
        transition={spring}
        className="pointer-events-auto relative h-[var(--header-bar)] overflow-hidden rounded-full p-px shadow-[0_14px_34px_-16px_hsl(var(--glow)/0.55),0_8px_22px_-14px_hsl(0_0%_0%/0.8)]"
      >
        {/* Orbiting light along the edge */}
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 aspect-square w-[260%] -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'conic-gradient(from 0deg, hsl(var(--border) / 0.7) 0 55%, hsl(var(--primary) / 0.95) 78%, hsl(var(--border) / 0.7) 100%)' }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 7, ease: 'linear', repeat: Infinity }}
        />

        <div className="relative flex h-full w-full items-center overflow-hidden rounded-full bg-card">
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

          {/* Scroll progress hairline */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-8 bottom-0 h-[2px] origin-left rounded-full bg-primary/80 rtl:origin-right"
            style={{ scaleX: progress }}
          />
        </div>
      </motion.div>
    </div>
  );
}
