import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { X, Pause, Play, Share2, RotateCcw, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import AscentLogo from '@/components/AscentLogo';
import BlurValue from '@/components/BlurValue';
import { translateCategory } from '@/lib/translations';
import { buildRecap } from '@/lib/recap';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { shareRecapCard } from './shareCard';

const DURATION = 6500;
const EASE = [0.22, 1, 0.36, 1];
// Each story gets its own light: a series colour from the palette, so every theme has its own recap
const ACCENTS = ['--primary', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-1', '--chart-2', '--chart-3', '--primary'];

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 22, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, delay: 0.12 + i * 0.12, ease: EASE } },
});

/**
 * The Monthly Recap: a month of the household's money as full-screen stories. Tap the far side to go
 * on, the near side to go back, hold to pause, swipe down or press Escape to leave. The last story
 * makes a card to send (only percentages when the "blur values" privacy setting is on).
 */
export default function RecapStories({ open, onClose, month, rows, members, t, language, isRTL, currency, blur }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <Player key="recap" onClose={onClose} month={month} rows={rows} members={members} t={t}
          language={language} isRTL={isRTL} currency={currency} blur={blur} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Player({ onClose, month, rows, members, t, language, isRTL, currency, blur }) {
  const reduce = useReducedMotion();
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const recap = useMemo(() => buildRecap({ rows, month, members }), [rows, month, members]);
  const monthName = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long' }).format(month), [locale, month]);
  const monthYear = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month), [locale, month]);
  const prevName = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(month.getFullYear(), month.getMonth() - 1, 1)), [locale, month]);

  const fmt = useCallback((v, digits = 0) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits }).format(v || 0), [locale, currency]);
  const pct = useCallback((v) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v || 0), [locale]);
  const cat = useCallback((k) => translateCategory(k, language), [language]);
  const Money = useCallback(({ value, className }) => (
    blur ? <BlurValue blur className={className} /> : (
      <NumberFlow className={className} value={Math.round(value || 0)} locales={locale} format={{ style: 'currency', currency, maximumFractionDigits: 0 }} trend={0} />
    )
  ), [blur, locale, currency]);

  const slides = useMemo(() => {
    const list = ['intro'];
    if (recap.isEmpty) return [...list, 'empty'];
    list.push('bottom');
    if (recap.categories.length) list.push('where');
    if (recap.biggest) list.push('biggest');
    if (recap.topWeekday) list.push('rhythm');
    if (recap.spentChange !== null) list.push('compare');
    list.push('calendar');
    if (recap.people.length > 1) list.push('people');
    list.push('outro');
    return list;
  }, [recap]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  // The running story's progress lives outside React state, so the bar moves without re-rendering
  const progress = useMotionValue(0);
  const [sharing, setSharing] = useState(false);
  const last = index === slides.length - 1;
  const dialogRef = useRef(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const go = useCallback((dir) => {
    progress.set(0);
    setIndex((i) => {
      const next = Math.min(slides.length - 1, Math.max(0, i + dir));
      if (next !== i) haptic('selection');
      return next;
    });
  }, [slides.length, progress]);

  // The clock for the current story
  useEffect(() => {
    if (paused || holding || last) return undefined;
    let frame;
    let prev = performance.now();
    const tick = (now) => {
      const dt = now - prev;
      prev = now;
      if (document.visibilityState === 'visible') {
        const n = progress.get() + dt / DURATION;
        if (n >= 1) { go(1); return; }
        progress.set(n);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, holding, last, index, go, progress]);

  // Keyboard, and nothing behind the stories can be reached
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(isRTL ? -1 : 1);
      else if (e.key === 'ArrowLeft') go(isRTL ? 1 : -1);
      else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    const root = document.getElementById('root');
    if (root) root.inert = true;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      if (root) root.inert = false;
      document.body.style.overflow = prevOverflow;
    };
  }, [go, isRTL, onClose]);

  // Tap, hold and swipe on the story itself
  const press = useRef(null);
  const onPointerDown = (e) => {
    if (e.target.closest('button,a')) return;
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), timer: setTimeout(() => setHolding(true), 180) };
  };
  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    const dy = e.clientY - p.y;
    if (dy > 90 && Math.abs(e.clientX - p.x) < dy) { onClose(); return; }
    if (holding) { setHolding(false); return; }
    const w = window.innerWidth;
    const nearStart = isRTL ? e.clientX > w * 0.7 : e.clientX < w * 0.3;
    go(nearStart ? -1 : 1);
  };
  const onPointerCancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    setHolding(false);
  };

  const share = async () => {
    setSharing(true);
    try {
      const outcome = await shareRecapCard({ recap, monthYear, t, language, isRTL, currency, blur, cat });
      if (outcome === 'downloaded') haptic('success');
    } catch { /* the share sheet was closed */ }
    finally { setSharing(false); }
  };

  const slide = slides[index];
  const accent = ACCENTS[index % ACCENTS.length];
  const weekdayName = (wd) => new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2026, 9, 4 + wd));
  const weekdayShort = (wd) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 9, 4 + wd));
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const maxDay = Math.max(1, ...recap.perDay.map((d) => d.amount));
  const maxWeekday = Math.max(1, ...recap.weekdays.map((w) => w.average));

  const content = {
    intro: (
      <div className="flex h-full flex-col justify-center">
        <motion.div {...rise(0)}><AscentLogo motion={reduce ? 'none' : 'full'} className="w-20" /></motion.div>
        <motion.p {...rise(1)} className="mt-8 text-lg font-medium text-foreground/80">{recap.running ? t('rcSoFar') : t('rcYour')}</motion.p>
        <motion.h2 {...rise(2)} className="mt-1 text-6xl font-bold capitalize leading-[0.95] tracking-tight text-balance sm:text-7xl">{monthName}</motion.h2>
        <motion.p {...rise(3)} className="mt-6 max-w-xs text-lg text-foreground/80 text-pretty">
          {recap.isEmpty ? t('rcIntroEmpty') : t('rcIntro').replace('{count}', recap.count).replace('{days}', recap.elapsed)}
        </motion.p>
      </div>
    ),
    empty: (
      <div className="flex h-full flex-col justify-center">
        <motion.h2 {...rise(0)} className="text-4xl font-bold tracking-tight text-balance">{t('rcEmptyTitle')}</motion.h2>
        <motion.p {...rise(1)} className="mt-4 text-lg text-foreground/80 text-pretty">{t('rcEmptyBody')}</motion.p>
      </div>
    ),
    bottom: (
      <div className="flex h-full flex-col justify-center">
        <motion.p {...rise(0)} className="text-lg font-medium text-foreground/80">{recap.net >= 0 ? t('rcKept') : t('rcOverspent')}</motion.p>
        <motion.div {...rise(1)} className={cn('mt-2 text-6xl font-bold tabular-nums tracking-tight sm:text-7xl', recap.net < 0 && 'text-danger')} dir="ltr">
          <Money value={Math.abs(recap.net)} />
        </motion.div>
        {recap.savingsRate !== null && recap.net > 0 && (
          <motion.p {...rise(2)} className="mt-3 text-xl font-semibold text-success">{t('rcSavingsRate').replace('{pct}', pct(recap.savingsRate))}</motion.p>
        )}
        <motion.div {...rise(3)} className="mt-10 space-y-4">
          {[{ label: t('rcEarned'), value: recap.earned, tone: 'bg-success' }, { label: t('rcSpent'), value: recap.spent, tone: 'bg-[hsl(var(--slide))]' }].map((row, i) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/80">{row.label}</span>
                <span className="font-semibold tabular-nums" dir="ltr"><BlurValue blur={blur}>{fmt(row.value)}</BlurValue></span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-foreground/10">
                <motion.span
                  className={cn('block h-full rounded-full', row.tone)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(row.value / Math.max(recap.earned, recap.spent, 1)) * 100}%` }}
                  transition={{ duration: 1.1, delay: 0.5 + i * 0.15, ease: EASE }}
                />
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    ),
    where: (
      <div className="flex h-full flex-col justify-center">
        <motion.h2 {...rise(0)} className="text-4xl font-bold tracking-tight text-balance">{t('rcWhereTitle')}</motion.h2>
        <motion.p {...rise(1)} className="mt-3 text-lg text-foreground/80 text-pretty">
          {t('rcWhereLead').replace('{category}', cat(recap.categories[0].category)).replace('{pct}', pct(recap.categories[0].share))}
        </motion.p>
        <ol className="mt-10 space-y-5">
          {recap.categories.slice(0, 4).map((c, i) => (
            <motion.li key={c.category} {...rise(2 + i)}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground/50">{i + 1}</span>
                  <span className="truncate text-lg font-semibold">{cat(c.category)}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-foreground/80" dir="ltr">
                  {blur ? pct(c.share) : `${fmt(c.amount)} · ${pct(c.share)}`}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
                <motion.span
                  className="block h-full rounded-full bg-[hsl(var(--slide))]"
                  style={{ opacity: 1 - i * 0.18 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${c.share * 100}%` }}
                  transition={{ duration: 1, delay: 0.45 + i * 0.12, ease: EASE }}
                />
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    ),
    biggest: recap.biggest && (
      <div className="flex h-full flex-col justify-center">
        <motion.p {...rise(0)} className="text-lg font-medium text-foreground/80">{t('rcBiggestTitle')}</motion.p>
        <motion.div {...rise(1)} className="mt-2 text-6xl font-bold tabular-nums tracking-tight" dir="ltr"><Money value={recap.biggest.amount} /></motion.div>
        <motion.p {...rise(2)} className="mt-3 text-2xl font-semibold text-balance" dir="auto">{recap.biggest.description || cat(recap.biggest.category)}</motion.p>
        <motion.p {...rise(3)} className="mt-1 text-foreground/70">
          {cat(recap.biggest.category)} · {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${recap.biggest.date}T12:00:00`))}
        </motion.p>
        {recap.busiest && (
          <motion.div {...rise(4)} className="mt-12 rounded-3xl bg-foreground/[0.06] p-5">
            <p className="text-sm text-foreground/70">{t('rcBusiestDay')}</p>
            <p className="mt-1 text-xl font-semibold">
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(month.getFullYear(), month.getMonth(), recap.busiest.day))}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-foreground/70" dir="auto">
              {t('rcBusiestDetail').replace('{amount}', blur ? '•••' : fmt(recap.busiest.amount)).replace('{count}', recap.perDay[recap.busiest.day - 1].count)}
            </p>
          </motion.div>
        )}
      </div>
    ),
    rhythm: recap.topWeekday && (
      <div className="flex h-full flex-col justify-center">
        <motion.h2 {...rise(0)} className="text-4xl font-bold tracking-tight text-balance">
          {t('rcRhythmTitle').replace('{day}', weekdayName(recap.topWeekday.weekday))}
        </motion.h2>
        <motion.p {...rise(1)} className="mt-3 text-lg text-foreground/80 text-pretty">
          {t('rcRhythmBody').replace('{amount}', blur ? '•••' : fmt(recap.topWeekday.average))}
        </motion.p>
        <div className="mt-12 flex h-48 items-end gap-2.5" dir={isRTL ? 'rtl' : 'ltr'}>
          {recap.weekdays.map((w, i) => {
            const top = w.weekday === recap.topWeekday.weekday;
            return (
              <div key={w.weekday} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <motion.span
                  className={cn('w-full rounded-xl', top ? 'bg-[hsl(var(--slide))] shadow-[0_10px_30px_-10px_hsl(var(--slide)/0.8)]' : 'bg-foreground/15')}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(4, (w.average / maxWeekday) * 100)}%` }}
                  transition={{ duration: 0.9, delay: 0.35 + i * 0.06, ease: EASE }}
                />
                <span className={cn('text-xs font-semibold', top ? 'text-foreground' : 'text-foreground/50')}>{weekdayShort(w.weekday)}</span>
              </div>
            );
          })}
        </div>
      </div>
    ),
    compare: (
      <div className="flex h-full flex-col justify-center">
        <motion.p {...rise(0)} className="text-lg font-medium text-foreground/80">{t('rcCompareLead').replace('{month}', prevName)}</motion.p>
        <motion.div {...rise(1)} className={cn('mt-2 flex items-center gap-3 text-6xl font-bold tabular-nums tracking-tight', recap.spentChange > 0 ? 'text-danger' : 'text-success')}>
          {recap.spentChange > 0 ? <TrendingUp className="h-12 w-12" aria-hidden="true" /> : <TrendingDown className="h-12 w-12" aria-hidden="true" />}
          <span dir="ltr">{pct(Math.abs(recap.spentChange))}</span>
        </motion.div>
        <motion.p {...rise(2)} className="mt-3 text-xl font-semibold text-balance">
          {recap.spentChange > 0 ? t('rcCompareMore') : t('rcCompareLess')}
        </motion.p>
        <motion.ul {...rise(3)} className="mt-10 space-y-3">
          {recap.rose && (
            <li className="flex items-center justify-between gap-3 rounded-2xl bg-foreground/[0.06] px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-2.5"><TrendingUp className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" /><span className="truncate">{t('rcRose').replace('{category}', cat(recap.rose.category))}</span></span>
              <span className="shrink-0 font-semibold tabular-nums text-danger" dir="ltr">{blur ? '•••' : `+${fmt(recap.rose.delta)}`}</span>
            </li>
          )}
          {recap.fell && (
            <li className="flex items-center justify-between gap-3 rounded-2xl bg-foreground/[0.06] px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-2.5"><TrendingDown className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span className="truncate">{t('rcFell').replace('{category}', cat(recap.fell.category))}</span></span>
              <span className="shrink-0 font-semibold tabular-nums text-success" dir="ltr">{blur ? '•••' : `−${fmt(Math.abs(recap.fell.delta))}`}</span>
            </li>
          )}
        </motion.ul>
      </div>
    ),
    calendar: (
      <div className="flex h-full flex-col justify-center">
        <motion.h2 {...rise(0)} className="text-4xl font-bold tracking-tight text-balance">
          {t('rcQuietTitle').replace('{count}', recap.quietDays)}
        </motion.h2>
        <motion.p {...rise(1)} className="mt-3 text-lg text-foreground/80 text-pretty">
          {recap.quietDays === 0 ? t('rcQuietNone') : recap.longestQuiet > 1 ? t('rcQuietStreak').replace('{count}', recap.longestQuiet) : t('rcQuietSingles')}
        </motion.p>
        <motion.div {...rise(2)} className="mt-10 grid grid-cols-7 gap-1.5" dir={isRTL ? 'rtl' : 'ltr'}>
          {Array.from({ length: 7 }, (_, wd) => (
            <span key={`h${wd}`} className="pb-1 text-center text-xs font-semibold text-foreground/50">{weekdayShort(wd)}</span>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => <span key={`b${i}`} />)}
          {recap.perDay.map((d, i) => {
            const future = d.day > recap.elapsed;
            const level = d.amount / maxDay;
            return (
              <motion.span
                key={d.day}
                title={`${d.day}`}
                className={cn(
                  'grid aspect-square place-items-center rounded-lg text-xs tabular-nums',
                  future ? 'text-foreground/25' : d.amount === 0 ? 'text-foreground/80 ring-1 ring-inset ring-[hsl(var(--slide)/0.55)]' : 'text-foreground',
                )}
                style={!future && d.amount > 0 ? { background: `hsl(var(--slide) / ${0.18 + level * 0.72})` } : undefined}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: 0.3 + i * 0.012, ease: EASE }}
              >
                {d.day}
              </motion.span>
            );
          })}
        </motion.div>
      </div>
    ),
    people: (
      <div className="flex h-full flex-col justify-center">
        <motion.h2 {...rise(0)} className="text-4xl font-bold tracking-tight text-balance">{t('rcPeopleTitle')}</motion.h2>
        <motion.p {...rise(1)} className="mt-3 text-lg text-foreground/80 text-pretty">{t('rcPeopleBody')}</motion.p>
        <div className="mt-10 flex h-4 overflow-hidden rounded-full" dir="ltr">
          {recap.people.map((p, i) => (
            <motion.span
              key={p.email}
              className="h-full first:rounded-s-full last:rounded-e-full"
              style={{ background: `hsl(var(${ACCENTS[(i + 1) % ACCENTS.length]}))` }}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: p.share }}
              transition={{ duration: 1, delay: 0.4, ease: EASE }}
            />
          ))}
        </div>
        <ul className="mt-6 space-y-3">
          {recap.people.map((p, i) => (
            <motion.li key={p.email} {...rise(2 + i)} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(var(${ACCENTS[(i + 1) % ACCENTS.length]}))` }} />
                <span className="truncate text-lg font-semibold">{p.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground/80" dir="ltr">{blur ? pct(p.share) : `${fmt(p.amount)} · ${pct(p.share)}`}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    ),
    outro: (
      <div className="flex h-full flex-col justify-center">
        <motion.div {...rise(0)}><AscentLogo motion="none" className="w-16" /></motion.div>
        <motion.h2 {...rise(1)} className="mt-6 text-4xl font-bold tracking-tight text-balance">
          {recap.running ? t('rcOutroRunning') : t('rcOutroTitle').replace('{month}', monthName)}
        </motion.h2>
        <motion.p {...rise(2)} className="mt-3 text-lg text-foreground/80 text-pretty">
          {recap.net >= 0 ? t('rcOutroKept').replace('{pct}', recap.savingsRate !== null ? pct(recap.savingsRate) : '') : t('rcOutroOver')}
        </motion.p>
        <motion.div {...rise(3)} className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            onClick={share}
            disabled={sharing}
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-foreground px-6 text-base font-semibold text-background outline-none transition-transform active:scale-[0.97] disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {sharing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Share2 className="h-5 w-5" aria-hidden="true" />}
            {t('rcShare')}
          </button>
          <button
            type="button"
            onClick={() => { setIndex(0); progress.set(0); }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('rcReplay')}
          </button>
        </motion.div>
      </div>
    ),
  };

  return (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('rcTitle').replace('{month}', monthYear)}
      className="fixed inset-0 z-[150] select-none overflow-hidden bg-background text-foreground outline-none [-webkit-touch-callout:none]"
      style={{ '--slide': `var(${accent})` }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, borderRadius: 40 }}
      animate={{ opacity: 1, scale: 1, borderRadius: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, borderRadius: 40 }}
      transition={{ duration: 0.4, ease: EASE }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
    >
      {/* Light for this story */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: 1 }}
        key={`bg-${index}`}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        style={{ background: 'radial-gradient(90% 60% at 15% 0%, hsl(var(--slide) / 0.34), transparent 65%), radial-gradient(70% 50% at 100% 100%, hsl(var(--slide) / 0.16), transparent 70%)' }}
      />

      {/* Progress, one segment per story */}
      <div className="absolute inset-x-0 top-0 z-10 px-3" style={{ paddingTop: 'calc(var(--safe-top) + 0.625rem)' }}>
        <div className="flex gap-1" dir={isRTL ? 'rtl' : 'ltr'}>
          {slides.map((s, i) => (
            <span key={s} className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/20">
              {i === index && !last ? (
                <motion.span className="block h-full rounded-full bg-foreground" style={{ scaleX: progress, originX: isRTL ? 1 : 0 }} />
              ) : (
                <span className="block h-full rounded-full bg-foreground" style={{ width: i <= index ? '100%' : '0%' }} />
              )}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold capitalize">{t('rcTitle').replace('{month}', monthYear)}</span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? t('rcPlay') : t('rcPause')}
            className="grid h-11 w-11 place-items-center rounded-full text-foreground/80 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="grid h-11 w-11 place-items-center rounded-full text-foreground/80 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative mx-auto h-full max-w-md px-7" style={{ paddingTop: 'calc(var(--safe-top) + 6rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 3rem)' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={slide}
            aria-live="polite"
            className="h-full"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: 'blur(6px)' }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {content[slide]}
          </motion.section>
        </AnimatePresence>
      </div>

      {(holding || paused) && !last && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] text-center text-xs font-medium text-foreground/60">{t('rcPaused')}</p>
      )}
    </motion.div>
  );
}
