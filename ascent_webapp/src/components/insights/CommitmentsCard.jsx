import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from '@/lib/motion';
import { ArrowUpRight, CalendarClock, Flag, HandCoins, Landmark, Plus, Repeat } from 'lucide-react';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { ProgressRing, BigMoney } from '@/components/commitments/CommitmentParts';
import { commitmentEmoji, durationText, monthYear } from '@/components/commitments/commitmentUtils';
import { commitmentStatus, commitmentsSummary, monthsBetween } from '@shared/commitments';
import { useMoneyFormat, localDay } from './useInsights';

/**
 * Loans and commitments at a glance: what is owed, what leaves every month, the next payment and
 * when the household is debt free. Opens the Loans page.
 */
export default function CommitmentsCard({ commitments, convert }) {
  const { t } = useTheme();
  const { hasPermission } = useAuth();
  const { money, shortDate, locale, currency, blur } = useMoneyFormat();
  const today = localDay();
  const m = (v, cur) => (blur ? '••••' : money(v, cur));

  const summary = useMemo(() => commitmentsSummary(commitments, today, convert), [commitments, today, convert]);
  const top = useMemo(() => commitments
    .filter((c) => c.status !== 'closed' && c.direction !== 'lent')
    .map((c) => ({ c, s: commitmentStatus(c, today) }))
    .filter(({ s }) => !s.done)
    .sort((a, b) => convert(b.s.balance, b.c.currency) - convert(a.s.balance, a.c.currency))
    .slice(0, 3), [commitments, today, convert]);

  const page = createPageUrl('Commitments');
  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><Landmark aria-hidden className="h-4 w-4" /></span>
        {t('commitments')}
      </h2>
      <Link to={page} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0">
        {t('dashViewAll')} <ArrowUpRight aria-hidden className="h-3.5 w-3.5 rtl:-scale-x-100" />
      </Link>
    </div>
  );

  // Nothing owed: a gentle invitation, plus money lent out if there is any
  if (!summary.count) {
    return (
      <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {header}
          <p className="mt-2 max-w-xl text-sm text-muted-foreground text-pretty">
            {summary.lentCount
              ? t('cmDashOnlyLent').replace('{amount}', m(summary.lentBalance)).replace('{count}', summary.lentCount)
              : t('cmDashEmpty')}
          </p>
        </div>
        {hasPermission('editExpenses') && (
          <Link to={`${page}?new=1`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/15">
            <Plus aria-hidden className="h-4 w-4" /> {t('cmNew')}
          </Link>
        )}
      </div>
    );
  }

  const monthsToFree = summary.debtFreeDate ? Math.max(0, monthsBetween(today, summary.debtFreeDate)) : null;
  const next = summary.next;
  const facts = [
    { icon: Repeat, label: t('cmMonthlyTotal'), value: m(summary.monthly) },
    next && {
      icon: CalendarClock, label: t('cmNextPayment'),
      value: m(next.amount, next.commitment.currency),
      sub: `${next.commitment.name} · ${shortDate(next.date)}`,
    },
    {
      icon: Flag, label: t('cmDebtFree'),
      value: summary.debtFreeDate ? monthYear(summary.debtFreeDate, locale) : '—',
      sub: monthsToFree !== null ? t('cmIn').replace('{time}', durationText(monthsToFree, t)) : null,
    },
    summary.lentCount > 0 && { icon: HandCoins, label: t('cmOwedToYou'), value: m(summary.lentBalance), tone: 'text-success' },
  ].filter(Boolean);

  return (
    <div className="p-6">
      {header}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="text-sm text-muted-foreground">{t('cmYouOwe')}</p>
          <BigMoney value={summary.balance} currency={currency} loc={locale} blur={blur} className="mt-1 block text-4xl font-bold tracking-tight" />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
            <motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${summary.progress * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('cmPaidOfBorrowed').replace('{pct}', Math.round(summary.progress * 100)).replace('{amount}', m(summary.principal))}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {facts.map(({ icon: Icon, label, value, sub, tone }) => (
              <div key={label} className="min-w-0 rounded-2xl bg-foreground/[0.04] p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon aria-hidden className="h-3.5 w-3.5" />{label}</dt>
                <dd className={cn('mt-1 truncate text-sm font-semibold tabular-nums', tone || 'text-foreground')}>{value}</dd>
                {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
              </div>
            ))}
          </dl>
        </div>

        <ul className="space-y-2" aria-label={t('cmWhatYouOwe')}>
          {top.map(({ c, s }) => (
            <li key={c.id}>
              <Link
                to={`${page}?id=${c.id}`}
                className="flex items-center gap-3 rounded-2xl bg-foreground/[0.03] p-3 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{commitmentEmoji(c)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums" dir="ltr"><BlurValue blur={blur}>{money(s.balance, c.currency)}</BlurValue></span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {s.next
                      ? `${m(s.next.amount, c.currency)} · ${shortDate(s.next.date)}${s.payoffDate ? ` · ${t('cmEnds')} ${monthYear(s.payoffDate, locale)}` : ''}`
                      : t('cmNoFixedSchedule')}
                  </span>
                </span>
                <ProgressRing value={s.progress} size={40} stroke={4} tone="primary" label={t('cmPaidOffPct').replace('{pct}', Math.round(s.progress * 100))}>
                  <span className="text-[0.625rem]">{Math.round(s.progress * 100)}%</span>
                </ProgressRing>
              </Link>
            </li>
          ))}
          {summary.count > top.length && (
            <li className="px-1 text-xs text-muted-foreground">{t('cmAndMore').replace('{count}', summary.count - top.length)}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
