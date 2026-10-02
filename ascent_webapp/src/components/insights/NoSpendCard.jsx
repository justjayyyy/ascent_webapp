import React, { useEffect } from 'react';
import { Leaf, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { streakMilestone } from '@/lib/noSpend';

const CELEBRATED_KEY = 'ascent_nospend_celebrated';

/** A streak worth a word is celebrated once, the day it is reached, on this device. */
function useCelebrate(stats, t) {
  useEffect(() => {
    const m = streakMilestone(stats.current);
    if (!m) return;
    const mark = `${stats.today}:${m}`;
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === mark) return;
      localStorage.setItem(CELEBRATED_KEY, mark);
    } catch { return; }
    haptic('success');
    toast.success(t('nsMilestone', { n: m }), { description: t('nsMilestoneHint') });
  }, [stats.current, stats.today, t]);
}

/**
 * No-spend days, gently: the run of days without a purchase anyone chose to make (bills that run on
 * their own do not count), and this month as a row of dots. Opt-in.
 */
export function NoSpendCard({ stats, target = 0, t, onSettings }) {
  const reduce = useReducedMotion();
  useCelebrate(stats, t);
  const { current, best, month, todayClear } = stats;
  const days = month.days.filter((d) => d.state !== 'before');
  const toTarget = target > 0 ? Math.min(1, month.free / target) : null;
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Leaf className="h-4 w-4 text-success" aria-hidden />{t('nsTitle')}
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight tabular-nums text-foreground">{current}</span>
            <span className="text-base font-medium text-muted-foreground">{t('nsInARow', { n: current })}</span>
          </p>
          <p className={cn('mt-1 text-sm', todayClear ? 'text-success' : 'text-muted-foreground')}>
            {todayClear ? t('nsTodayClear') : current ? t('nsKeepGoing') : t('nsFreshStart')}
          </p>
        </div>
        <button type="button" onClick={onSettings} className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
          {t('nsBest', { n: best })}
        </button>
      </div>

      <ol className="mt-5 flex flex-wrap gap-1.5" aria-label={t('nsThisMonthDots', { n: month.free })}>
        {days.map((d, i) => (
          <motion.li
            key={d.day}
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: Math.min(i, 31) * 0.012, duration: 0.25 }}
            title={`${d.date}`}
            className={cn(
              'h-3.5 w-3.5 rounded-full',
              d.state === 'free' && d.day !== stats.today && 'bg-success',
              d.state === 'free' && d.day === stats.today && 'bg-success/40 ring-2 ring-success/60',
              d.state === 'spent' && 'bg-foreground/15',
              d.state === 'future' && 'bg-foreground/[0.05]'
            )}
          />
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t('nsThisMonth', { n: month.free })}</span>
        {toTarget !== null && (
          <span className={cn('font-semibold tabular-nums', toTarget >= 1 ? 'text-success' : 'text-foreground')}>
            {toTarget >= 1 ? t('nsTargetReached', { target }) : t('nsOfTarget', { n: month.free, target })}
          </span>
        )}
      </div>
    </div>
  );
}

/** The one-time offer to count no-spend days. */
export function NoSpendInvite({ onEnable, onDismiss, t }) {
  return (
    <div className="relative flex flex-wrap items-center gap-4 p-5 pe-12 sm:p-6 sm:pe-14">
      <button type="button" onClick={onDismiss} aria-label={t('rcDismiss')} className="absolute end-2 top-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
        <X className="h-4 w-4" />
      </button>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success/15 text-success"><Leaf className="h-6 w-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold tracking-tight text-foreground">{t('nsInviteTitle')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{t('nsInviteHint')}</p>
      </div>
      <button type="button" onClick={onEnable} className="inline-flex h-10 shrink-0 items-center rounded-full bg-success px-4 text-sm font-semibold text-background transition-transform active:scale-95">
        {t('nsTurnOn')}
      </button>
    </div>
  );
}
