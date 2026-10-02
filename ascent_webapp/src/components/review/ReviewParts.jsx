import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { motion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import BlurValue from '../BlurValue';

// Glass card surface, as on the Dashboard
export const tile = 'relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-12px_hsl(0_0%_0%/0.5)]';

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }),
};

/** A titled card of the review. */
export function Section({ i = 0, title, aside, className, children, id }) {
  return (
    <motion.section variants={rise} initial="hidden" animate="show" custom={i} className={cn(tile, 'p-5 sm:p-6', className)} aria-labelledby={id}>
      {(title || aside) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {title && <h2 id={id} className="text-base font-semibold tracking-tight text-foreground">{title}</h2>}
          {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
        </div>
      )}
      {children}
    </motion.section>
  );
}

/**
 * How a value moved against its comparison: an arrow and the percentage (or the amount when the
 * comparison was zero). `goodWhen` says which way is good news: 'down' for spending, 'up' for income.
 */
export function Delta({ now, base, goodWhen = 'down', fmt, blur, size = 'sm', className }) {
  if (base === null || base === undefined) return null;
  const diff = now - base;
  const flat = Math.abs(diff) < 0.005 * Math.max(Math.abs(base), 1) || Math.abs(diff) < 1;
  const pct = base !== 0 ? Math.abs(diff / base) : null;
  const good = flat ? null : (goodWhen === 'down' ? diff < 0 : diff > 0);
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const label = flat ? '0%' : pct !== null && pct < 10 ? `${Math.round(pct * 100)}%` : blur ? '••' : fmt(Math.abs(diff));
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full font-semibold tabular-nums',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        good === null ? 'bg-foreground/[0.07] text-muted-foreground' : good ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
        className
      )}
      dir="ltr"
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      {label}
    </span>
  );
}

/** A tiny line of a year, the last point (this month) marked. */
export function Sparkline({ values, className, width = 72, height = 22 }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v) => height - 2 - (v / max) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn('shrink-0 overflow-visible rtl:-scale-x-100', className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last * step} cy={y(values[last])} r="2.6" fill="hsl(var(--primary))" />
    </svg>
  );
}

/** A labelled figure with its comparison under it. */
export function Figure({ label, value, base, delta, blur, tone, big }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className={cn('mt-1 truncate font-bold tracking-tight tabular-nums', big ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl', tone || 'text-foreground')} dir="ltr">
        <BlurValue blur={blur}>{value}</BlurValue>
      </dd>
      {(delta || base) && (
        <dd className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {delta}
          {base && <span className="truncate tabular-nums" dir="auto">{blur ? '' : base}</span>}
        </dd>
      )}
    </div>
  );
}

/** A horizontal share bar. */
export function ShareBar({ share, className, tone = 'bg-primary' }) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]', className)} aria-hidden>
      <motion.span
        className={cn('block h-full rounded-full', tone)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}

/**
 * The month as a calendar: each day shaded by how much went out, no-spend days ringed.
 * `weekStart`: 0 = Sunday, 1 = Monday.
 */
export function DayHeat({ month, perDay, elapsed, noSpend, weekStart = 0, weekdayNames, fmt, blur, t }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const max = Math.max(...perDay.map((d) => d.amount), 1);
  const cells = [...Array.from({ length: lead }, () => null), ...perDay];
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
        {/* One-letter names repeat (T, T; S, S), so they are keyed by position */}
        {weekdayNames.map((n, i) => <span key={i}>{n}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <li key={`x${i}`} aria-hidden />;
          const future = d.day > elapsed;
          const level = d.amount > 0 ? 0.15 + 0.85 * Math.sqrt(d.amount / max) : 0;
          const free = !future && noSpend.has(d.day);
          const label = future ? `${d.day}` : [d.day, d.amount > 0 && !blur ? fmt(d.amount) : null, free ? t('rvNoSpendDay') : null].filter(Boolean).join(' · ');
          return (
            <li
              key={d.day}
              title={label}
              aria-label={label}
              className={cn(
                'relative grid aspect-square place-items-center rounded-lg text-[11px] font-semibold tabular-nums',
                future ? 'text-muted-foreground/40' : d.amount > 0 ? 'text-foreground' : 'text-muted-foreground',
                free && 'text-success ring-[1.5px] ring-inset ring-success/70'
              )}
              style={d.amount > 0 && !future ? { background: `hsl(var(--primary) / ${level.toFixed(2)})` } : future ? undefined : { background: 'hsl(var(--foreground) / 0.04)' }}
            >
              {d.day}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
