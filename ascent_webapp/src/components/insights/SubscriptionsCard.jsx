import React, { useState } from 'react';
import { Repeat, TrendingUp } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useMoneyFormat } from './useInsights';

const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);
const COLLAPSED = 5;

/** Payments that repeat on a rhythm, what they cost per month, and which ones got more expensive. */
export default function SubscriptionsCard({ subscriptions }) {
  const { t, language } = useTheme();
  const { money, shortDate, blur } = useMoneyFormat();
  const [open, setOpen] = useState(false);
  const m = (v) => (blur ? '••••' : money(v));
  const total = subscriptions.reduce((s, x) => s + x.monthlyCost, 0);
  // Price rises first: that is the part worth acting on
  const sorted = [...subscriptions].sort((a, b) => (!!b.priceChange - !!a.priceChange) || b.monthlyCost - a.monthlyCost);
  const shown = open ? sorted : sorted.slice(0, COLLAPSED);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Repeat className="h-4 w-4 text-primary" aria-hidden />{t('subsTitle')}</h2>
          {subscriptions.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{fill(t('subsSummary'), { amount: m(total), count: subscriptions.length })}</p>
          )}
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground text-pretty">{t('subsEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/50">
          {shown.map((s) => (
            <li key={s.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`subsCadence_${s.cadence}`)} · {translateCategory(s.category, language)} · {fill(t('subsNext'), { date: shortDate(s.nextDate) })}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-semibold tabular-nums" dir="ltr">{m(s.amount)}</p>
                {s.priceChange && (
                  <p className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger" title={t('subsPriceUp')}>
                    <TrendingUp className="h-3 w-3" aria-hidden />
                    <span className="tabular-nums">+{s.priceChange.pct}% · {fill(t('subsWent'), { from: m(s.priceChange.from) })}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {subscriptions.length > COLLAPSED && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">
          {open ? t('subsShowLess') : fill(t('subsShowAll'), { count: subscriptions.length })}
        </button>
      )}
    </div>
  );
}
