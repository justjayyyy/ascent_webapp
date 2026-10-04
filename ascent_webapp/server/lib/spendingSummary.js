// A compact picture of a household's money for the AI assistant: totals and patterns, never raw rows,
// people's names or emails. Pure; amounts must already be in the user's currency (`amount`).
import { monthForecast, baselineDaily } from '../../shared/forecast.js';
import { detectSubscriptions } from '../../shared/subscriptions.js';

const round = (n) => Math.round(n);
const monthKey = (date) => String(date).slice(0, 7);

function previousMonths(month, count) {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * @param {object} input
 * @param {Array}  input.transactions  { type, date, amount, category, description, merchant, merchantKey, isRecurring, ... }
 * @param {Array}  [input.budgets]     this month's budgets: { category, limit }
 * @param {string} input.today         'YYYY-MM-DD'
 * @param {string} input.currency
 * @param {(key: string) => string} [input.categoryName]  display name for a category key
 */
export function spendingSummary({ transactions, budgets = [], today, currency, categoryName = (k) => k }) {
  const month = today.slice(0, 7);
  const past = previousMonths(month, 12);
  const rows = transactions.filter((tx) => tx.date && Number.isFinite(tx.amount));

  const monthly = [month, ...past].reverse().map((key) => {
    const list = rows.filter((tx) => monthKey(tx.date) === key && tx.date <= today);
    const income = list.filter((tx) => tx.type === 'Income').reduce((s, tx) => s + tx.amount, 0);
    const expenses = list.filter((tx) => tx.type === 'Expense').reduce((s, tx) => s + tx.amount, 0);
    return { month: key, income: round(income), expenses: round(expenses) };
  }).filter((m) => m.income || m.expenses || m.month === month);

  const byCategory = [month, ...past.slice(0, 5)].map((key) => {
    const totals = {};
    rows.filter((tx) => tx.type === 'Expense' && monthKey(tx.date) === key && tx.date <= today).forEach((tx) => {
      const name = categoryName(tx.category || 'other');
      totals[name] = (totals[name] || 0) + tx.amount;
    });
    return {
      month: key,
      categories: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)])),
    };
  });

  const merchants = (key) => {
    const totals = new Map();
    rows.filter((tx) => tx.type === 'Expense' && monthKey(tx.date) === key && tx.date <= today).forEach((tx) => {
      const name = tx.merchant || tx.description;
      if (!name) return;
      const cur = totals.get(name) || { total: 0, count: 0 };
      totals.set(name, { total: cur.total + tx.amount, count: cur.count + 1 });
    });
    return [...totals].sort((a, b) => b[1].total - a[1].total).slice(0, 12).map(([name, v]) => ({ name, total: round(v.total), count: v.count }));
  };

  const forecast = monthForecast({
    transactions: rows,
    month,
    today,
    budgets,
    baseline: baselineDaily(rows, past.slice(0, 3)),
  });

  return {
    currency,
    today,
    monthly,
    categoriesByMonth: byCategory,
    topMerchantsThisMonth: merchants(month),
    topMerchantsLastMonth: merchants(past[0]),
    thisMonth: {
      income: forecast.income,
      // The usual of the last 3 months, standing in until this month's own income is in (salary for a month
      // is often paid on the 1st of the next and booked to the month it was earned for)
      expectedIncome: forecast.incomeIsExpected ? forecast.incomeUsed : null,
      spentSoFar: forecast.spent,
      stillCommitted: forecast.committed,
      safeToSpend: forecast.base ? forecast.safeToSpend : null,
      safeToSpendBasedOn: forecast.base,
      daysLeft: forecast.daysLeft,
      projectedExpenses: forecast.projectedExpenses,
      projectedNet: forecast.projectedNet,
      upcoming: forecast.upcoming.slice(0, 10).map((u) => ({ what: u.label, date: u.date, amount: round(u.amount), kind: u.kind })),
      budgets: forecast.budgetPace.map((b) => ({ ...b, category: categoryName(b.category) })),
    },
    subscriptions: detectSubscriptions(rows, today).slice(0, 20).map((s) => ({
      name: s.name, cadence: s.cadence, amount: s.amount, monthlyCost: s.monthlyCost, nextDate: s.nextDate, priceChange: s.priceChange,
    })),
  };
}
