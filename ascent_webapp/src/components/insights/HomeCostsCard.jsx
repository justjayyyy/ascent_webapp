import React, { useMemo } from 'react';
import { Home } from 'lucide-react';
import { motion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { addMonths, hasPeriod, homeCosts, periodLabel } from '@shared/homeCosts';

const MONTHS = 6;
const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, v), s);
const monthDate = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 15);

/** Where a category's amount for a month came from: "Meniv water · Jul–Aug 2026", "Rent · expected". */
function partsLine(parts, t, loc) {
  const seen = new Set();
  return parts
    .filter(({ tx }) => { const k = tx.id || tx._id || tx.description; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ tx, estimated }) => [tx.description, estimated ? t('homeExpected') : hasPeriod(tx) ? periodLabel(tx.coversFrom, tx.coversTo, loc) : ''].filter(Boolean).join(' · '))
    .join(', ');
}

/**
 * What the home costs each month (rent, bills, property tax, insurance, subscriptions), counted in the months
 * each payment is for: a bill paid late lands in the months it covers, one paid ahead is spread over them, and a
 * bill that has not come yet is expected at the last one's amount. Beside it, what was paid in the month.
 */
export default function HomeCostsCard({ rows, monthKey, categories = [], locale, currency, blur }) {
  const { t, language } = useTheme();
  const thisMonth = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }, []);
  const months = useMemo(() => Array.from({ length: MONTHS }, (_, i) => addMonths(monthKey, i - (MONTHS - 1))), [monthKey]);
  const until = monthKey < thisMonth ? monthKey : thisMonth;
  const costs = useMemo(() => homeCosts(rows, { months, until }), [rows, months, until]);

  const money = (v) => (blur ? '••••' : new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0));
  const compact = (v) => (blur || !v ? '' : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v));
  const monthShort = (key) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(monthDate(key));
  const monthLong = (key) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(monthDate(key));
  const iconOf = useMemo(() => Object.fromEntries(categories.map((c) => [c.name, c.icon])), [categories]);

  const selected = costs.months.at(-1);
  const max = Math.max(...costs.months.map((m) => m.total), 1);
  const lines = Object.entries(costs.byCategory)
    .map(([category, byMonth]) => ({ category, cell: byMonth[monthKey] }))
    .filter((x) => x.cell && x.cell.amount > 0)
    .sort((a, b) => b.cell.amount - a.cell.amount);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Home className="h-4 w-4 text-primary" aria-hidden />{t('homeTitle')}</h2>
        {costs.average > 0 && (
          <div className="shrink-0 text-end">
            <p className="text-xl font-bold tabular-nums tracking-tight" dir="ltr">{money(costs.average)}</p>
            <p className="text-xs text-muted-foreground">{t('homePerMonth')}</p>
          </div>
        )}
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground text-pretty">{t('homeHint')}</p>

      {/* The last six months: what was real, and on top, what is expected */}
      <ol className="mt-5 flex h-32 items-end gap-2" aria-label={t('homeByMonth')}>
        {costs.months.map((m, i) => {
          const on = m.key === monthKey;
          const real = m.total - m.estimated;
          return (
            <li key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${monthLong(m.key)}: ${money(m.total)}${m.estimated ? ` (${fill(t('homeEstimatedPart'), { amount: money(m.estimated) })})` : ''}`}>
              <span className={cn('text-[11px] font-semibold tabular-nums', on ? 'text-foreground' : 'text-muted-foreground')}>{compact(m.total)}</span>
              <span className="flex min-h-0 w-full max-w-10 flex-1 flex-col justify-end">
                {m.estimated > 0 && (
                  <motion.span
                    className={cn('w-full rounded-t-lg border border-dashed', on ? 'border-primary/70 bg-primary/20' : 'border-primary/40 bg-primary/10', real > 0 && 'border-b-0')}
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.estimated / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                {real > 0 && (
                  <motion.span
                    className={cn('w-full', m.estimated > 0 ? '' : 'rounded-t-lg', on ? 'bg-primary' : 'bg-primary/40')}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(2, (real / max) * 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </span>
              <span className={cn('text-[11px]', on ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{monthShort(m.key)}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border/50 pt-4">
        <p className="text-sm font-semibold">
          {fill(t('homeMonthTotal'), { month: monthLong(monthKey), amount: money(selected.total) })}
          {selected.estimated > 0 && <span className="ms-1.5 font-normal text-muted-foreground">({fill(t('homeEstimatedPart'), { amount: money(selected.estimated) })})</span>}
        </p>
        <p className="text-xs text-muted-foreground">{fill(t('homePaidIn'), { month: monthLong(monthKey), amount: money(selected.paid) })}</p>
      </div>

      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('homeNothing')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/50">
          {lines.map(({ category, cell }) => (
            <li key={category} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-lg" aria-hidden>{iconOf[category] || '🏠'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{translateCategory(category, language)}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{partsLine(cell.parts, t, locale)}</span>
              </span>
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', cell.estimated && 'text-muted-foreground')} dir="ltr">
                {cell.estimated ? '≈ ' : ''}{money(cell.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
