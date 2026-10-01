// The Monthly Recap: one month of a household's money turned into a few facts worth telling.
// Pure data in, plain object out (no React, no browser), so it runs under `node --test`.
//
// rows: transactions with `type` ('Income' | 'Expense'), `date` ('YYYY-MM-DD…'), `amount` in the
// user's currency as `_amount`, and optionally category, description, merchant, created_by, paidBy.

const pad = (n) => String(n).padStart(2, '0');
export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const daysIn = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

const sum = (list) => list.reduce((s, x) => s + (x._amount || 0), 0);

function byKey(list, keyOf) {
  const out = new Map();
  for (const x of list) {
    const k = keyOf(x);
    out.set(k, (out.get(k) || 0) + (x._amount || 0));
  }
  return out;
}

/**
 * @param {object} input
 * @param {Array}  input.rows      all transactions (any months)
 * @param {Date}   input.month     any date inside the month to recap
 * @param {Date}   [input.today]   "now", to know whether the month is still running
 * @param {Array}  [input.members] [{ email, name }] of a shared household
 */
export function buildRecap({ rows, month, today = new Date(), members = [] }) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const key = monthKeyOf(start);
  const prevKey = monthKeyOf(prevStart);
  const total = daysIn(start);
  const running = monthKeyOf(today) === key;
  const elapsed = running ? today.getDate() : total;

  const inMonth = (k) => (x) => typeof x.date === 'string' && x.date.slice(0, 7) === k && x._amount > 0;
  // While the month runs, rows dated later (recurring charges and installments are written ahead)
  // have not happened yet
  const happened = (x) => !running || parseInt(x.date.slice(8, 10), 10) <= elapsed;
  const cur = rows.filter((x) => inMonth(key)(x) && happened(x));
  const prev = rows.filter(inMonth(prevKey));
  const spend = cur.filter((x) => x.type === 'Expense');
  const earn = cur.filter((x) => x.type === 'Income');
  const prevSpend = prev.filter((x) => x.type === 'Expense');

  const spent = sum(spend);
  const earned = sum(earn);
  const net = earned - spent;
  const prevSpent = sum(prevSpend);

  // Where it went
  const cats = [...byKey(spend, (x) => x.category || 'other')]
    .map(([category, amount]) => ({ category, amount, share: spent > 0 ? amount / spent : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Compared with last month, per category (only categories with real money either side)
  const prevCats = byKey(prevSpend, (x) => x.category || 'other');
  const curCats = new Map(cats.map((c) => [c.category, c.amount]));
  const changes = [...new Set([...curCats.keys(), ...prevCats.keys()])]
    .map((category) => ({ category, now: curCats.get(category) || 0, before: prevCats.get(category) || 0 }))
    .map((c) => ({ ...c, delta: c.now - c.before }))
    .filter((c) => Math.max(c.now, c.before) > 0);
  // Only moves worth mentioning: at least a tenth of the category and 2% of the month's spending
  const notable = (c) => Math.abs(c.delta) >= 0.1 * Math.max(c.now, c.before) && Math.abs(c.delta) >= 0.02 * Math.max(spent, prevSpent);
  const rose = [...changes].filter(notable).sort((a, b) => b.delta - a.delta)[0];
  const fell = [...changes].filter(notable).sort((a, b) => a.delta - b.delta)[0];

  // Day by day
  const perDay = Array.from({ length: total }, (_, i) => ({ day: i + 1, amount: 0, count: 0 }));
  for (const x of spend) {
    const d = parseInt(x.date.slice(8, 10), 10);
    if (d >= 1 && d <= total) { perDay[d - 1].amount += x._amount; perDay[d - 1].count += 1; }
  }
  const counted = perDay.slice(0, elapsed);
  const busiest = counted.reduce((best, d) => (d.amount > (best?.amount || 0) ? d : best), null);
  const quietDays = counted.filter((d) => d.amount === 0).length;
  let longestQuiet = 0;
  let run = 0;
  for (const d of counted) { run = d.amount === 0 ? run + 1 : 0; longestQuiet = Math.max(longestQuiet, run); }

  // Weekday rhythm: average spend on each weekday that has happened (0 = Sunday)
  const weekdays = Array.from({ length: 7 }, (_, wd) => {
    const days = counted.filter((d) => new Date(start.getFullYear(), start.getMonth(), d.day).getDay() === wd);
    const amount = days.reduce((s, d) => s + d.amount, 0);
    return { weekday: wd, amount, average: days.length ? amount / days.length : 0 };
  });
  const topWeekday = weekdays.reduce((best, w) => (w.average > best.average ? w : best), weekdays[0]);

  // The single largest purchase
  const biggest = spend.reduce((best, x) => (x._amount > (best?._amount || 0) ? x : best), null);

  // Who paid, in a shared household
  const payer = (x) => x.paidBy || x.created_by || '';
  const people = members.length > 1
    ? [...byKey(spend, payer)]
      .map(([email, amount]) => ({ email, name: members.find((m) => m.email === email)?.name || email.split('@')[0] || '', amount, share: spent > 0 ? amount / spent : 0 }))
      .filter((p) => p.email && p.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    : [];

  return {
    key,
    prevKey,
    running,
    daysInMonth: total,
    elapsed,
    count: cur.length,
    spent,
    earned,
    net,
    savingsRate: earned > 0 ? net / earned : null,
    prevSpent,
    spentChange: prevSpent > 0 ? (spent - prevSpent) / prevSpent : null,
    perDayAverage: elapsed > 0 ? spent / elapsed : 0,
    categories: cats,
    rose: rose && rose.delta > 0 ? rose : null,
    fell: fell && fell.delta < 0 ? fell : null,
    perDay,
    busiest: busiest && busiest.amount > 0 ? busiest : null,
    quietDays,
    longestQuiet,
    weekdays,
    topWeekday: topWeekday.average > 0 ? topWeekday : null,
    biggest: biggest ? { amount: biggest._amount, description: biggest.description || biggest.merchant || '', category: biggest.category || 'other', date: biggest.date.slice(0, 10) } : null,
    people,
    isEmpty: cur.length === 0,
  };
}

/** The month whose recap to offer: last month in the first week of a new month, else none. */
export function recapToOffer(today = new Date(), window = 7) {
  if (today.getDate() > window) return null;
  return new Date(today.getFullYear(), today.getMonth() - 1, 1);
}
