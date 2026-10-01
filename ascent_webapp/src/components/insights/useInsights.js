import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { monthForecast, baselineDaily } from '../../../shared/forecast.js';
import { detectSubscriptions } from '../../../shared/subscriptions.js';
import { householdBalances } from '../../../shared/balances.js';
import { duesBetween } from '../../../shared/commitments.js';

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

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

/**
 * Forecast, subscriptions and household balances for the Dashboard, from the rows it already loaded.
 * `rows` carry `_amount` (the viewer's currency); `convert(amount, from)` handles budgets and plans.
 */
export function useInsights({ rows, selectedMonth, convert }) {
  const { user } = useTheme();
  const { hasPermission } = useAuth();
  const userId = user?.id || user?._id;
  const enabled = !!user?.email;
  const canBudgets = hasPermission('viewBudgets');

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', userId],
    queryFn: () => ascent.entities.Budget.list('-created_date'),
    enabled: enabled && canBudgets,
    staleTime: 3 * 60 * 1000,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', userId],
    queryFn: () => ascent.entities.Plan.list('startDate'),
    enabled,
    staleTime: 3 * 60 * 1000,
  });
  const { data: commitments = [] } = useQuery({
    queryKey: ['commitments', userId],
    queryFn: () => ascent.entities.Commitment.list('-created_date'),
    enabled,
    staleTime: 3 * 60 * 1000,
  });
  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements', userId],
    queryFn: () => ascent.entities.Settlement.list('-date'),
    enabled,
    staleTime: 60 * 1000,
  });

  const today = localDay();
  const month = monthOf(selectedMonth);

  // Rows the forecast can trust: in the viewer's currency, without suspected duplicates still waiting for review
  const usable = useMemo(() => rows
    .filter((tx) => !(tx.status === 'pending' && tx.ingest?.flags?.includes('possibleDuplicate')))
    .map((tx) => ({ ...tx, amount: tx._amount })), [rows]);

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

  const balances = useMemo(() => householdBalances({
    transactions: usable,
    settlements: settlements.map((s) => ({ ...s, amount: convert(s.amount, s.currency) })),
  }), [usable, settlements, convert]);

  return { forecast, subscriptions, balances, commitments, today };
}
