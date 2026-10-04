// What is left to spend this month, and where the month is heading. Pure: the caller converts every
// amount to one currency first (`amount` on each row) and passes today's local date.
//
// Rows dated after today inside the month are money already promised (monthly recurring runs and
// installments are saved ahead as real rows), so they count as committed, not as spent.

const DAY_MS = 86_400_000;

const pad = (n) => String(n).padStart(2, '0');
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayOf = (date) => parseInt(String(date).slice(8, 10), 10);
const round2 = (n) => Math.round(n * 100) / 100;
const RANK = { over: 0, will_exceed: 1, ok: 2 };

/** 'YYYY-MM-DD' plus a number of days (calendar arithmetic, no time zones). */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Spending that follows the day-to-day rhythm, as opposed to fixed or one-off money: recurring
 * runs, installments, big purchases and plan payments are known in advance and never extrapolated.
 */
export const isVariable = (tx) => !tx.isRecurring && !tx.installmentGroupId && !tx.isBigPurchase && !tx.planId && !tx.commitmentId;

/**
 * Average variable spending per day over earlier full months, so the first days of a month have
 * something to lean on. `months` are 'YYYY-MM' keys; months with no expenses at all are skipped.
 */
export function baselineDaily(transactions, months) {
  const totals = months.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const rows = transactions.filter((tx) => tx.type === 'Expense' && String(tx.date).startsWith(key));
    if (!rows.length) return null;
    return rows.filter(isVariable).reduce((s, tx) => s + tx.amount, 0) / daysIn(y, m);
  }).filter((v) => v !== null);
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
}

/** 'YYYY-MM' `n` months before `month`. */
const monthBefore = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/**
 * The income a month can expect before its own has come in: the median of the 3 months before it. A salary
 * paid on the 1st is booked to the month it was earned for, so the month under way usually has none of its
 * own until it is over. Months with nothing recorded at all (before the household started, or outside the
 * rows given) are left out; null when none are left or they had no income.
 */
export function expectedIncome(transactions, month) {
  const totals = [1, 2, 3].map((n) => {
    const key = monthBefore(month, n);
    const rows = transactions.filter((tx) => String(tx.date).startsWith(key));
    if (!rows.length) return null;
    return rows.filter((tx) => tx.type === 'Income').reduce((s, tx) => s + (tx.amount || 0), 0);
  }).filter((v) => v !== null).sort((a, b) => a - b);
  if (!totals.length) return null;
  const mid = Math.floor(totals.length / 2);
  const median = totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;
  return median > 0 ? round2(median) : null;
}

/**
 * @param {object} input
 * @param {Array}  input.transactions  rows of any month: { type, date, amount, category, isRecurring, installmentGroupId, isBigPurchase, planId, description }
 * @param {string} input.month         'YYYY-MM'
 * @param {string} input.today         'YYYY-MM-DD', the viewer's local date
 * @param {Array}  [input.budgets]     this month's budgets: { category, limit }
 * @param {Array}  [input.planDues]    money due that is not a row yet: unpaid plan costs { name, date, amount, planName }
 *                                    and loan payments { kind: 'loan', name, date, amount }
 * @param {number|null} [input.baseline] baselineDaily() of the months before
 */
export function monthForecast({ transactions, month, today, budgets = [], planDues = [], baseline = null }) {
  const [year, mon] = month.split('-').map(Number);
  const days = daysIn(year, mon);
  const first = `${month}-01`;
  const last = `${month}-${pad(days)}`;
  const phase = today < first ? 'future' : today > last ? 'past' : 'current';
  const elapsed = phase === 'past' ? days : phase === 'future' ? 0 : dayOf(today);
  const daysLeft = days - elapsed + (phase === 'current' ? 1 : 0); // today still counts as a day to spend in
  const cutoff = phase === 'current' ? today : phase === 'past' ? last : addDays(first, -1);

  const rows = transactions.filter((tx) => String(tx.date).slice(0, 7) === month);
  const expenses = rows.filter((tx) => tx.type === 'Expense');
  const income = rows.filter((tx) => tx.type === 'Income').reduce((s, tx) => s + tx.amount, 0);

  const done = expenses.filter((tx) => tx.date <= cutoff);
  const ahead = expenses.filter((tx) => tx.date > cutoff);
  const spent = done.reduce((s, tx) => s + tx.amount, 0);

  const dues = planDues.filter((d) => d.date >= first && d.date <= last && d.date > cutoff && d.amount > 0);
  const upcoming = [
    ...ahead.map((tx) => ({
      kind: tx.installmentGroupId ? 'installment' : tx.commitmentId ? 'loan' : tx.isRecurring ? 'recurring' : tx.planId ? 'plan' : 'scheduled',
      label: tx.description || tx.category,
      category: tx.category,
      date: tx.date,
      amount: tx.amount,
    })),
    ...dues.map((d) => ({ kind: d.kind || 'plan', label: d.name, planName: d.planName, date: d.date, amount: d.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const committed = upcoming.reduce((s, u) => s + u.amount, 0);

  // Day-to-day pace: this month's own rhythm, leaning on earlier months while it is still young
  const variableDone = done.filter(isVariable);
  const variableSpent = variableDone.reduce((s, tx) => s + tx.amount, 0);
  const ownPace = elapsed > 0 ? variableSpent / elapsed : 0;
  const weight = Math.min(1, elapsed / 10);
  const pace = baseline === null ? ownPace : weight * ownPace + (1 - weight) * baseline;
  const restDays = phase === 'current' ? days - elapsed : phase === 'future' ? days : 0; // days after today
  const expectedVariable = pace * restDays;

  const perDay = Array.from({ length: days }, () => 0);
  variableDone.forEach((tx) => { perDay[dayOf(tx.date) - 1] += tx.amount; });
  const spread = stdev(perDay.slice(0, elapsed)) || (baseline ? baseline * 0.6 : 0);
  const margin = 1.28 * spread * Math.sqrt(restDays); // ~80% band for the days still to come

  const projectedExpenses = spent + committed + expectedVariable;
  const budgetTotal = budgets.reduce((s, b) => s + (b.limit || 0), 0);
  // Until this month's own income is in, what the months before brought in stands for it
  const incomeExpected = phase === 'past' ? null : expectedIncome(transactions, month);
  const incomeUsed = Math.max(income, incomeExpected || 0);
  const base = incomeUsed > 0 ? 'income' : budgetTotal > 0 ? 'budgets' : null;
  const baseAmount = base === 'income' ? incomeUsed : base === 'budgets' ? budgetTotal : 0;
  const safeToSpend = baseAmount - spent - committed;

  // Cumulative spending by day: actual up to today, then the expected path with its band
  const committedByDay = Array.from({ length: days }, () => 0);
  upcoming.forEach((u) => { committedByDay[dayOf(u.date) - 1] += u.amount; });
  const allByDay = Array.from({ length: days }, () => 0);
  done.forEach((tx) => { allByDay[dayOf(tx.date) - 1] += tx.amount; });
  const path = [];
  let actual = 0;
  let expected = 0;
  for (let d = 1; d <= days; d += 1) {
    if (d <= elapsed) {
      actual += allByDay[d - 1];
      expected = actual;
      path.push({ day: d, actual: round2(actual), expected: d === elapsed ? round2(actual) : null, low: null, high: null });
    } else {
      expected += committedByDay[d - 1] + pace;
      const band = 1.28 * spread * Math.sqrt(d - elapsed);
      path.push({ day: d, actual: null, expected: round2(expected), low: round2(Math.max(actual, expected - band)), high: round2(expected + band) });
    }
  }

  const budgetPace = budgets.map((b) => {
    const catDone = done.filter((tx) => tx.category === b.category);
    const catSpent = catDone.reduce((s, tx) => s + tx.amount, 0);
    const catAhead = upcoming.filter((u) => u.category === b.category);
    const catCommitted = catAhead.reduce((s, u) => s + u.amount, 0);
    const catPace = elapsed > 0 ? catDone.filter(isVariable).reduce((s, tx) => s + tx.amount, 0) / elapsed : 0;
    const projected = catSpent + catCommitted + catPace * restDays;
    let status = 'ok';
    let overOn = null;
    if (b.limit > 0 && catSpent > b.limit) status = 'over';
    else if (b.limit > 0 && projected > b.limit && phase !== 'past') {
      status = 'will_exceed';
      // Walk the rest of the month day by day until the limit is crossed
      let running = catSpent;
      const startDay = phase === 'future' ? 1 : elapsed + 1;
      for (let d = startDay; d <= days && !overOn; d += 1) {
        const date = `${month}-${pad(d)}`;
        running += catPace + catAhead.filter((u) => u.date === date).reduce((s, u) => s + u.amount, 0);
        if (running > b.limit) overOn = date;
      }
    }
    return {
      category: b.category,
      limit: b.limit,
      spent: round2(catSpent),
      committed: round2(catCommitted),
      projected: round2(projected),
      status,
      overOn,
    };
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || b.projected / (b.limit || 1) - a.projected / (a.limit || 1));

  return {
    phase,
    days,
    elapsed,
    daysLeft,
    income: round2(income),
    expectedIncome: incomeExpected,
    incomeUsed: round2(incomeUsed),
    incomeIsExpected: incomeUsed > income,
    spent: round2(spent),
    committed: round2(committed),
    upcoming,
    pace: round2(pace),
    projectedExpenses: round2(projectedExpenses),
    projectedLow: round2(Math.max(spent + committed, projectedExpenses - margin)),
    projectedHigh: round2(projectedExpenses + margin),
    projectedNet: round2(incomeUsed - projectedExpenses),
    base,
    baseAmount: round2(baseAmount),
    safeToSpend: round2(safeToSpend),
    perDay: daysLeft > 0 ? round2(Math.max(0, safeToSpend) / daysLeft) : 0,
    budgetPace,
    path,
  };
}
