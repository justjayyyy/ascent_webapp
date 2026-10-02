import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import BlurValue from '../BlurValue';
import { createPageUrl } from '@/utils';
import { kindEmoji } from '../plans/planUtils';
import { localDay } from '@/lib/localDay';

/**
 * Plan costs (flights, a venue deposit) that fall due in the selected period and are not paid yet,
 * so the months before a big event show what is coming.
 */
function PlannedPayments({ plans, selectedYear, selectedMonths }) {
  const { t, language, user } = useTheme();
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const blur = !!user?.blurValues;

  const rows = useMemo(() => {
    const year = parseInt(selectedYear, 10);
    const months = selectedMonths.map(Number);
    const out = [];
    plans.forEach((plan) => {
      if (plan.status === 'archived' || plan.status === 'done') return;
      (plan.items || []).forEach((item) => {
        if (item.status === 'paid' || !item.dueDate || !(item.amount > 0)) return;
        const d = new Date(`${item.dueDate}T12:00:00`);
        if (d.getFullYear() !== year) return;
        if (months.length && !months.includes(d.getMonth() + 1)) return;
        out.push({ plan, item });
      });
    });
    return out.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
  }, [plans, selectedYear, selectedMonths]);

  if (!rows.length) return null;

  const money = (v, c) => new Intl.NumberFormat(loc, { style: 'currency', currency: c || user?.currency || 'ILS', maximumFractionDigits: 0 }).format(v || 0);
  const shortDate = (d) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`));
  const today = localDay();

  return (
    <section className="rounded-3xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 sm:p-5" aria-label={t('comingUpFromPlans')}>
      <div className="flex items-center gap-2">
        <CalendarClock aria-hidden className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t('comingUpFromPlans')}</h2>
      </div>
      <ul className="mt-2 divide-y divide-border/30">
        {rows.slice(0, 6).map(({ plan, item }) => (
          <li key={`${plan.id}-${item.id}`}>
            <Link
              to={`${createPageUrl('Plans')}?plan=${plan.id}`}
              className="flex min-h-12 items-center gap-3 rounded-xl py-2 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="text-lg leading-none">{plan.emoji || kindEmoji(plan.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{item.name || t('planItem')}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {plan.name} · <span className={item.dueDate < today ? 'text-danger' : undefined}>{shortDate(item.dueDate)}</span>
                  {item.status === 'booked' ? ` · ${t('planStatus_booked')}` : ''}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                <BlurValue blur={blur}>{money(item.amount, plan.currency)}</BlurValue>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default memo(PlannedPayments);
