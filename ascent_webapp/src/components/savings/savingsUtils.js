import { addMonths, differenceInCalendarDays, differenceInCalendarMonths, format, parseISO, startOfMonth, subDays } from 'date-fns';

export const SAVING_KINDS = [
  { key: 'emergency', emoji: '🛟' },
  { key: 'vacation', emoji: '🏝️' },
  { key: 'home', emoji: '🏡' },
  { key: 'car', emoji: '🚗' },
  { key: 'education', emoji: '🎓' },
  { key: 'wedding', emoji: '💍' },
  { key: 'baby', emoji: '🍼' },
  { key: 'gadget', emoji: '💻' },
  { key: 'retirement', emoji: '🌅' },
  { key: 'other', emoji: '🐷' },
];

const kindEmoji = (kind) => SAVING_KINDS.find((k) => k.key === kind)?.emoji || '🐷';

/** The goal's kind; goals from before the Savings page only had a broad category. */
export const kindOf = (goal) => goal?.kind || ({ emergency: 'emergency', retirement: 'retirement' }[goal?.category]) || 'other';
export const goalEmoji = (goal) => goal?.emoji || kindEmoji(kindOf(goal));

export const newEntryId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** What is in the goal: what was there when it was set up, plus every deposit, less every withdrawal. */
export const savedIn = (goal) => (goal?.currentAmount || 0) + (goal?.entries || []).reduce((s, e) => s + (e.amount || 0), 0);

// How far back the saving pace looks
const PACE_DAYS = 90;
const MONTH_DAYS = 30.44;

/**
 * Where a goal stands, in its own currency: saved, still to go, what each month needs to reach the
 * target by its date, the pace the household has actually kept (last three months), and when that
 * pace (or the monthly plan, when there is one) gets it there.
 *
 * status: 'reached' | 'open' (no target) | 'onTrack' | 'behind' | 'late' (date passed) | 'start' (nothing put aside yet)
 */
export function goalTotals(goal, today = new Date()) {
  const entries = goal.entries || [];
  const saved = savedIn(goal);
  const target = goal.targetAmount || 0;
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.max(0, Math.min(1, saved / target)) : null;
  const monthKey = format(today, 'yyyy-MM');

  const thisMonth = entries.filter((e) => (e.date || '').startsWith(monthKey)).reduce((s, e) => s + (e.amount || 0), 0);

  // Pace: net saved over the last three months, or since the first entry when the goal is younger
  const dated = entries.filter((e) => e.date).map((e) => e.date).sort();
  let pace = 0;
  if (dated.length) {
    const windowStart = subDays(today, PACE_DAYS);
    const first = parseISO(dated[0]);
    const from = first > windowStart ? first : windowStart;
    const fromKey = format(from, 'yyyy-MM-dd');
    const net = entries.filter((e) => e.date && e.date >= fromKey).reduce((s, e) => s + (e.amount || 0), 0);
    const months = Math.max(1, (differenceInCalendarDays(today, from) + 1) / MONTH_DAYS);
    pace = Math.max(0, net / months);
  }

  const monthly = goal.monthlyAmount || 0;
  const rate = monthly > 0 ? monthly : pace;

  const date = goal.targetDate ? parseISO(goal.targetDate) : null;
  const daysLeft = date ? differenceInCalendarDays(date, today) : null;
  const monthsLeft = date ? Math.max(1, differenceInCalendarMonths(date, today)) : null;
  const needPerMonth = target > 0 && remaining > 0 && daysLeft !== null && daysLeft >= 0 ? remaining / monthsLeft : null;
  const projected = target > 0 && remaining > 0 && rate > 0 ? format(addMonths(today, Math.ceil(remaining / rate)), 'yyyy-MM') : null;

  let status;
  if (target > 0 && saved >= target) status = 'reached';
  else if (!(target > 0)) status = 'open';
  else if (daysLeft !== null && daysLeft < 0) status = 'late';
  else if (!(rate > 0)) status = 'start';
  else if (needPerMonth === null) status = 'onTrack';
  else status = rate >= needPerMonth * 0.95 ? 'onTrack' : 'behind';

  return { saved, target, remaining, pct, thisMonth, pace, monthly, rate, daysLeft, monthsLeft, needPerMonth, projected, status };
}

/**
 * The goal month by month, from its first month to this one: money in, money out, and the balance at the
 * end of each month. At most the last 36 months.
 */
export function savingsHistory(goal, today = new Date()) {
  const entries = (goal.entries || []).filter((e) => e.date);
  const buckets = new Map();
  entries.forEach((e) => {
    const key = e.date.slice(0, 7);
    const b = buckets.get(key) || { in: 0, out: 0 };
    if (e.amount >= 0) b.in += e.amount; else b.out -= e.amount;
    buckets.set(key, b);
  });
  const created = goal.created_date ? format(new Date(goal.created_date), 'yyyy-MM') : null;
  const keys = [...buckets.keys(), format(today, 'yyyy-MM'), ...(created ? [created] : [])].sort();
  const out = [];
  let balance = goal.currentAmount || 0;
  let cursor = startOfMonth(parseISO(`${keys[0]}-01`));
  const last = startOfMonth(today);
  for (let i = 0; cursor <= last && i < 600; i += 1) {
    const key = format(cursor, 'yyyy-MM');
    const b = buckets.get(key) || { in: 0, out: 0 };
    balance += b.in - b.out;
    out.push({ key, in: b.in, out: b.out, balance });
    cursor = addMonths(cursor, 1);
  }
  return out.slice(-36);
}

export const MILESTONES = [25, 50, 75, 100];

/** The highest milestone (percent of the target) that a change from `before` to `after` reached, or null. */
export function milestoneCrossed(before, after, target) {
  if (!(target > 0) || !(after > before)) return null;
  const hit = MILESTONES.filter((m) => before < (target * m) / 100 && after >= (target * m) / 100);
  return hit.length ? hit[hit.length - 1] : null;
}

/** Entries newest first; same-day entries keep the order they were added in, latest on top. */
export const entriesNewestFirst = (entries = []) => entries
  .map((e, i) => ({ e, i }))
  .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '') || b.i - a.i)
  .map(({ e }) => e);
