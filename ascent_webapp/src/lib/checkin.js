// The weekly check-in: the few payments that need a person's eye (added automatically and not looked
// at yet, maybe charged twice, or left as "Other"), then the week in a few numbers. Pure data in,
// plain objects out, so it runs under `node --test`.
//
// rows: transactions with `type`, `date` ('YYYY-MM-DD…') and `_amount` in the viewer's currency.
import { isFixed, noSpendStats } from './noSpend.js';

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const fromNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** How far back the check-in looks for payments to review. */
export const LOOK_BACK_DAYS = 30;

// "Other" in every language it may have been saved in
const OTHER = new Set(['', 'other', 'other_expense', 'Other', 'אחר', 'Другое']);
export const isUncategorized = (tx) => tx.type === 'Expense' && OTHER.has(String(tx.category || '').trim());

/** Why a payment is worth a look, most pressing first: 'duplicate' | 'review' | 'category'. */
export function reasonFor(tx) {
  if (tx.status === 'pending' && tx.ingest?.flags?.includes('possibleDuplicate')) return 'duplicate';
  if (tx.status === 'pending') return 'review';
  if (isUncategorized(tx)) return 'category';
  return null;
}

const ORDER = { duplicate: 0, review: 1, category: 2 };

/**
 * The payments to go through: from the last month, already happened, not set aside on this device
 * (`skipped`: ids someone chose to leave as they are). Most pressing first, newest first within.
 */
export function checkinQueue(rows, { today = new Date(), skipped = new Set(), days = LOOK_BACK_DAYS } = {}) {
  const to = dayKey(today);
  const from = fromNumber(dayNumber(to) - days);
  return rows
    .filter((tx) => tx?.id && typeof tx.date === 'string' && tx.date.slice(0, 10) >= from && tx.date.slice(0, 10) <= to)
    .filter((tx) => !String(tx.id).startsWith('local:') && !skipped.has(tx.id))
    .map((tx) => ({ tx, reason: reasonFor(tx) }))
    .filter((x) => x.reason)
    .sort((a, b) => ORDER[a.reason] - ORDER[b.reason] || String(b.tx.date).localeCompare(String(a.tx.date)));
}

/** The original of a possible duplicate: the confirmed payment it was matched to, if it is loaded. */
export function duplicateOriginal(tx, rows) {
  const id = tx.ingest?.duplicateOf;
  return id ? rows.find((r) => r.id === String(id)) || null : null;
}

/**
 * The last seven days in numbers, against a usual week (the average of the eight weeks before, counting
 * only weeks after the first record), and what is already set to go out in the next seven. The week is
 * what was chosen; bills that run by themselves (rent, installments, loans) land in one week of the month
 * and would make it look unusual, so they are counted apart.
 */
export function weekSummary(rows, { today = new Date() } = {}) {
  const to = dayNumber(dayKey(today));
  const inRange = (tx, a, b) => {
    if (tx.type !== 'Expense' || typeof tx.date !== 'string') return false;
    const n = dayNumber(tx.date.slice(0, 10));
    return n >= a && n <= b;
  };
  const sum = (list) => list.reduce((s, x) => s + (x._amount || 0), 0);
  const chosen = (tx, a, b) => inRange(tx, a, b) && !isFixed(tx);
  const week = rows.filter((tx) => chosen(tx, to - 6, to));
  const spent = sum(week);
  const bills = sum(rows.filter((tx) => inRange(tx, to - 6, to) && isFixed(tx)));

  const firstDay = rows.reduce((min, x) => (typeof x.date === 'string' && (!min || x.date < min) ? x.date.slice(0, 10) : min), null);
  const first = firstDay ? dayNumber(firstDay) : to;
  const usualWeeks = [];
  for (let w = 1; w <= 8; w += 1) {
    const end = to - 7 * w;
    if (end - 6 < first) break;
    usualWeeks.push(sum(rows.filter((tx) => chosen(tx, end - 6, end))));
  }
  const usual = usualWeeks.length >= 2 ? usualWeeks.reduce((s, v) => s + v, 0) / usualWeeks.length : null;

  const byCategory = new Map();
  week.forEach((x) => byCategory.set(x.category || 'other', (byCategory.get(x.category || 'other') || 0) + x._amount));
  const top = [...byCategory].sort((a, b) => b[1] - a[1])[0] || null;
  const biggest = week.reduce((best, x) => (x._amount > (best?._amount || 0) ? x : best), null);

  const coming = rows
    .filter((tx) => inRange(tx, to + 1, to + 7))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const streak = noSpendStats(rows, { today });

  return {
    from: fromNumber(to - 6),
    to: fromNumber(to),
    spent,
    bills,
    count: week.length,
    usual,
    change: usual > 0 ? (spent - usual) / usual : null,
    topCategory: top ? { category: top[0], amount: top[1], share: spent > 0 ? top[1] / spent : 0 } : null,
    biggest: biggest ? { amount: biggest._amount, description: biggest.description || biggest.merchant || '', category: biggest.category || 'other', date: biggest.date.slice(0, 10) } : null,
    noSpendDays: streak.weekFree,
    week: streak.week,
    coming: { total: sum(coming), count: coming.length, items: coming.slice(0, 4).map((x) => ({ id: x.id, amount: x._amount, description: x.description || x.merchant || '', category: x.category || 'other', date: x.date.slice(0, 10) })) },
  };
}

/** Whether the check-in is due: something waits for review, or a week passed since the last one. */
export function checkinDue({ queueLength, lastDone, today = new Date() }) {
  if (queueLength > 0) return true;
  if (!lastDone) return true;
  return dayNumber(dayKey(today)) - dayNumber(lastDone) >= 7;
}
