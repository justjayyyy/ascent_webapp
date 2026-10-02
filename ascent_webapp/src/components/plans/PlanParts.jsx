import React, { memo, useEffect, useRef } from 'react';
import { motion } from '@/lib/motion';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import BlurValue from '../BlurValue';
import { kindEmoji } from './planUtils';
import { localMonth } from '@/lib/localDay';

export const localeOf = (language) => (language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US');

export const moneyIn = (loc, currency, digits = 0) => (v) => new Intl.NumberFormat(loc, {
  style: 'currency', currency: currency || 'ILS', maximumFractionDigits: digits,
}).format(v || 0);

export const formatDay = (d, loc, withYear) => (d
  ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(`${d}T12:00:00`))
  : '');

/** "in 3 months", "in 12 days", "today", "2 weeks ago" */
export function countdown(daysLeft, loc, t) {
  if (daysLeft === null || daysLeft === undefined) return '';
  if (daysLeft === 0) return t('today');
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  const abs = Math.abs(daysLeft);
  if (abs < 45) return rtf.format(daysLeft, 'day');
  if (abs < 540) return rtf.format(Math.round(daysLeft / 30.4), 'month');
  return rtf.format(Math.round(daysLeft / 365), 'year');
}

/** Paid, booked and still-planned money as one bar against the plan's target. */
export function PlanBar({ totals, className }) {
  const base = totals.target || 1;
  const paid = Math.min(100, (totals.paid / base) * 100);
  const booked = Math.min(100 - paid, (totals.booked / base) * 100);
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-foreground/10", className)} aria-hidden>
      <motion.span className="h-full bg-success" initial={{ width: 0 }} animate={{ width: `${paid}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      <motion.span className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${booked}%` }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export const PlanCard = memo(function PlanCard({ plan, totals, onOpen, t, loc, blur }) {
  const money = moneyIn(loc, plan.currency);
  const past = totals.daysLeft !== null && totals.daysLeft < 0;
  return (
    <motion.button
      type="button"
      layout
      onClick={() => onOpen(plan.id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-full flex-col gap-4 rounded-3xl bg-foreground/[0.04] p-4 text-start transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl transition-transform duration-300 group-hover:scale-105">
          {plan.emoji || kindEmoji(plan.kind)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{plan.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {plan.startDate ? formatDay(plan.startDate, loc, true) : t('planNoDate')}
            {plan.startDate && ` · ${countdown(totals.daysLeft, loc, t)}`}
          </span>
        </span>
        {plan.status === 'done' && <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">{t('planDone')}</span>}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('paid')} <span className="font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(totals.paid)}</BlurValue></span>
          </span>
          <span className="tabular-nums text-muted-foreground" dir="ltr"><BlurValue blur={blur}>{money(totals.target)}</BlurValue></span>
        </div>
        <PlanBar totals={totals} className="mt-2" />
      </div>
      {totals.next && !past ? (
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {t('nextPayment')}: {totals.next.name} · {formatDay(totals.next.dueDate, loc)}
            {totals.next.amount > 0 && <> · <BlurValue blur={blur}>{money(totals.next.amount)}</BlurValue></>}
          </span>
        </p>
      ) : totals.pace ? (
        <p className="text-xs text-muted-foreground">{t('setAsidePerMonth').replace('{amount}', blur ? '••••' : money(totals.pace))}</p>
      ) : null}
    </motion.button>
  );
});

/** Month-by-month bars: paid (solid) and still due (tinted), with the event month flagged. */
export function PaymentTimeline({ months, currency, loc, t, blur, emoji }) {
  const ref = useRef(null);
  const max = Math.max(1, ...months.map((m) => m.paid + m.due));
  const nowKey = localMonth();
  const money = moneyIn(loc, currency);
  const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });

  // Open on this month, so the past is a scroll away and the future is in view
  useEffect(() => {
    // Scroll only the strip (scrollIntoView would also move the page); the delta works in RTL too
    const strip = ref.current;
    const el = strip?.querySelector('[data-now="true"]');
    if (!el) return;
    const a = el.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    strip.scrollBy({ left: a.left + a.width / 2 - (b.left + b.width / 2) });
  }, [months.length]);

  if (!months.length) return null;

  return (
    <div
      ref={ref}
      className="flex items-end gap-1.5 overflow-x-auto pb-1 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
      aria-label={t('paymentTimeline')}
    >
      {months.map((m) => {
        const total = m.paid + m.due;
        const h = total > 0 ? Math.max(6, (total / max) * 112) : 3;
        const paidH = total > 0 ? (m.paid / total) * h : 0;
        const label = new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(`${m.key}-15T12:00:00`));
        const yearStart = m.key.endsWith('-01');
        return (
          <div
            key={m.key}
            role="listitem"
            data-now={m.key === nowKey}
            aria-label={`${label} ${m.key.slice(0, 4)}: ${t('paid')} ${blur ? '••••' : money(m.paid)}, ${t('stillDue')} ${blur ? '••••' : money(m.due)}`}
            className="relative flex w-11 shrink-0 flex-col items-center gap-1.5"
          >
            {m.isEvent && <span aria-hidden className="absolute -top-6 text-base leading-none">{emoji}</span>}
            <span className="text-[0.625rem] tabular-nums text-muted-foreground" aria-hidden>
              {total > 0 && !blur ? compact.format(total) : ' '}
            </span>
            <div className="flex h-28 w-7 flex-col justify-end" aria-hidden>
              <motion.div
                className="flex w-full flex-col-reverse overflow-hidden rounded-lg"
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="w-full bg-success" style={{ height: paidH }} />
                <span className={cn("w-full flex-1", total > 0 ? "bg-primary/35" : "bg-foreground/10")} />
              </motion.div>
            </div>
            <span aria-hidden className={cn(
              "rounded-full px-1.5 text-[0.6875rem] font-medium",
              m.key === nowKey ? "bg-primary text-primary-foreground" : m.isEvent ? "text-primary" : "text-muted-foreground"
            )}>
              {label}
            </span>
            {yearStart && <span aria-hidden className="text-[0.625rem] tabular-nums text-muted-foreground">{m.key.slice(0, 4)}</span>}
          </div>
        );
      })}
    </div>
  );
}
