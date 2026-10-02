// No-spend days: days the household bought nothing it chose to buy that day. Bills that run on their
// own (recurring rows, installments, loan payments) do not break a day, since nobody decided on them.
// Pure data in, plain object out (no React, no browser), so it runs under `node --test`.
//
// rows: transactions with `type`, `date` ('YYYY-MM-DD…') and `_amount` in the viewer's currency.

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const fromNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Charges that happen by themselves: a standing bill, one installment of a purchase, a loan payment. */
export const isFixed = (tx) => !!(tx.isRecurring || tx.installmentGroupId || tx.commitmentId);

/** A purchase someone chose to make that day. A possible duplicate still waiting for review does not count. */
export const isChosenSpend = (tx) => tx?.type === 'Expense'
  && (tx._amount ?? tx.amount) > 0
  && typeof tx.date === 'string'
  && !isFixed(tx)
  && !(tx.status === 'pending' && tx.ingest?.flags?.includes('possibleDuplicate'));

/** The days with chosen spending, as a Set of 'YYYY-MM-DD'. */
export function spendDays(rows) {
  const out = new Set();
  for (const tx of rows) if (isChosenSpend(tx)) out.add(tx.date.slice(0, 10));
  return out;
}

/** The first day the household recorded anything, or null: days before it say nothing about spending. */
export function firstRecordedDay(rows) {
  let first = null;
  for (const tx of rows) {
    const d = typeof tx.date === 'string' ? tx.date.slice(0, 10) : null;
    if (d && (!first || d < first)) first = d;
  }
  return first;
}

/**
 * Streaks and counts up to `today`.
 * - current: no-spend days in a row ending today (when nothing was bought yet today) or yesterday
 * - todayClear: nothing chosen bought so far today
 * - best: the longest run since `since` (by default a year back), and when it ended
 * - month: this month's no-spend days so far, and each day of the month as 'free' | 'spent' | 'future' | 'before'
 * - week: the last seven days, oldest first
 * Days before the first recorded transaction (or before `since`) are not counted at all.
 */
export function noSpendStats(rows, { today = new Date(), since = null } = {}) {
  const todayKey = dayKey(today);
  const spent = spendDays(rows);
  const yearAgo = dayKey(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  const first = firstRecordedDay(rows);
  const start = [since || yearAgo, first || todayKey].sort().at(-1);
  const counts = (day) => day >= start && day <= todayKey;
  const free = (day) => counts(day) && !spent.has(day);

  // Current run: today counts only while it is still clear
  const todayClear = !spent.has(todayKey);
  let current = 0;
  let n = dayNumber(todayKey) - (todayClear ? 0 : 1);
  while (free(fromNumber(n))) { current += 1; n -= 1; }

  // Best run since the start
  let best = 0;
  let bestEnd = null;
  let run = 0;
  for (let k = dayNumber(start); k <= dayNumber(todayKey); k += 1) {
    const day = fromNumber(k);
    if (free(day)) {
      run += 1;
      if (run > best) { best = run; bestEnd = day; }
    } else run = 0;
  }

  // This month, day by day
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = dayKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1));
    const state = day > todayKey ? 'future' : day < start ? 'before' : spent.has(day) ? 'spent' : 'free';
    return { day, date: i + 1, state };
  });
  // Today only counts once it is over, unless nothing has been bought yet (then it shows as a hopeful "free")
  const monthFree = days.filter((d) => d.state === 'free' && d.day !== todayKey).length;

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = fromNumber(dayNumber(todayKey) - 6 + i);
    return { day, state: day < start ? 'before' : spent.has(day) ? 'spent' : 'free' };
  });

  return {
    today: todayKey,
    start,
    current,
    todayClear,
    best,
    bestEnd,
    month: { free: monthFree, days },
    week,
    weekFree: week.filter((d) => d.state === 'free' && d.day !== todayKey).length,
  };
}

/**
 * No-spend days inside one calendar month that is over or running: { free, longest, counted }.
 * `month` is any date inside it. Days before the household's first record are left out.
 */
export function monthNoSpend(rows, month, today = new Date()) {
  const spent = spendDays(rows);
  const first = firstRecordedDay(rows);
  const todayKey = dayKey(today);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  let free = 0;
  let longest = 0;
  let run = 0;
  let counted = 0;
  for (let d = 1; d <= total; d += 1) {
    const day = dayKey(new Date(month.getFullYear(), month.getMonth(), d));
    // Today is not over yet, and days before anything was recorded say nothing
    if (day >= todayKey || (first && day < first)) { run = 0; continue; }
    counted += 1;
    if (spent.has(day)) { run = 0; continue; }
    free += 1;
    run += 1;
    longest = Math.max(longest, run);
  }
  return { free, longest, counted };
}

/** Streak lengths worth a word: 3, 7, 14, 21, 30 and every 30 after. */
export function streakMilestone(current) {
  if ([3, 7, 14, 21].includes(current)) return current;
  return current >= 30 && current % 30 === 0 ? current : null;
}
