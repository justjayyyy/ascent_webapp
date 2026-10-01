import React, { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { CalendarClock, Flag, Percent, Repeat, HandCoins, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import EChart, { useChartTokens, withAlpha } from '@/components/charts/EChart';
import BlurValue from '../BlurValue';
import { moneyIn, formatDay, countdown } from '../plans/PlanParts';
import { balanceByMonth, monthsBetween } from '@shared/commitments';
import { commitmentEmoji, durationText, monthYear } from './commitmentUtils';

const EASE = [0.22, 1, 0.36, 1];
const daysUntil = (date, today) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

/** A ring that fills as a commitment is paid off, with the percentage inside. */
export function ProgressRing({ value, size = 56, stroke = 6, tone = 'success', label, children }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-foreground/10" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={tone === 'primary' ? 'stroke-primary' : 'stroke-success'}
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums text-foreground" aria-hidden>
        {children ?? `${Math.round(pct * 100)}%`}
      </span>
    </span>
  );
}

/** Animated money figure that respects the blur setting. */
export function BigMoney({ value, currency, loc, blur, className }) {
  if (blur) return <BlurValue blur className={className} />;
  return (
    <NumberFlow
      className={className}
      value={Math.round(value || 0)}
      locales={loc}
      format={{ style: 'currency', currency: currency || 'ILS', maximumFractionDigits: 0 }}
      trend={0}
    />
  );
}

/** One loan or debt in the list: what is left, how far along it is and what comes next. */
export const CommitmentCard = memo(function CommitmentCard({ commitment: c, status: s, recordedThisMonth, today, onOpen, t, loc, blur }) {
  const money = moneyIn(loc, c.currency);
  const lent = c.direction === 'lent';
  const nextIn = s.next ? daysUntil(s.next.date, today) : null;
  const closed = c.status === 'closed' || s.done;
  return (
    <motion.button
      type="button"
      layout
      onClick={() => onOpen(c.id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="group flex w-full flex-col gap-4 rounded-3xl bg-foreground/[0.04] p-4 text-start transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl transition-transform duration-300 group-hover:scale-105",
          lent ? "bg-success/10" : "bg-primary/10"
        )}>
          {commitmentEmoji(c)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{c.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {[c.lender, t(`cmKind_${c.kind}`)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ProgressRing value={s.progress} size={48} stroke={5} tone={lent ? 'success' : 'primary'} label={t('cmPaidOffPct').replace('{pct}', Math.round(s.progress * 100))} />
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{lent ? t('cmStillOwedToYou') : t('cmLeftToPay')}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xl font-bold tracking-tight text-foreground">
          <span className="tabular-nums" dir="ltr"><BlurValue blur={blur}>{money(s.balance)}</BlurValue></span>
          <span className="text-xs font-normal text-muted-foreground">
            {t('cmOf')} <span className="tabular-nums" dir="ltr"><BlurValue blur={blur}>{money(s.principal)}</BlurValue></span>
          </span>
        </p>
      </div>

      {closed ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> {lent ? t('cmRepaidInFull') : t('cmPaidOff')}
        </p>
      ) : s.mode === 'scheduled' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {s.next && (
            <span className="flex min-w-0 items-center gap-1.5">
              <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                <span className="font-medium tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(s.next.amount)}</BlurValue></span>
                {' · '}{nextIn === 0 ? t('today') : countdown(nextIn, loc, t)}
              </span>
            </span>
          )}
          {recordedThisMonth && <span className="rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">{t('cmRecorded')}</span>}
          {s.payoffDate && (
            <span className="flex items-center gap-1.5">
              <Flag aria-hidden className="h-3.5 w-3.5 shrink-0" /> {monthYear(s.payoffDate, loc)}
            </span>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HandCoins aria-hidden className="h-3.5 w-3.5" />
          {s.paymentsMade ? t('cmRepaymentsCount').replace('{count}', s.paymentsMade) : t('cmNoFixedSchedule')}
        </p>
      )}
    </motion.button>
  );
});

/**
 * The page's headline: everything owed, how much of it is behind you, what goes out each month and
 * when the last loan ends. The bar shows each loan's share of what is left.
 */
export function DebtHero({ summary, rows, toUser, currency, loc, t, blur, today, colors }) {
  const money = moneyIn(loc, currency);
  const live = rows.filter(({ c, s }) => c.direction !== 'lent' && !s.done && c.status !== 'closed');
  const total = live.reduce((sum, { c, s }) => sum + toUser(s.balance, c.currency), 0) || 1;
  const monthsToFree = summary.debtFreeDate ? Math.max(0, monthsBetween(today, summary.debtFreeDate)) : null;

  const chips = [
    { icon: Repeat, label: t('cmMonthlyTotal'), value: <BlurValue blur={blur}>{money(summary.monthly)}</BlurValue> },
    {
      icon: Flag, label: t('cmDebtFree'),
      value: summary.debtFreeDate ? monthYear(summary.debtFreeDate, loc) : '—',
      sub: monthsToFree !== null ? t('cmIn').replace('{time}', durationText(monthsToFree, t)) : null,
    },
    { icon: Percent, label: t('cmInterestAhead'), value: <BlurValue blur={blur}>{money(summary.interestAhead)}</BlurValue> },
  ];

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t('cmYouOwe')}</p>
          <BigMoney value={summary.balance} currency={currency} loc={loc} blur={blur} className="mt-1 block text-4xl font-bold tracking-tight md:text-5xl" />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('cmPaidOfBorrowed')
              .replace('{pct}', Math.round(summary.progress * 100))
              .replace('{amount}', blur ? '••••' : money(summary.principal))}
          </p>
        </div>
        <ProgressRing value={summary.progress} size={76} stroke={8} tone="success" label={t('cmPaidOffPct').replace('{pct}', Math.round(summary.progress * 100))} />
      </div>

      {live.length > 1 && (
        <div className="mt-5">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {live.map(({ c, s }, i) => (
              <motion.span
                key={c.id}
                className="h-full first:rounded-s-full last:rounded-e-full"
                style={{ background: colors[i % colors.length] }}
                initial={{ width: 0 }}
                animate={{ width: `${(toUser(s.balance, c.currency) / total) * 100}%` }}
                transition={{ duration: 0.8, delay: i * 0.05, ease: EASE }}
              />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {live.map(({ c, s }, i) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                <span className="max-w-[10rem] truncate">{c.name}</span>
                <span className="tabular-nums" dir="ltr"><BlurValue blur={blur}>{moneyIn(loc, c.currency)(s.balance)}</BlurValue></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Label and value side by side: the card is narrow next to the chart on desktop */}
      <dl className="mt-5 space-y-2">
        {chips.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] px-3 py-2.5">
            <dt className="flex min-w-0 flex-1 items-center gap-3 text-sm text-muted-foreground">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden className="h-4 w-4" /></span>
              <span className="truncate">{label}</span>
            </dt>
            <dd className="shrink-0 text-end text-sm font-semibold tabular-nums text-foreground">
              {value}{sub && <span className="block text-xs font-normal text-muted-foreground">{sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Stacked balances of every loan from this month until the last one is gone. */
export function PayoffChart({ rows, toUser, currency, loc, t, blur, today }) {
  const tokens = useChartTokens();
  const option = useMemo(() => {
    if (!tokens) return null;
    const live = rows.filter(({ c, s }) => c.direction !== 'lent' && !s.done && c.status !== 'closed' && s.mode === 'scheduled');
    if (!live.length) return null;
    const from = today.slice(0, 7);
    const series = live.map(({ c }) => ({ c, months: balanceByMonth(c, from, today) }));
    const lastKey = series.reduce((k, x) => (x.months.length && x.months[x.months.length - 1].key > k ? x.months[x.months.length - 1].key : k), from);
    const count = Math.min(600, monthsBetween(from, lastKey) + 1);
    if (count < 2) return null;
    const keys = Array.from({ length: count }, (_, i) => {
      const [y, m] = from.split('-').map(Number);
      const total = y * 12 + (m - 1) + i;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    });
    const palette = tokens.series;
    const money = moneyIn(loc, currency);
    const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    const monthLabel = (key) => new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric' }).format(new Date(`${key}-15T12:00:00`));
    return {
      animationDuration: 1000,
      animationEasing: 'cubicOut',
      grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        trigger: 'axis',
        backgroundColor: tokens.popover, borderColor: tokens.border, borderWidth: 1, padding: [8, 12],
        textStyle: { color: tokens.text, fontFamily: tokens.fontFamily, fontSize: 12 },
        extraCssText: 'border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,.5);',
        axisPointer: { type: 'line', lineStyle: { color: tokens.primary, type: 'dashed' } },
        formatter: (ps) => {
          const sum = ps.reduce((s, p) => s + (p.value || 0), 0);
          const lines = ps.filter((p) => p.value > 0).map((p) => `${p.marker} ${p.seriesName}: <b>${money(p.value)}</b>`);
          return `${monthLabel(keys[ps[0].dataIndex])}<br/>${lines.join('<br/>')}${ps.length > 1 ? `<br/>${t('total')}: <b>${money(sum)}</b>` : ''}`;
        },
      },
      xAxis: {
        type: 'category', boundaryGap: false, data: keys,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: {
          color: tokens.muted, fontFamily: tokens.fontFamily, hideOverlap: true,
          formatter: (key) => (count > 24 ? key.slice(0, 4) : new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(`${key}-15T12:00:00`))),
          interval: count > 24 ? (i) => keys[i].endsWith('-01') : 'auto',
        },
      },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: (v) => compact.format(v), fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: series.map(({ c, months }, i) => {
        const byKey = Object.fromEntries(months.map((m) => [m.key, m.balance]));
        let last = months[0]?.balance || 0;
        const color = palette[i % palette.length];
        return {
          name: c.name, type: 'line', stack: 'debt', smooth: 0.3, symbol: 'none',
          lineStyle: { width: 2, color },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: withAlpha(color, 0.45) }, { offset: 1, color: withAlpha(color, 0.08) }] } },
          data: keys.map((key) => {
            if (byKey[key] !== undefined) last = byKey[key];
            else if (key > (months[months.length - 1]?.key || '')) last = 0;
            return Math.round(toUser(last, c.currency));
          }),
        };
      }),
    };
  }, [tokens, rows, toUser, currency, loc, t, blur, today]);

  if (!option) return null;
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t('cmRoadToDebtFree')}</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">{t('cmRoadHint')}</span>
      </div>
      <div className="mt-3 h-56 min-h-56 md:h-64 lg:h-auto lg:flex-1" dir="ltr">
        <EChart option={option} className="h-full w-full" ariaLabel={t('cmRoadToDebtFree')} />
      </div>
    </div>
  );
}

/** Payments due this month across every loan, with whether each is behind you or recorded. */
export function ThisMonth({ dues, totalLabel, today, loc, t, blur, onRecord, canEdit }) {
  if (!dues.length) return null;
  return (
    <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('cmThisMonth')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('cmThisMonth')}</h2>
        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
          <BlurValue blur={blur}>{totalLabel}</BlurValue>
        </span>
      </div>
      <ul className="mt-2 divide-y divide-border/30">
        {dues.map((d) => {
          const passed = d.date <= today;
          return (
            <li key={`${d.c.id}-${d.date}`} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg">{commitmentEmoji(d.c)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{d.c.name}</span>
                <span className="block text-xs text-muted-foreground">{formatDay(d.date, loc)}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                <BlurValue blur={blur}>{moneyIn(loc, d.c.currency)(d.amount)}</BlurValue>
              </span>
              {d.recorded ? (
                <span className="flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 text-xs font-medium text-success">
                  <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> {t('cmRecorded')}
                </span>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => onRecord(d.c, d)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors active:scale-95",
                    passed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-foreground/[0.07] text-foreground hover:bg-foreground/10"
                  )}
                >
                  {t('cmRecord')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground text-pretty">{t('cmThisMonthHint')}</p>
    </section>
  );
}
