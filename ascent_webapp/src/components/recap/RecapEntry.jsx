import React, { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Play, X } from 'lucide-react';
import BlurValue from '@/components/BlurValue';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'ascent_recap_seen';

const readSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
};

/** Which months' recaps this device has already watched (or dismissed). */
export function useRecapSeen() {
  const [seen, setSeen] = useState(readSeen);
  const markSeen = useCallback((key) => {
    setSeen((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev).add(key);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-24))); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  return { seen, markSeen };
}

/**
 * The way into a month's recap: a round button with a story ring, lit while there is an unwatched
 * recap. Sits next to the month switcher.
 */
export function RecapRingButton({ onOpen, fresh, label }) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full text-sm font-semibold outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring sm:pe-4 sm:ps-1"
    >
      <span className="relative grid h-9 w-9 place-items-center">
        <motion.span
          aria-hidden="true"
          className={cn('absolute inset-0 rounded-full', !fresh && 'opacity-40')}
          style={{ background: 'conic-gradient(from 200deg, hsl(var(--primary)), hsl(var(--chart-2)), hsl(var(--chart-3)), hsl(var(--primary)))' }}
          animate={fresh && !reduce ? { rotate: 360 } : { rotate: 0 }}
          transition={fresh && !reduce ? { duration: 6, ease: 'linear', repeat: Infinity } : { duration: 0 }}
        />
        <span className="absolute inset-[2.5px] rounded-full bg-background" aria-hidden="true" />
        <Play className="relative h-3.5 w-3.5 fill-current text-primary rtl:-scale-x-100" aria-hidden="true" />
      </span>
      {/* Phones: just the ring, the label is for screen readers */}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

/**
 * First week of a month: last month's recap is ready. A quiet card with the one number that matters,
 * a button to watch, and a way to put it away.
 */
export function RecapBanner({ monthName, recap, onOpen, onDismiss, t, fmt, blur }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/70 p-5 backdrop-blur-xl"
      aria-labelledby="recap-banner-title"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_0%,hsl(var(--glow)/0.22),transparent_60%)] rtl:bg-[radial-gradient(80%_120%_at_100%_0%,hsl(var(--glow)/0.22),transparent_60%)]" />
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('rcDismiss')}
        className="absolute end-2 top-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="relative flex flex-wrap items-center gap-4 pe-8">
        <div className="min-w-0 flex-1">
          <h2 id="recap-banner-title" className="text-lg font-semibold tracking-tight text-balance">
            {t('rcReady').replace('{month}', monthName)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {recap.net >= 0 ? t('rcBannerKept') : t('rcBannerOver')}{' '}
            <span className={cn('font-semibold tabular-nums', recap.net >= 0 ? 'text-success' : 'text-danger')} dir="ltr">
              <BlurValue blur={blur}>{fmt(Math.abs(recap.net))}</BlurValue>
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_-10px_hsl(var(--glow)/0.8)] outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Play className="h-4 w-4 fill-current rtl:-scale-x-100" aria-hidden="true" />
          {t('rcWatch')}
        </button>
      </div>
    </motion.section>
  );
}
