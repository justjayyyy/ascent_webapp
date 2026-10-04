// Which budget counts in which month. A budget is set for a category from a month (its year and month). One
// that repeats carries on into later months until a later budget for that category takes over, or until its
// `until` month ('YYYY-MM', the last month it counts) has passed; one that does not repeat counts in its own
// month only. Earlier months keep the budgets they had: changing one from October adds a row for October.
// Shared by the app and the API.

export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

/** 'YYYY-MM' `n` months after (or before, when negative) `key`. */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** The month a budget starts in, 'YYYY-MM', or null for a row without one. */
export function startOf(budget) {
  const year = Number(budget?.year);
  const month = Number(budget?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return monthKey(year, month);
}

const countsIn = (budget, month) => {
  const start = startOf(budget);
  if (!start || start > month || budget.isActive === false || !budget.category) return false;
  if (start === month) return true;
  return budget.repeat === true && (!budget.until || budget.until >= month);
};

// The later start wins; two of the same month (saved on two phones at once) go to the one saved last
const newer = (a, b) => {
  const sa = startOf(a);
  const sb = startOf(b);
  if (sa !== sb) return sa > sb;
  return String(a.updated_date || a.created_date || '') > String(b.updated_date || b.created_date || '');
};

/**
 * The budgets that count in `month` ('YYYY-MM'), one per category. Each is its stored row with `from` (the
 * month it was set in) and `inherited` (true when set in an earlier month and repeating into this one).
 */
export function budgetsForMonth(budgets, month) {
  const best = new Map();
  for (const b of budgets || []) {
    if (!countsIn(b, month)) continue;
    const held = best.get(b.category);
    if (!held || newer(b, held)) best.set(b.category, b);
  }
  return [...best.values()].map((b) => ({ ...b, from: startOf(b), inherited: startOf(b) < month }));
}

/**
 * What removing a category's budget in `month` changes: `{ updates: [{ id, until }], deletes: [id] }`.
 *  - a budget for that month alone goes, and the month falls back to a repeating one from before, if any;
 *  - a repeating one stops: earlier ones end the month before, and those from this month on go.
 */
export function removalFrom(budgets, category, month) {
  const [current] = budgetsForMonth((budgets || []).filter((b) => b.category === category), month);
  if (!current) return { updates: [], deletes: [] };
  if (!current.inherited && current.repeat !== true) return { updates: [], deletes: [current.id] };
  const updates = [];
  const deletes = [];
  for (const b of budgets) {
    if (b.category !== category) continue;
    const start = startOf(b);
    if (!start) continue;
    if (start >= month) deletes.push(b.id);
    else if (b.repeat === true && (!b.until || b.until >= month)) updates.push({ id: b.id, until: addMonths(month, -1) });
  }
  return { updates, deletes };
}

/** The most recent month of the two years before `month` that had any budgets, and those; null when none did. */
export function lastBudgetedBefore(budgets, month) {
  if (!budgets?.length) return null;
  for (let i = 1; i <= 24; i++) {
    const before = addMonths(month, -i);
    const list = budgetsForMonth(budgets, before);
    if (list.length) return { month: before, budgets: list };
  }
  return null;
}
