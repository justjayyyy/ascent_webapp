// Home costs: what running the home costs each month (rent, bills, property tax, insurance,
// subscriptions), counted in the months each payment is for rather than the month it was paid. A water
// bill for July–August paid in October is half July and half August; property tax for September–October
// paid on September 1st is half each. A month whose bill has not come yet is estimated from the bill before.
// Plain data in, plain data out (no React), shared by the Dashboard and its tests.

/** The categories that are the home by default (as stored: default categories by their key). */
export const HOME_CATEGORIES = ['rent_housing', 'utilities', 'taxes', 'insurance', 'subscriptions'];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_SPAN = 24;
const index = (key) => { const [y, m] = key.split('-').map(Number); return y * 12 + (m - 1); };
const keyOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** 'YYYY-MM' `n` months after `key`. */
export const addMonths = (key, n) => keyOf(index(key) + n);
/** Months from `a` to `b` ('YYYY-MM'); negative when b is earlier. */
export const monthsBetween = (a, b) => index(b) - index(a);
export const isMonth = (v) => typeof v === 'string' && MONTH.test(v);

/**
 * The months an expense is for, oldest first: from `coversFrom` to `coversTo` when it has a period (at most
 * two years), otherwise just the month it was paid.
 */
export function coveredMonths(tx) {
  const paid = String(tx?.date || '').slice(0, 7);
  if (!isMonth(tx?.coversFrom)) return isMonth(paid) ? [paid] : [];
  const to = isMonth(tx.coversTo) ? tx.coversTo : tx.coversFrom;
  const [a, b] = tx.coversFrom <= to ? [tx.coversFrom, to] : [to, tx.coversFrom];
  const n = Math.min(monthsBetween(a, b) + 1, MAX_SPAN);
  return Array.from({ length: n }, (_, i) => addMonths(a, i));
}

/** Whether an expense is paid for months other than the one it was paid in. */
export const hasPeriod = (tx) => {
  const months = coveredMonths(tx);
  return months.length > 1 || (months.length === 1 && months[0] !== String(tx?.date || '').slice(0, 7));
};

// One bill and the next of the same kind belong together: the same category, and the same shop (as Apple Pay
// names it) or the first word of what it is called ("Meniv water Jul–Aug", "Meniv water Sep–Oct")
const firstWord = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/u) || [''])[0];
const seriesOf = (tx) => `${tx.category}|${tx.merchantKey || firstWord(tx.description)}`;

/**
 * Home costs for the months in `months` ('YYYY-MM', oldest first):
 *   rows: expenses { category, date, description, merchantKey?, coversFrom?, coversTo?, _amount } (any months:
 *     a bill paid long before or after still lands in the months it is for)
 *   isHome(category): which categories count (by default HOME_CATEGORIES, and any category with a bill
 *     that has a period)
 *   until: the last month that can be estimated (this month); later months only show what is paid ahead
 * Returns { months: [{ key, total, estimated, paid }], byCategory: { [category]: { [month]: { amount, estimated, parts } } },
 *   average } where `paid` is what was paid in that month for the home (by payment date), `estimated` the part
 *   of `total` that is a guess, and `parts` [{ tx, amount, estimated }] says where each amount came from. `average`
 *   is the monthly average over the months up to `until` that have any home cost.
 */
export function homeCosts(rows, { months, until = months.at(-1), isHome = defaultIsHome(rows) } = {}) {
  const expenses = (rows || []).filter((tx) => tx && tx.type !== 'Income' && isHome(tx.category) && typeof tx._amount === 'number' && tx._amount > 0);
  const want = new Set(months);
  const byCategory = {};
  const add = (category, month, amount, tx, estimated) => {
    const cat = (byCategory[category] ||= {});
    const cell = (cat[month] ||= { amount: 0, estimated: false, parts: [] });
    cell.amount += amount;
    cell.estimated = cell.estimated || estimated;
    cell.parts.push({ tx, amount, estimated });
  };

  // What each bill costs in each month it covers
  const series = new Map();
  for (const tx of expenses) {
    const covered = coveredMonths(tx);
    if (!covered.length) continue;
    const share = tx._amount / covered.length;
    covered.forEach((m) => { if (want.has(m)) add(tx.category, m, share, tx, false); });
    const key = seriesOf(tx);
    if (!series.has(key)) series.set(key, []);
    series.get(key).push({ tx, from: covered[0], to: covered.at(-1), span: covered.length, share });
  }

  // A month a series has no bill for yet, up to this month: the bill before it, if it was recent enough (within
  // two of its periods: a bill every two months that is a month late is still expected, one from a year ago is not)
  for (const bills of series.values()) {
    bills.sort((a, b) => a.to.localeCompare(b.to));
    const covers = new Set(bills.flatMap((b) => coveredMonths(b.tx)));
    for (const m of months) {
      if (m > until || covers.has(m)) continue;
      const before = bills.filter((b) => b.to < m).at(-1);
      if (!before || monthsBetween(before.to, m) > 2 * before.span) continue;
      add(before.tx.category, m, before.share, before.tx, true);
    }
  }

  const paidIn = {};
  for (const tx of expenses) {
    const m = String(tx.date).slice(0, 7);
    if (want.has(m)) paidIn[m] = (paidIn[m] || 0) + tx._amount;
  }

  const out = months.map((key) => {
    let total = 0;
    let estimated = 0;
    for (const cat of Object.values(byCategory)) {
      for (const part of cat[key]?.parts || []) {
        total += part.amount;
        if (part.estimated) estimated += part.amount;
      }
    }
    return { key, total, estimated, paid: paidIn[key] || 0 };
  });
  const counted = out.filter((m) => m.key <= until && m.total > 0);
  const average = counted.length ? counted.reduce((s, m) => s + m.total, 0) / counted.length : 0;
  return { months: out, byCategory, average };
}

/** The default categories that are the home, plus any category with a bill paid for other months. */
export function defaultIsHome(rows) {
  const withPeriods = new Set((rows || []).filter((tx) => tx && hasPeriod(tx)).map((tx) => tx.category));
  return (category) => HOME_CATEGORIES.includes(category) || withPeriods.has(category);
}

/** "Jul–Aug 2026", "Sep 2026–Feb 2027", "Oct 2026": a period as people say it. */
export function periodLabel(from, to, locale = 'en-US') {
  if (!isMonth(from)) return '';
  const end = isMonth(to) ? to : from;
  const d = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 15));
  const month = (key, withYear) => new Intl.DateTimeFormat(locale, { month: 'short', ...(withYear && { year: 'numeric' }), timeZone: 'UTC' }).format(d(key));
  if (from === end) return month(from, true);
  if (from.slice(0, 4) === end.slice(0, 4)) return `${month(from, false)}–${month(end, true)}`;
  return `${month(from, true)}–${month(end, true)}`;
}
