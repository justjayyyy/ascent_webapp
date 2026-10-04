import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle, Settings2 } from 'lucide-react';
import { motion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import BlurValue from '../BlurValue';
import { Button } from '@/components/ui/button';
import { useMoney } from '@/hooks/useWorkspaceData';
import { budgetsForMonth, lastBudgetedBefore, monthKey } from '@shared/budgets';
import { monthNames } from './budgetMonths';
import { localDay } from '@/lib/localDay';

/**
 * The months a period covers, 'YYYY-MM': the months picked, or with none picked the year so far (all of a past
 * year, nothing of a future one).
 */
export function periodMonths(selectedYear, selectedMonths = [], now = new Date()) {
  const year = parseInt(selectedYear, 10);
  if (!year) return [];
  if (selectedMonths?.length) return selectedMonths.map((m) => monthKey(year, parseInt(m, 10))).sort();
  const last = year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0;
  return Array.from({ length: last }, (_, i) => monthKey(year, i + 1));
}

/**
 * Each budgeted category against what was spent in it. Over several months a category's limits add up, and
 * only spending in months it had a budget counts. In the month under way a tick marks where spending would
 * be at an even pace, and each says what is left of it for the rest of the month.
 */
function BudgetProgress({ budgets, transactions, formatCurrency, selectedYear, selectedMonths = [], onManage, canEdit = false }) {
  const { language, user, t } = useTheme();
  const userCurrency = user?.currency || 'ILS';
  const blur = !!user?.blurValues;
  const { amountOf, convert } = useMoney(userCurrency);

  const months = useMemo(() => periodMonths(selectedYear, selectedMonths), [selectedYear, selectedMonths]);

  // Today's place in the month, when exactly the month under way is shown
  const pace = useMemo(() => {
    const now = new Date();
    if (months.length !== 1 || months[0] !== monthKey(now.getFullYear(), now.getMonth() + 1)) return null;
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { share: now.getDate() / days };
  }, [months]);

  // Per category and month, as the Dashboard counts it: spent is what is dated up to today; what is dated later
  // (rent on the 25th, the next instalment) is still to come; a payment held as a possible duplicate is neither.
  // Each month's budget is held against that month's spending only.
  const spending = useMemo(() => {
    const wanted = new Set(months);
    const today = localDay();
    const spent = {};
    const coming = {};
    for (const tx of transactions) {
      if (!tx.date || tx.type !== 'Expense') continue;
      if (tx.status === 'pending' && tx.ingest?.flags?.includes('possibleDuplicate')) continue;
      // Read from the text: new Date('2026-03-01') is UTC midnight, which is still February west of London
      const month = String(tx.date).slice(0, 7);
      if (!wanted.has(month)) continue;
      const key = `${tx.category}|${month}`;
      const into = String(tx.date).slice(0, 10) > today ? coming : spent;
      into[key] = (into[key] || 0) + amountOf(tx);
    }
    return { spent, coming };
  }, [transactions, amountOf, months]);

  const { rows, outside } = useMemo(() => {
    const byCategory = new Map();
    const budgeted = new Set();
    for (const month of months) {
      for (const budget of budgetsForMonth(budgets, month)) {
        const key = `${budget.category}|${month}`;
        budgeted.add(key);
        const row = byCategory.get(budget.category) || { id: budget.id, category: budget.category, limit: 0, spent: 0, coming: 0, threshold: 80 };
        row.limit += convert(budget.monthlyLimit, budget.currency) ?? budget.monthlyLimit;
        row.spent += spending.spent[key] || 0;
        row.coming += spending.coming[key] || 0;
        row.threshold = Number(budget.alertThreshold) || 80; // the latest month's
        byCategory.set(budget.category, row);
      }
    }
    // Spent in categories that had no budget that month
    const outsideBudgets = Object.entries(spending.spent).reduce((s, [key, amount]) => (budgeted.has(key) ? s : s + amount), 0);
    const list = [...byCategory.values()].map((row) => {
      const percentage = row.limit > 0 ? (row.spent / row.limit) * 100 : 0;
      // Warnings look ahead to what is already scheduled
      const committed = row.limit > 0 ? ((row.spent + row.coming) / row.limit) * 100 : 0;
      return {
        ...row,
        remaining: row.limit - row.spent - row.coming,
        percentage,
        isOverBudget: percentage > 100,
        isAtLimit: percentage <= 100 && committed === 100,
        isNearLimit: percentage <= 100 && committed >= row.threshold && committed !== 100,
      };
    }).sort((a, b) => (b.spent + b.coming) / (b.limit || 1) - (a.spent + a.coming) / (a.limit || 1));
    return { rows: list, outside: outsideBudgets };
  }, [months, budgets, spending, convert]);

  // A single month with no budgets, after months that had some: offer whoever may edit them to set it up
  const unset = useMemo(() => {
    if (rows.length || months.length !== 1 || !onManage || !canEdit) return null;
    return lastBudgetedBefore(budgets, months[0]) ? months[0] : null;
  }, [rows.length, months, budgets, onManage, canEdit]);

  if (unset) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t('budgetTracking')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('bdNoneThisMonth', { month: monthNames(unset, language).name })}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onManage} className="h-11 rounded-full sm:h-9">
          {t('bdSetUpMonth', { month: monthNames(unset, language).name })}
        </Button>
      </section>
    );
  }

  if (rows.length === 0) return null;

  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  // In the month under way: what is left of every budget, less what is still to come
  const totalLeft = totalLimit - totalSpent - rows.reduce((s, r) => s + r.coming, 0);
  const pct = (v, limit) => (limit > 0 ? Math.max(0, Math.min(100, (v / limit) * 100)) : 0);

  return (
    <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t('budgetTracking')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums" dir="auto">
            <BlurValue blur={blur}>
              {pace && totalLeft >= 0
                ? t('bdLeftOfTotal', { left: formatCurrency(totalLeft, userCurrency), limit: formatCurrency(totalLimit, userCurrency) })
                : t('bdOfTotal', { spent: formatCurrency(totalSpent, userCurrency), limit: formatCurrency(totalLimit, userCurrency) })}
            </BlurValue>
          </p>
        </div>
        {onManage && (
          <Button type="button" variant="ghost" size="icon" aria-label={t('manageBudgets')} onClick={onManage}
            className="-me-2 -mt-2 h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:bg-foreground/10">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <ul className="mt-3 space-y-4">
        {rows.map((row) => {
          const tone = row.isOverBudget ? 'bg-danger' : row.isAtLimit ? 'bg-orange-500' : row.isNearLimit ? 'bg-yellow-500' : 'bg-success';
          const category = translateCategory(row.category, language);
          return (
            <li key={row.category}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{category}</span>
                  {row.isOverBudget && <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-danger" />}
                  {row.isAtLimit && <CheckCircle aria-hidden className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />}
                  {row.isNearLimit && <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />}
                </span>
                <span className={cn('shrink-0 text-sm font-semibold tabular-nums', row.isOverBudget ? 'text-danger' : 'text-foreground')} dir="ltr">
                  <BlurValue blur={blur}>{formatCurrency(row.remaining, userCurrency)}</BlurValue>
                </span>
              </div>
              <div className="relative mt-2">
                <div className="h-2 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={Math.round(row.percentage)} aria-valuemin={0} aria-valuemax={100}
                  aria-label={t('a11yBudgetUsed').replace('{category}', category).replace('{percent}', Math.round(row.percentage))}>
                  <div className="flex h-full">
                    <motion.div className={cn('h-full rounded-full', tone)} initial={{ width: 0 }} animate={{ width: `${pct(row.spent, row.limit)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                    {row.coming > 0 && (
                      <motion.div className={cn('h-full rounded-full opacity-35', tone)} initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct(row.coming, row.limit), 100 - pct(row.spent, row.limit))}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                    )}
                  </div>
                </div>
                {pace && (
                  <span
                    className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded-full bg-foreground/50 rtl:translate-x-1/2"
                    style={{ insetInlineStart: `${pace.share * 100}%` }}
                    title={blur ? undefined : t('bdPaceMark', { amount: formatCurrency(row.limit * pace.share, userCurrency) })}
                    aria-hidden
                  />
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span dir="ltr"><BlurValue blur={blur}>{formatCurrency(row.spent, userCurrency)} / {formatCurrency(row.limit, userCurrency)}</BlurValue></span>
                  {row.coming > 0 && <span><BlurValue blur={blur}>{t('bdComing', { amount: formatCurrency(row.coming, userCurrency) })}</BlurValue></span>}
                </span>
                <span className="text-end tabular-nums">
                  <BlurValue blur={blur}>
                    {row.isOverBudget
                      ? `${t('overBudgetBy')} ${formatCurrency(row.spent - row.limit, userCurrency)}`
                      : row.isAtLimit
                        ? t('reachedLimit')
                        : row.isNearLimit
                          ? t('approachingLimit')
                          : pace && row.remaining > 0
                            ? t('bdLeftMonth', { amount: formatCurrency(row.remaining, userCurrency) })
                            : `${row.percentage.toFixed(0)}%`}
                  </BlurValue>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {outside > 0 && (
        <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground tabular-nums">
          <BlurValue blur={blur}>{t('bdOutside', { amount: formatCurrency(outside, userCurrency) })}</BlurValue>
        </p>
      )}
    </section>
  );
}

export default React.memo(BudgetProgress);
