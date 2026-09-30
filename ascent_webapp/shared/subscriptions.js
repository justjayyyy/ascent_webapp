// Finds payments that repeat on a rhythm (streaming, gym, phone plan, insurance) in the expense
// history, and notices when one of them costs more than it used to. Pure; amounts come in one currency.

const DAY_MS = 86_400_000;

const CADENCES = [
  { id: 'weekly', days: 7, tolerance: 2, perMonth: 52 / 12, minCount: 4 },
  { id: 'monthly', days: 30.4, tolerance: 5, perMonth: 1, minCount: 3 },
  { id: 'yearly', days: 365, tolerance: 12, perMonth: 1 / 12, minCount: 2 },
];

const round2 = (n) => Math.round(n * 100) / 100;
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + Math.round(days) * DAY_MS).toISOString().slice(0, 10);

/** Same payee, whatever the branch number or letter case: prefers the merchant key the server stored. */
export function payeeKey(tx) {
  if (tx.merchantKey) return tx.merchantKey;
  return String(tx.merchant || tx.description || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])\d{2,}(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Array}  transactions { type, date, amount, description, merchant, merchantKey, category, isRecurring }
 * @param {string} today        'YYYY-MM-DD'
 * @returns {Array} { key, name, category, cadence, amount, monthlyCost, count, lastDate, nextDate, priceChange }
 *                  biggest monthly cost first; priceChange is { from, to, pct } when the latest charge went up
 */
export function detectSubscriptions(transactions, today) {
  const groups = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'Expense' || !tx.date || tx.date > today || tx.installmentGroupId || !(tx.amount > 0)) continue;
    const key = payeeKey(tx);
    if (key.length < 2) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const found = [];
  for (const [key, list] of groups) {
    // One charge per day at most: a double tap or a split bill is not a second period
    const byDay = new Map();
    [...list].sort((a, b) => a.date.localeCompare(b.date)).forEach((tx) => byDay.set(tx.date, tx));
    const rows = [...byDay.values()];
    if (rows.length < 2) continue;

    const gaps = rows.slice(1).map((tx, i) => daysBetween(rows[i].date, tx.date));
    const typical = median(gaps);
    const cadence = CADENCES.find((c) => Math.abs(typical - c.days) <= c.tolerance);
    if (!cadence) continue;
    const declared = rows.some((tx) => tx.isRecurring);
    if (rows.length < (declared ? 2 : cadence.minCount)) continue;
    const onBeat = gaps.filter((g) => Math.abs(g - cadence.days) <= cadence.tolerance * 1.5).length;
    if (onBeat / gaps.length < 0.7) continue;

    // Steady price: groceries at the same shop every week are not a subscription
    const amounts = rows.map((tx) => tx.amount);
    const earlier = amounts.slice(0, -1);
    const typicalAmount = median(earlier.length ? earlier : amounts);
    const steady = earlier.filter((a) => Math.abs(a - typicalAmount) <= typicalAmount * 0.05).length;
    if (!declared && steady / earlier.length < 0.75) continue;

    const latest = rows[rows.length - 1];
    // Still running: the next charge is not long overdue
    if (daysBetween(latest.date, today) > cadence.days + cadence.tolerance * 3) continue;

    const previous = rows[rows.length - 2].amount;
    const pct = previous > 0 ? (latest.amount - previous) / previous : 0;
    const rising = pct >= 0.03 && latest.amount - previous >= 0.5;

    found.push({
      key,
      name: latest.merchant || latest.description || key,
      category: latest.category,
      cadence: cadence.id,
      amount: round2(latest.amount),
      monthlyCost: round2(latest.amount * cadence.perMonth),
      count: rows.length,
      lastDate: latest.date,
      nextDate: addDays(latest.date, cadence.id === 'monthly' ? typical : cadence.days),
      priceChange: rising ? { from: round2(previous), to: round2(latest.amount), pct: Math.round(pct * 1000) / 10 } : null,
    });
  }
  return found.sort((a, b) => b.monthlyCost - a.monthlyCost);
}
