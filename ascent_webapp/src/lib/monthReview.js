// The Monthly Review: one month of a household's money in detail, set against the months before it
// (last month, the same month last year, or the average of the last 3, 6 or 12). Where the Recap tells
// a story, this is the full account. Pure data in, plain object out, so it runs under `node --test`.
//
// rows: transactions with `type` ('Income' | 'Expense'), `date` ('YYYY-MM-DD…') and `_amount` in the
// viewer's currency, plus optionally category, description, merchant, cardId, paymentMethod, paidBy,
// created_by, isRecurring, installmentGroupId, commitmentId.
import { payeeKey } from '../../shared/subscriptions.js';
import { isFixed, monthNoSpend } from './noSpend.js';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const shift = (d, months) => new Date(d.getFullYear(), d.getMonth() + months, 1);
const daysIn = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const dayOf = (x) => parseInt(x.date.slice(8, 10), 10);
const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);

export const COMPARISONS = ['prev', 'lastYear', 'avg3', 'avg6', 'avg12'];
const TREND_MONTHS = 12;

/** The months a month is compared with, newest first. */
export function comparisonMonths(month, compare) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  if (compare === 'lastYear') return [shift(start, -12)];
  const n = { avg3: 3, avg6: 6, avg12: 12 }[compare] || 1;
  return Array.from({ length: n }, (_, i) => shift(start, -(i + 1)));
}

/** A row's payee, as a key and the name to show. */
function payeeOf(x) {
  const name = String(x.merchant || x.description || '').trim();
  const key = payeeKey(x) || name.toLowerCase();
  return key ? { key, name } : null;
}

/** Everything worth adding up about some rows. */
function measure(list) {
  const out = {
    spent: 0, earned: 0, count: 0, fixed: 0, flexible: 0,
    categories: new Map(), income: new Map(), payees: new Map(), payeeCounts: new Map(),
  };
  for (const x of list) {
    const amount = x._amount || 0;
    if (x.type === 'Income') {
      out.earned += amount;
      add(out.income, x.category || 'other', amount);
      continue;
    }
    if (x.type !== 'Expense') continue;
    out.spent += amount;
    out.count += 1;
    if (isFixed(x)) out.fixed += amount; else out.flexible += amount;
    add(out.categories, x.category || 'other', amount);
    const p = payeeOf(x);
    if (p) { add(out.payees, p.key, amount); add(out.payeeCounts, p.key, 1); }
  }
  return out;
}

/** The average of several months' measures; maps average over every month, so a quiet month counts as 0. */
function averageOf(measures) {
  const n = measures.length;
  const avgMap = (field) => {
    const sum = new Map();
    measures.forEach((m) => m[field].forEach((v, k) => add(sum, k, v)));
    return new Map([...sum].map(([k, v]) => [k, v / n]));
  };
  const avg = (field) => measures.reduce((s, m) => s + m[field], 0) / n;
  return {
    spent: avg('spent'), earned: avg('earned'), count: avg('count'), fixed: avg('fixed'), flexible: avg('flexible'),
    categories: avgMap('categories'), income: avgMap('income'), payees: avgMap('payees'), payeeCounts: avgMap('payeeCounts'),
  };
}

const change = (now, base) => (base > 0 ? (now - base) / base : null);

function totalsOf(m, days) {
  const net = m.earned - m.spent;
  return {
    spent: m.spent,
    earned: m.earned,
    net,
    savingsRate: m.earned > 0 ? net / m.earned : null,
    count: m.count,
    perDay: days > 0 ? m.spent / days : 0,
    avgPurchase: m.count > 0 ? m.spent / m.count : 0,
    fixed: m.fixed,
    flexible: m.flexible,
  };
}

/**
 * @param {object}  input
 * @param {Array}   input.rows       transactions (any months; the 12 before the month make the trend)
 * @param {Date}    input.month      any date inside the month to review
 * @param {string}  [input.compare]  one of COMPARISONS
 * @param {Date}    [input.today]
 * @param {Array}   [input.budgets]  Budget rows ({ category, monthlyLimit, currency, year, month })
 * @param {Function} [input.convertBudget] (amount, currency) -> amount in the viewer's currency
 * @param {Array}   [input.cards]    [{ id, name }]
 * @param {Array}   [input.members]  [{ email, name }] of a shared household
 */
export function buildMonthReview({
  rows, month, compare = 'prev', today = new Date(), budgets = [], convertBudget = (a) => a, cards = [], members = [],
}) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const key = keyOf(start);
  const total = daysIn(start);
  const running = keyOf(today) === key;
  const elapsed = running ? today.getDate() : total;

  const valid = rows.filter((x) => typeof x.date === 'string' && x.date.length >= 10 && (x._amount || 0) > 0);
  const byMonth = new Map();
  for (const x of valid) {
    const k = x.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(x);
  }
  const firstKey = [...byMonth.keys()].sort()[0] || key;
  // While a month runs, every month is cut at the same day, so like is compared with like
  const upTo = (k, limit) => (byMonth.get(k) || []).filter((x) => dayOf(x) <= limit);

  const cur = upTo(key, elapsed);
  const now = measure(cur);

  // Months before anything was recorded are left out of the comparison, rather than counted as zero
  const compareDates = comparisonMonths(start, compare).filter((d) => keyOf(d) >= firstKey);
  const baseMeasures = compareDates.map((d) => measure(upTo(keyOf(d), running ? elapsed : daysIn(d))));
  const base = baseMeasures.length ? averageOf(baseMeasures) : null;

  // ---- the year around it ----
  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const d = shift(start, i - (TREND_MONTHS - 1));
    const k = keyOf(d);
    const m = measure(k === key ? cur : byMonth.get(k) || []);
    return { key: k, spent: m.spent, earned: m.earned, net: m.earned - m.spent, recorded: k >= firstKey, isCurrent: k === key };
  });
  const finished = trend.filter((t) => t.recorded && !t.isCurrent);
  const trendAverage = finished.length ? finished.reduce((s, t) => s + t.spent, 0) / finished.length : null;

  // ---- categories, each with its year in a sparkline and its budget ----
  const monthBudgets = budgets.filter((b) => b.year === start.getFullYear() && b.month === start.getMonth() + 1 && b.isActive !== false);
  const budgetOf = new Map(monthBudgets.map((b) => [b.category, convertBudget(b.monthlyLimit || 0, b.currency) || 0]));
  const sparkOf = (category) => trend.map((t) => (t.isCurrent ? now.categories.get(category) || 0 : measure(byMonth.get(t.key) || []).categories.get(category) || 0));
  const categoryKeys = new Set([...now.categories.keys(), ...(base ? base.categories.keys() : [])]);
  const categories = [...categoryKeys]
    .map((category) => {
      const amount = now.categories.get(category) || 0;
      const before = base ? base.categories.get(category) || 0 : null;
      const limit = budgetOf.get(category);
      return {
        category,
        now: amount,
        base: before,
        delta: before === null ? null : amount - before,
        change: before === null ? null : change(amount, before),
        share: now.spent > 0 ? amount / now.spent : 0,
        spark: sparkOf(category),
        budget: limit > 0 ? { limit, used: amount, ratio: amount / limit } : null,
      };
    })
    .filter((c) => c.now > 0 || (c.base || 0) > 0)
    .sort((a, b) => b.now - a.now || (b.base || 0) - (a.base || 0));

  // Moves worth naming: a tenth of the category and 2% of the month either way
  const scale = Math.max(now.spent, base?.spent || 0);
  const notable = categories.filter((c) => c.delta !== null && Math.abs(c.delta) >= 0.1 * Math.max(c.now, c.base) && Math.abs(c.delta) >= 0.02 * scale);
  const movers = {
    up: notable.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
    down: notable.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
  };

  // ---- where it was spent ----
  const nameOf = new Map();
  for (const x of [...cur].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const p = x.type === 'Expense' && payeeOf(x);
    if (p) nameOf.set(p.key, p.name);
  }
  // A payee is new when none of the year before the month paid it
  const earlier = new Set();
  trend.filter((t) => !t.isCurrent).forEach((t) => (byMonth.get(t.key) || []).forEach((x) => { const p = x.type === 'Expense' && payeeOf(x); if (p) earlier.add(p.key); }));
  const anyEarlier = earlier.size > 0;
  const merchants = [...now.payees]
    .map(([k, amount]) => ({
      key: k,
      name: nameOf.get(k) || k,
      now: amount,
      count: now.payeeCounts.get(k) || 0,
      base: base ? base.payees.get(k) || 0 : null,
      isNew: anyEarlier && !earlier.has(k),
    }))
    .sort((a, b) => b.now - a.now);
  const newMerchants = merchants.filter((m) => m.isNew);

  // ---- day by day ----
  // `amount` is what was chosen that day; bills that run by themselves are `fixed`, so the rent day does
  // not pass for the busiest one. The pace through the month counts both.
  const perDay = Array.from({ length: total }, (_, i) => ({ day: i + 1, amount: 0, fixed: 0, count: 0 }));
  for (const x of cur) {
    if (x.type !== 'Expense') continue;
    const d = dayOf(x);
    if (d < 1 || d > total) continue;
    if (isFixed(x)) perDay[d - 1].fixed += x._amount;
    else { perDay[d - 1].amount += x._amount; perDay[d - 1].count += 1; }
  }
  let run = 0;
  const cumulativeNow = perDay.slice(0, elapsed).map((d) => { run += d.amount + d.fixed; return run; });
  // The comparison months' pace, day by day: the average of their running totals
  const cumulativeBase = compareDates.length ? Array.from({ length: total }, (_, i) => {
    const sums = compareDates.map((d) => (byMonth.get(keyOf(d)) || [])
      .filter((x) => x.type === 'Expense' && dayOf(x) <= Math.min(i + 1, daysIn(d)))
      .reduce((s, x) => s + x._amount, 0));
    return sums.reduce((s, v) => s + v, 0) / sums.length;
  }) : null;

  const counted = perDay.slice(0, elapsed);
  const weekdays = Array.from({ length: 7 }, (_, wd) => {
    const days = counted.filter((d) => new Date(start.getFullYear(), start.getMonth(), d.day).getDay() === wd);
    const amount = days.reduce((s, d) => s + d.amount, 0);
    return { weekday: wd, amount, average: days.length ? amount / days.length : 0 };
  });
  const busiest = counted.reduce((best, d) => (d.amount > (best?.amount || 0) ? d : best), null);

  // Purchases someone made, not the rent
  const biggest = cur
    .filter((x) => x.type === 'Expense' && !isFixed(x))
    .sort((a, b) => b._amount - a._amount)
    .slice(0, 5)
    .map((x) => ({ id: x.id, amount: x._amount, description: x.description || x.merchant || '', category: x.category || 'other', date: x.date.slice(0, 10) }));

  const income = [...new Set([...now.income.keys(), ...(base ? base.income.keys() : [])])]
    .map((category) => ({ category, now: now.income.get(category) || 0, base: base ? base.income.get(category) || 0 : null }))
    .filter((c) => c.now > 0 || (c.base || 0) > 0)
    .sort((a, b) => b.now - a.now);

  // Who paid, in a shared household
  const payer = (x) => x.paidBy || x.created_by || '';
  const paid = new Map();
  cur.filter((x) => x.type === 'Expense').forEach((x) => add(paid, payer(x), x._amount));
  const people = members.length > 1
    ? [...paid]
      .filter(([email, amount]) => email && amount > 0)
      .map(([email, amount]) => ({ email, name: members.find((m) => m.email === email)?.name || email.split('@')[0], amount, share: now.spent > 0 ? amount / now.spent : 0 }))
      .sort((a, b) => b.amount - a.amount)
    : [];

  // Cards and ways of paying
  const cardName = new Map(cards.map((c) => [c.id || c._id, c.name || c.nickname || '']));
  const methods = new Map();
  cur.filter((x) => x.type === 'Expense').forEach((x) => {
    const k = x.cardId && cardName.has(x.cardId) ? `card:${x.cardId}` : x.paymentMethod ? `method:${x.paymentMethod}` : 'none';
    add(methods, k, x._amount);
  });
  const paymentMethods = [...methods]
    .map(([k, amount]) => ({ key: k, name: k.startsWith('card:') ? cardName.get(k.slice(5)) : k.startsWith('method:') ? k.slice(7) : '', amount, share: now.spent > 0 ? amount / now.spent : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Budgets of this month
  const budgetRows = categories.filter((c) => c.budget).map((c) => ({ category: c.category, ...c.budget }));
  const budgetsOf = {
    list: budgetRows.sort((a, b) => b.ratio - a.ratio),
    kept: budgetRows.filter((b) => b.used <= b.limit).length,
    over: budgetRows.filter((b) => b.used > b.limit),
  };

  // The year so far against the same months of last year
  const ytdKeys = (year) => Array.from({ length: start.getMonth() + 1 }, (_, i) => `${year}-${pad(i + 1)}`);
  const sumMonths = (keys, lastLimit) => keys.reduce((acc, k, i) => {
    const m = measure(i === keys.length - 1 && lastLimit ? upTo(k, lastLimit) : byMonth.get(k) || []);
    return { spent: acc.spent + m.spent, earned: acc.earned + m.earned };
  }, { spent: 0, earned: 0 });
  const ytdNow = sumMonths(ytdKeys(start.getFullYear()), running ? elapsed : null);
  const lastYearKeys = ytdKeys(start.getFullYear() - 1);
  // Only when last year's stretch is fully on record; half a year of history would make it look cheap
  const ytdBefore = lastYearKeys[0] >= firstKey ? sumMonths(lastYearKeys, running ? elapsed : null) : null;
  const ytd = {
    months: start.getMonth() + 1,
    now: { ...ytdNow, net: ytdNow.earned - ytdNow.spent },
    before: ytdBefore ? { ...ytdBefore, net: ytdBefore.earned - ytdBefore.spent } : null,
  };

  // ---- records: where this month stands in its year ----
  const records = [];
  const history = trend.filter((t) => t.recorded && !t.isCurrent && (t.spent > 0 || t.earned > 0));
  if (!running && history.length >= 3 && now.spent > 0) {
    if (history.every((t) => now.spent < t.spent)) records.push({ kind: 'lowestSpend', months: history.length + 1 });
    if (history.every((t) => now.spent > t.spent)) records.push({ kind: 'highestSpend', months: history.length + 1 });
    if (now.earned > 0 && history.every((t) => now.earned > t.earned)) records.push({ kind: 'highestIncome', months: history.length + 1 });
    const rate = now.earned > 0 ? (now.earned - now.spent) / now.earned : null;
    const rates = history.filter((t) => t.earned > 0).map((t) => t.net / t.earned);
    if (rate !== null && rate > 0 && rates.length >= 3 && rates.every((r) => rate > r)) records.push({ kind: 'bestSavingsRate', months: rates.length + 1 });
    for (const c of categories.slice(0, 6)) {
      const past = c.spark.slice(0, -1).filter((_, i) => trend[i].recorded);
      if (past.length < 3 || c.now <= 0) continue;
      if (past.every((v) => c.now > v) && c.now >= 0.05 * now.spent) records.push({ kind: 'categoryHigh', category: c.category, months: past.length + 1 });
      else if (past.filter((v) => v > 0).length >= 3 && past.every((v) => c.now < v)) records.push({ kind: 'categoryLow', category: c.category, months: past.length + 1 });
    }
  }

  return {
    key,
    compare,
    compareKeys: compareDates.map(keyOf),
    running,
    elapsed,
    daysInMonth: total,
    isEmpty: cur.length === 0,
    hasBase: !!base,
    totals: totalsOf(now, elapsed),
    base: base ? totalsOf(base, elapsed) : null,
    trend,
    trendAverage,
    categories,
    movers,
    merchants,
    newMerchants,
    perDay,
    busiest: busiest && busiest.amount > 0 ? busiest : null,
    cumulative: { now: cumulativeNow, base: cumulativeBase },
    weekdays,
    noSpend: monthNoSpend(valid, start, today),
    biggest,
    income,
    people,
    paymentMethods,
    budgets: budgetsOf,
    ytd,
    records: records.slice(0, 5),
  };
}

/** The relative change of a value against its comparison: a fraction, or null when there is nothing to compare. */
export const changeOf = change;
