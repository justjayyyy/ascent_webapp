import React from 'react';
import NumberFlow from '@number-flow/react';
import { Repeat, CreditCard, CalendarClock, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useMoneyFormat } from './useInsights';

const KIND_ICON = { recurring: Repeat, installment: CreditCard, plan: CalendarClock, scheduled: CalendarDays };
const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);

function Big({ value, blur, locale, currency, className }) {
  if (blur) return <BlurValue blur className={className} />;
  return (
    <NumberFlow
      className={className}
      value={Math.round(value)}
      locales={locale}
      format={{ style: 'currency', currency, maximumFractionDigits: 0 }}
      trend={0}
    />
  );
}

/**
 * What is left to spend this month once spending so far and payments already promised are counted,
 * with the pace, the month-end projection and the budgets that are drifting.
 */
export default function SafeToSpendCard({ forecast: f, isShared }) {
  const { t, language } = useTheme();
  const { money, shortDate, locale, currency, blur } = useMoneyFormat();
  const m = (v) => (blur ? '••••' : money(v));

  if (f.phase === 'past') {
    return (
      <div className="flex h-full flex-col justify-between gap-4 p-6">
        <p className="text-sm text-muted-foreground">{t('stsPastMonth')}</p>
        <Big value={f.projectedNet} blur={blur} locale={locale} currency={currency}
          className={cn('text-4xl font-bold tracking-tight md:text-5xl', f.projectedNet < 0 && 'text-danger')} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {t('stsSpent')} {m(f.spent)} · {t('income')} {m(f.income)}
        </p>
      </div>
    );
  }

  const over = f.base && f.safeToSpend < 0;
  const base = Math.max(f.baseAmount, f.spent + f.committed, 1);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`;
  const atRisk = f.budgetPace.filter((b) => b.status !== 'ok');

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{f.phase === 'future' ? t('stsFutureMonth') : t('stsTitle')}</p>
        {f.base ? (
          <>
            <Big value={over ? -f.safeToSpend : f.safeToSpend} blur={blur} locale={locale} currency={currency}
              className={cn('mt-2 block text-4xl font-bold tracking-tight md:text-5xl', over && 'text-danger')} />
            <p className="mt-1 text-sm text-muted-foreground">
              {over ? fill(t('stsOver'), { amount: m(-f.safeToSpend) }) : t(isShared ? 'stsTogether' : 'stsSolo')}
            </p>
            {/* On the last day the daily figure is the headline itself */}
            {!over && f.phase === 'current' && f.daysLeft > 1 && (
              <p className="mt-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary tabular-nums">
                {fill(t('stsPerDay'), { amount: m(f.perDay), days: f.daysLeft })}
              </p>
            )}
            {f.base === 'budgets' && <p className="mt-2 text-xs text-muted-foreground text-pretty">{t('stsBasedOnBudgets')}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground text-pretty">{t('stsNoBase')}</p>
        )}
      </div>

      {f.base && (
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/[0.06]" role="img"
            aria-label={`${t('stsSpent')} ${m(f.spent)}, ${t('stsCommitted')} ${m(f.committed)}, ${t('stsLeft')} ${m(Math.max(0, f.safeToSpend))}`}>
            <span className={cn('h-full', over ? 'bg-danger' : 'bg-primary')} style={{ width: pct(f.spent) }} />
            <span className="h-full bg-primary/40" style={{ width: pct(f.committed) }} />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {[
              ['stsSpent', f.spent, over ? 'bg-danger' : 'bg-primary'],
              ['stsCommitted', f.committed, 'bg-primary/40'],
              ['stsLeft', Math.max(0, f.safeToSpend), 'bg-foreground/15'],
            ].map(([key, v, dot]) => (
              <div key={key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-muted-foreground"><span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />{t(key)}</dt>
                <dd className="mt-0.5 truncate font-semibold tabular-nums text-foreground">{m(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {f.phase === 'current' && (
        <p className="text-sm text-muted-foreground text-pretty tabular-nums">
          {fill(t('stsProjection'), { amount: m(f.projectedExpenses) })}
          {!blur && f.projectedHigh > f.projectedLow && ` (${fill(t('stsRange'), { low: money(f.projectedLow), high: money(f.projectedHigh) })})`}
          {f.income > 0 && (
            <>
              {' · '}
              <span className={cn('font-medium', f.projectedNet < 0 ? 'text-danger' : 'text-success')}>
                {fill(t('stsProjectedNet'), { amount: m(f.projectedNet) })}
              </span>
            </>
          )}
        </p>
      )}

      {f.upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('stsComingUp')}</h3>
          <ul className="mt-2 space-y-1.5">
            {f.upcoming.slice(0, 4).map((u, i) => {
              const Icon = KIND_ICON[u.kind] || CalendarDays;
              return (
                <li key={`${u.date}-${i}`} className="flex items-center gap-3 text-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-foreground/5 text-muted-foreground" title={t(`stsKind_${u.kind}`)}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {u.label && u.label !== u.category ? u.label : translateCategory(u.category, language)}
                    <span className="text-muted-foreground"> · {shortDate(u.date)}{u.planName ? ` · ${u.planName}` : ''}</span>
                  </span>
                  <span className="font-medium tabular-nums" dir="ltr">{m(u.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {f.budgetPace.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('stsPace')}</h3>
          {atRisk.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('stsOnTrack')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {atRisk.slice(0, 3).map((b) => (
                <li key={b.category} className="flex items-start gap-3 text-sm">
                  <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', b.status === 'over' ? 'text-danger' : 'text-danger/60')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{translateCategory(b.category, language)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.status === 'over'
                        ? fill(t('stsIsOver'), { amount: m(b.spent - b.limit) })
                        : fill(t('stsWillExceed'), { date: b.overOn ? shortDate(b.overOn) : '' })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fill(t('stsSpentOf'), { spent: m(b.spent), limit: m(b.limit) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
