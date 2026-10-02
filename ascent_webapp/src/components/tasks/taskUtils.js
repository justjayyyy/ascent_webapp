// Household tasks as plain data: when each is due, which are close, what the next month will cost,
// and what ticking one off changes. No React here, so it is easy to test.

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

export const TASK_KINDS = [
  { key: 'car', emoji: '🚗' },
  { key: 'insurance', emoji: '🛡️' },
  { key: 'home', emoji: '🏠' },
  { key: 'tax', emoji: '🏛️' },
  { key: 'bill', emoji: '🧾' },
  { key: 'health', emoji: '🩺' },
  { key: 'documents', emoji: '🛂' },
  { key: 'kids', emoji: '🎒' },
  { key: 'pets', emoji: '🐾' },
  { key: 'other', emoji: '📌' },
];
export const kindEmoji = (kind) => TASK_KINDS.find((k) => k.key === kind)?.emoji || '📌';
export const taskEmoji = (task) => task?.emoji || kindEmoji(task?.kind);

export const REPEATS = ['none', 'monthly', 'bimonthly', 'quarterly', 'halfYearly', 'yearly'];
const REPEAT_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, halfYearly: 6, yearly: 12 };

/**
 * The household chores most homes have, to start from: [titleKey, kind, repeat, category].
 * Titles are translation keys (tkT_…); the category is a default expense category key.
 */
export const TEMPLATES = [
  ['tkT_carInsurance', 'car', 'yearly', 'insurance'],
  ['tkT_carTest', 'car', 'yearly', 'transportation'],
  ['tkT_carService', 'car', 'yearly', 'transportation'],
  ['tkT_arnona', 'tax', 'bimonthly', 'taxes'],
  ['tkT_homeInsurance', 'insurance', 'yearly', 'insurance'],
  ['tkT_healthInsurance', 'insurance', 'yearly', 'insurance'],
  ['tkT_boilerService', 'home', 'yearly', 'utilities'],
  ['tkT_dentist', 'health', 'halfYearly', 'healthcare'],
  ['tkT_passport', 'documents', 'none', 'other_expense'],
  ['tkT_licence', 'documents', 'none', 'other_expense'],
  ['tkT_schoolFees', 'kids', 'yearly', 'education'],
  ['tkT_petVaccine', 'pets', 'yearly', 'other_expense'],
  ['tkT_taxReturn', 'tax', 'yearly', 'taxes'],
];

export const newEntryId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The same day `months` later, on the month's last day when it is shorter (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return dayKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d, last)));
}

/** When a repeating task comes round next after `dueDate`; null when it does not repeat. */
export const nextDue = (dueDate, repeat) => (dueDate && REPEAT_MONTHS[repeat] ? addMonths(dueDate, REPEAT_MONTHS[repeat]) : null);

/** Days from `today` to the due date: negative when it passed, null without a date. */
export const daysUntil = (task, today = new Date()) => (task?.dueDate ? dayNumber(task.dueDate) - dayNumber(dayKey(today)) : null);

/**
 * Where a task stands: 'done' | 'overdue' | 'today' | 'soon' (inside its reminder window) | 'later' | 'undated'.
 */
export function dueState(task, today = new Date()) {
  if (task.status === 'done') return 'done';
  const days = daysUntil(task, today);
  if (days === null) return 'undated';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= Math.max(task.remindDays ?? 7, 3) ? 'soon' : 'later';
}

/**
 * Open tasks in the order to deal with them, and the done ones apart:
 * { overdue, week (the next 7 days), month (up to 30), later, undated, done }.
 */
export function groupTasks(tasks, today = new Date()) {
  const out = { overdue: [], week: [], month: [], later: [], undated: [], done: [] };
  const byDue = (a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(a.title).localeCompare(String(b.title));
  for (const task of [...tasks].sort(byDue)) {
    if (task.status === 'done') { out.done.push(task); continue; }
    const days = daysUntil(task, today);
    if (days === null) out.undated.push(task);
    else if (days < 0) out.overdue.push(task);
    else if (days <= 7) out.week.push(task);
    else if (days <= 30) out.month.push(task);
    else out.later.push(task);
  }
  out.done.sort((a, b) => String(b.doneAt || b.updated_date || '').localeCompare(String(a.doneAt || a.updated_date || '')));
  return out;
}

/**
 * What open tasks due within `days` (late ones included) will cost, in the viewer's currency:
 * { total, count, tasks }. `toMine(amount, currency)` converts; amounts it cannot convert count as they are.
 */
export function upcomingCost(tasks, { today = new Date(), days = 30, toMine = (a) => a } = {}) {
  const due = tasks.filter((t) => t.status !== 'done' && t.amount > 0 && daysUntil(t, today) !== null && daysUntil(t, today) <= days);
  return {
    total: due.reduce((s, t) => s + (toMine(t.amount, t.currency) ?? t.amount), 0),
    count: due.length,
    tasks: due,
  };
}

/**
 * Ticking a task off: the history entry, and the task's changes. A repeating task moves on to its
 * next date (past today, if it was late more than one round); a one-off one is done.
 */
export function completeChanges(task, { date = dayKey(new Date()), amount = 0, currency = null, logged = false, by = '' } = {}) {
  const entry = {
    id: newEntryId(),
    date,
    dueDate: task.dueDate || null,
    amount: amount > 0 ? amount : 0,
    currency: amount > 0 ? currency || task.currency || null : null,
    logged: !!logged,
    by,
  };
  let next = nextDue(task.dueDate, task.repeat);
  if (next) {
    // Late by more than a round: the next date is the first one after the day it was done
    while (next <= date) next = nextDue(next, task.repeat);
    // What it cost this time is what it will probably cost next time
    return { entry, changes: { dueDate: next, status: 'open', ...(amount > 0 && { amount }) } };
  }
  return { entry, changes: { status: 'done', doneAt: new Date().toISOString() } };
}

/** Undoing a tick: the task as it was before. */
export const undoChanges = (before) => ({
  dueDate: before.dueDate ?? null,
  status: before.status || 'open',
  doneAt: before.doneAt ?? null,
  amount: before.amount ?? 0,
});

/** What the task cost the last few times, newest first. */
export const pastCosts = (task, n = 5) => [...(task.history || [])]
  .filter((h) => h.amount > 0)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  .slice(0, n);
