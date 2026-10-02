import React, { memo } from 'react';
import { motion, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import BlurValue from '../BlurValue';
import { countdown, moneyIn } from '../plans/PlanParts';
import { goalEmoji } from './savingsUtils';

/** "Apr 2027" for a yyyy-MM or yyyy-MM-dd key. */
export const formatMonth = (key, loc) => (key
  ? new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric' }).format(new Date(`${key.slice(0, 7)}-15T12:00:00`))
  : '');

const STATUS_TONE = {
  reached: 'bg-success/15 text-success',
  onTrack: 'bg-success/15 text-success',
  behind: 'bg-warning/15 text-warning',
  late: 'bg-warning/15 text-warning',
  start: 'bg-foreground/[0.07] text-muted-foreground',
  open: 'bg-foreground/[0.07] text-muted-foreground',
};

export function StatusChip({ status, t, className }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[status], className)}>
      {t(`svStatus_${status}`)}
    </span>
  );
}

/** A ring that fills with the share of the target saved, the goal's emoji in the middle. */
export function GoalRing({ pct, emoji, size = 56, stroke = 5, reached }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = pct === null ? 0 : pct;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90 rtl:rotate-90 rtl:-scale-x-100">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-foreground/10" />
        {pct !== null && (
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            className={reached ? 'stroke-success' : 'stroke-primary'}
            strokeDasharray={c}
            initial={{ strokeDashoffset: reduce ? c * (1 - filled) : c }}
            animate={{ strokeDashoffset: c * (1 - filled) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <span style={{ fontSize: size * 0.4 }} className="leading-none">{emoji}</span>
    </span>
  );
}

/** The progress bar of a goal, with ticks at a quarter, half and three quarters. */
export function GoalBar({ pct, reached, className }) {
  return (
    <div className={cn('relative h-3 overflow-hidden rounded-full bg-foreground/10', className)} aria-hidden>
      <motion.span
        className={cn('absolute inset-y-0 start-0 rounded-full', reached ? 'bg-success' : 'bg-primary')}
        initial={{ width: 0 }}
        animate={{ width: `${(pct || 0) * 100}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      {[25, 50, 75].map((m) => (
        <span key={m} className="absolute inset-y-0 w-px bg-background/60" style={{ insetInlineStart: `${m}%` }} />
      ))}
    </div>
  );
}

export const GoalCard = memo(function GoalCard({ goal, totals, onOpen, t, loc, blur }) {
  const money = moneyIn(loc, goal.currency);
  const reached = totals.status === 'reached';
  const subline = goal.targetDate
    ? `${formatMonth(goal.targetDate, loc)} · ${countdown(totals.daysLeft, loc, t)}`
    : totals.target > 0 ? t('svNoDate') : t('svNoTarget');
  return (
    <motion.button
      type="button"
      layout
      onClick={() => onOpen(goal.id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-full flex-col gap-4 rounded-3xl bg-foreground/[0.04] p-4 text-start transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] sm:p-5"
    >
      <div className="flex items-center gap-3">
        <GoalRing pct={totals.pct} emoji={goalEmoji(goal)} reached={reached} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{goal.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subline}</span>
        </span>
        {totals.pct !== null && (
          <span className={cn('shrink-0 text-lg font-semibold tabular-nums', reached ? 'text-success' : 'text-foreground')}>
            {Math.floor(totals.pct * 100)}%
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-2xl font-bold tracking-tight tabular-nums text-foreground" dir="ltr">
            <BlurValue blur={blur}>{money(totals.saved)}</BlurValue>
          </span>
          {totals.target > 0 && (
            <span className="block text-xs text-muted-foreground">
              {t('svOfTarget', { amount: blur ? '••••' : money(totals.target) })}
            </span>
          )}
        </span>
        <StatusChip status={totals.status} t={t} />
      </div>
      {totals.needPerMonth && totals.status !== 'reached' ? (
        <p className="-mt-1 text-xs text-muted-foreground">
          {t('svNeedPerMonth', { amount: blur ? '••••' : money(Math.ceil(totals.needPerMonth)) })}
        </p>
      ) : totals.thisMonth > 0 ? (
        <p className="-mt-1 text-xs text-muted-foreground">
          {t('svThisMonthIn', { amount: blur ? '••••' : money(totals.thisMonth) })}
        </p>
      ) : null}
    </motion.button>
  );
});

/**
 * Month-end balance as bars, this month highlighted, with the target as a dashed line when it fits
 * the scale (the bars are measured against the larger of the target and the highest balance).
 */
export function GrowthBars({ months, target, currency, loc, t, blur }) {
  const peak = Math.max(1, ...months.map((m) => m.balance));
  const scale = Math.max(peak, target || 0);
  const money = moneyIn(loc, currency);
  const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const H = 112;
  const last = months.length - 1;
  return (
    <div className="relative">
      {target > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-success/60" style={{ bottom: 28 + (target / scale) * H }}>
          <span className="absolute -top-5 end-0 rounded-full bg-success/15 px-1.5 text-[0.6875rem] font-medium text-success">{t('svTarget')}</span>
        </div>
      )}
      <ol className="flex items-end gap-1.5 overflow-x-auto pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t('svGrowth')}>
        {months.map((m, i) => {
          const h = m.balance > 0 ? Math.max(4, (m.balance / scale) * H) : 2;
          const label = new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(`${m.key}-15T12:00:00`));
          return (
            <li
              key={m.key}
              className="flex min-w-9 flex-1 flex-col items-center gap-1"
              aria-label={`${label} ${m.key.slice(0, 4)}: ${blur ? '••••' : money(m.balance)}`}
            >
              <div aria-hidden className="flex w-full max-w-8 flex-col items-center justify-end gap-1" style={{ height: H + 18 }}>
                {i === last && !blur && (
                  <span className="whitespace-nowrap text-[0.6875rem] font-medium tabular-nums text-foreground">{compact.format(m.balance)}</span>
                )}
                <motion.span
                  className={cn('block w-full rounded-lg', i === last ? 'bg-primary' : 'bg-primary/35')}
                  initial={{ height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: 0.7, delay: Math.min(i, 12) * 0.02, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span aria-hidden className={cn('h-6 rounded-full px-1.5 text-[0.6875rem] font-medium leading-6', i === last ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
