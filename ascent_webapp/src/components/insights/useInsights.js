import { useMemo, useCallback } from 'react';
import { useBudgets, useCommitments, usePlans } from '@/hooks/useWorkspaceData';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { monthForecast, baselineDaily } from '@shared/forecast';
import { detectSubscriptions } from '@shared/subscriptions';
import { duesBetween } from '@shared/commitments';
import { localDay, localMonth } from '@/lib/localDay';

export { localDay };
const monthOf = localMonth;

/** Money in the viewer's currency, with the same locale rules as the rest of the Dashboard. */
export function useMoneyFormat() {
  const { user, language } = useTheme();
  const currency = user?.currency || 'ILS';
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const money = useCallback((v, cur = currency) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v || 0);
    } catch {
      return `${Math.round(v || 0)} ${cur}`;
    }
  }, [locale, currency]);
  const shortDate = useCallback((date) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)), [locale]);
  return { money, shortDate, locale, currency, blur: !!user?.blurValues };
}

const trusted = (list) => list
  .filter((tx) => !(tx.status === 'pending' && tx.ingest?.flags?.includes('possibleDuplicate')))
  .map((tx) => ({ ...tx, amount: tx._amount }));

/**
 * Forecast and subscriptions for the Dashboard, from the rows it already loaded. `rows` (the recent
 * window) carry `_amount` in the viewer's currency; `convert(amount, from)` handles budgets and plans.
 */
export function useInsights({ rows, selectedMonth, convert }) {
  const { hasPermission } = useAuth();
  const canBudgets = hasPermission('viewBudgets');

  const { data: budgets = [] } = useBudgets({ enabled: canBudgets });
  const { data: plans = [] } = usePlans();
  const { data: commitments = [] } = useCommitments();

  const today = localDay();
  const month = monthOf(selectedMonth);

  // Rows the insights can trust: in the viewer's currency, without suspected duplicates still waiting for review
  const usable = useMemo(() => trusted(rows), [rows]);

  const forecast = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const monthBudgets = budgets
      .filter((b) => Number(b.year) === y && Number(b.month) === m && b.isActive !== false)
      .map((b) => ({ category: b.category, limit: convert(b.monthlyLimit, b.currency) }));
    const planDues = plans
      .filter((p) => p.status !== 'archived' && p.status !== 'done')
      .flatMap((p) => (p.items || [])
        .filter((i) => i.status !== 'paid' && i.dueDate && i.amount > 0)
        .map((i) => ({ name: i.name, planName: p.name, date: i.dueDate, amount: convert(i.amount, p.currency) })));
    // Loan payments due this month, unless that month's payment is already recorded in Expenses
    const recorded = new Set(usable.filter((tx) => tx.commitmentId && !tx.commitmentPaymentId && String(tx.date).startsWith(month)).map((tx) => tx.commitmentId));
    const loanDues = commitments
      .filter((c) => c.direction !== 'lent' && !recorded.has(c.id))
      .flatMap((c) => duesBetween(c, `${month}-01`, `${month}-31`)
        .map((d) => ({ kind: 'loan', name: c.name, date: d.date, amount: convert(d.amount, c.currency) })));
    const earlier = [1, 2, 3].map((i) => monthOf(new Date(y, m - 1 - i, 1)));
    return monthForecast({ transactions: usable, month, today, budgets: monthBudgets, planDues: [...planDues, ...loanDues], baseline: baselineDaily(usable, earlier) });
  }, [usable, budgets, plans, commitments, month, today, convert]);

  const subscriptions = useMemo(() => detectSubscriptions(usable, today), [usable, today]);

  return { forecast, subscriptions, commitments, today };
}
