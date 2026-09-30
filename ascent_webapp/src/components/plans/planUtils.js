import { addDays, differenceInCalendarDays, differenceInCalendarMonths, format, parseISO, startOfMonth, addMonths } from 'date-fns';

export const PLAN_KINDS = [
  { key: 'vacation', emoji: '✈️' },
  { key: 'wedding', emoji: '💍' },
  { key: 'move', emoji: '📦' },
  { key: 'renovation', emoji: '🛠️' },
  { key: 'baby', emoji: '🍼' },
  { key: 'car', emoji: '🚗' },
  { key: 'purchase', emoji: '🛍️' },
  { key: 'event', emoji: '🎉' },
  { key: 'other', emoji: '📌' },
];

export const kindEmoji = (kind) => PLAN_KINDS.find((k) => k.key === kind)?.emoji || '📌';

// Suggested costs for a new plan. `days` is when the money usually goes out, relative to the event
// day (negative = before). Names are translation keys; categories are the default expense categories.
const TEMPLATES = {
  vacation: [
    { key: 'flights', category: 'travel', days: -120 },
    { key: 'accommodation', category: 'travel', days: -90 },
    { key: 'travelInsurance', category: 'insurance', days: -14 },
    { key: 'carRental', category: 'transportation', days: -30 },
    { key: 'foodOnTrip', category: 'food_dining', days: 0 },
    { key: 'activities', category: 'entertainment', days: 0 },
    { key: 'spendingMoney', category: 'shopping', days: 0 },
  ],
  wedding: [
    { key: 'venue', category: 'entertainment', days: -300 },
    { key: 'photographer', category: 'entertainment', days: -180 },
    { key: 'music', category: 'entertainment', days: -120 },
    { key: 'attire', category: 'shopping', days: -90 },
    { key: 'rings', category: 'shopping', days: -60 },
    { key: 'invitations', category: 'other_expense', days: -60 },
    { key: 'catering', category: 'food_dining', days: -7 },
    { key: 'honeymoon', category: 'travel', days: 14 },
  ],
  move: [
    { key: 'deposit', category: 'rent_housing', days: -30 },
    { key: 'agentFee', category: 'rent_housing', days: -30 },
    { key: 'movers', category: 'transportation', days: -3 },
    { key: 'firstRent', category: 'rent_housing', days: 0 },
    { key: 'furniture', category: 'shopping', days: 14 },
  ],
  renovation: [
    { key: 'design', category: 'rent_housing', days: -60 },
    { key: 'materials', category: 'rent_housing', days: -30 },
    { key: 'contractor', category: 'rent_housing', days: -14 },
    { key: 'furniture', category: 'shopping', days: 14 },
  ],
  baby: [
    { key: 'stroller', category: 'shopping', days: -60 },
    { key: 'crib', category: 'shopping', days: -60 },
    { key: 'carSeat', category: 'shopping', days: -30 },
    { key: 'babyClothes', category: 'shopping', days: -30 },
    { key: 'medicalCosts', category: 'healthcare', days: -90 },
  ],
  car: [
    { key: 'downPayment', category: 'transportation', days: 0 },
    { key: 'carInsurance', category: 'insurance', days: 0 },
    { key: 'registration', category: 'taxes', days: 0 },
    { key: 'accessories', category: 'transportation', days: 14 },
  ],
  purchase: [
    { key: 'itemPrice', category: 'shopping', days: 0 },
    { key: 'delivery', category: 'shopping', days: 0 },
  ],
  event: [
    { key: 'venue', category: 'entertainment', days: -60 },
    { key: 'catering', category: 'food_dining', days: -7 },
    { key: 'decorations', category: 'shopping', days: -14 },
  ],
};

export const newPlanItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Suggested items for a kind, dated around the event day (never before today). */
export function templateItems(kind, eventDate, t) {
  const today = new Date();
  const event = eventDate ? parseISO(eventDate) : null;
  return (TEMPLATES[kind] || []).map((row) => {
    let due = event ? addDays(event, row.days) : null;
    if (due && due < today) due = today;
    return {
      id: newPlanItemId(),
      name: t(`planTpl_${row.key}`),
      category: row.category,
      amount: 0,
      dueDate: due ? format(due, 'yyyy-MM-dd') : null,
      status: 'planned',
      transactionId: null,
      note: '',
    };
  });
}

const dayKey = (d) => (d || '').slice(0, 10);

/**
 * Money in a plan, in the plan's currency. `linked` are the expenses recorded for the plan and
 * `toPlan(tx)` converts one of them. A paid item counts its recorded expense when there is one
 * (the real price), otherwise its planned amount (paid before it was tracked here).
 */
export function planTotals(plan, linked = [], toPlan = (tx) => tx.amount || 0) {
  const byId = new Map(linked.map((tx) => [tx.id, tx]));
  const items = plan.items || [];
  let planned = 0;
  let paid = 0;
  let booked = 0;
  items.forEach((item) => {
    const amount = item.amount || 0;
    if (item.status === 'paid') {
      const tx = item.transactionId && byId.get(item.transactionId);
      const real = tx ? toPlan(tx) : amount;
      paid += real;
      planned += Math.max(amount, real);
    } else {
      planned += amount;
      if (item.status === 'booked') booked += amount;
    }
  });
  const itemTx = new Set(items.map((i) => i.transactionId).filter(Boolean));
  const extra = linked.filter((tx) => !itemTx.has(tx.id));
  const extraSpent = extra.reduce((s, tx) => s + toPlan(tx), 0);
  paid += extraSpent;
  planned += extraSpent;

  const budget = plan.budget || 0;
  const target = Math.max(budget, planned);
  const remaining = Math.max(0, target - paid);
  const today = new Date();
  const event = plan.startDate ? parseISO(plan.startDate) : null;
  const daysLeft = event ? differenceInCalendarDays(event, today) : null;
  // Months you can still put money aside in, counting this one
  const monthsLeft = event ? Math.max(1, differenceInCalendarMonths(event, today)) : null;
  const pace = daysLeft !== null && daysLeft >= 0 && remaining > 0 ? remaining / monthsLeft : null;
  const upcoming = items
    .filter((i) => i.status !== 'paid' && i.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    budget, planned, paid, booked, target, remaining, extra, extraSpent,
    unallocated: budget > 0 ? budget - planned : 0,
    daysLeft, monthsLeft, pace,
    next: upcoming[0] || null,
    overdue: upcoming.filter((i) => i.dueDate < format(today, 'yyyy-MM-dd')).length,
  };
}

/**
 * Month-by-month cash flow of a plan: what was paid and what is still due each month, from the
 * first payment to the event month. Unpaid items without a date land in the event month.
 */
export function planTimeline(plan, linked = [], toPlan = (tx) => tx.amount || 0) {
  const byId = new Map(linked.map((tx) => [tx.id, tx]));
  const buckets = new Map();
  const add = (date, field, value) => {
    if (!date || !(value > 0)) return;
    const key = date.slice(0, 7);
    const b = buckets.get(key) || { key, paid: 0, due: 0 };
    b[field] += value;
    buckets.set(key, b);
  };
  const eventDay = plan.startDate || null;
  (plan.items || []).forEach((item) => {
    if (item.status === 'paid') {
      const tx = item.transactionId && byId.get(item.transactionId);
      add(tx ? dayKey(tx.date) : (item.dueDate || eventDay), 'paid', tx ? toPlan(tx) : item.amount);
    } else {
      add(item.dueDate || eventDay, 'due', item.amount);
    }
  });
  const itemTx = new Set((plan.items || []).map((i) => i.transactionId).filter(Boolean));
  linked.filter((tx) => !itemTx.has(tx.id)).forEach((tx) => add(dayKey(tx.date), 'paid', toPlan(tx)));

  const keys = [...buckets.keys()];
  if (eventDay) keys.push(eventDay.slice(0, 7));
  if (!keys.length) return [];
  keys.sort();
  // Fill the gaps so the months read as a continuous run
  const out = [];
  let cursor = startOfMonth(parseISO(`${keys[0]}-01`));
  const last = startOfMonth(parseISO(`${keys[keys.length - 1]}-01`));
  for (let i = 0; cursor <= last && i < 60; i += 1) {
    const key = format(cursor, 'yyyy-MM');
    out.push({ key, paid: 0, due: 0, ...(buckets.get(key) || {}), isEvent: eventDay?.slice(0, 7) === key });
    cursor = addMonths(cursor, 1);
  }
  return out;
}
