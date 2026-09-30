// Who owes whom in a household. Only expenses marked as split count; everything else is shared money
// that nobody has to pay back. People are identified by email, like `created_by` on every row.

const round2 = (n) => Math.round(n * 100) / 100;
const MIN_DEBT = 0.5; // smaller leftovers are rounding, not a debt

/** Share of each person, as fractions that add up to 1. Unknown or empty splits give null. */
export function splitShares(split, members = []) {
  if (!split || !split.mode || split.mode === 'none') return null;
  if (split.mode === 'equal') {
    const people = split.shares?.length ? split.shares.map((s) => s.email) : members;
    const unique = [...new Set(people.filter(Boolean))];
    return unique.length > 1 ? unique.map((email) => ({ email, fraction: 1 / unique.length })) : null;
  }
  const shares = (split.shares || []).filter((s) => s?.email && Number(s.percent) > 0);
  const total = shares.reduce((s, x) => s + Number(x.percent), 0);
  return shares.length > 1 && total > 0 ? shares.map((s) => ({ email: s.email, fraction: Number(s.percent) / total })) : null;
}

/**
 * @param {object} input
 * @param {Array}  input.transactions  { type, amount, paidBy, created_by, split } (amount in one currency)
 * @param {Array}  [input.settlements] { from, to, amount }: `from` paid `to` back
 * @param {Array}  [input.members]     emails, used by equal splits that did not name people
 * @returns {{ net: Record<string, number>, debts: Array<{ from, to, amount }> }}
 *          net > 0: others owe this person. debts: the fewest payments that settle everything.
 */
export function householdBalances({ transactions, settlements = [], members = [] }) {
  const net = {};
  const add = (email, v) => { net[email] = (net[email] || 0) + v; };

  for (const tx of transactions) {
    if (tx.type !== 'Expense' || !(tx.amount > 0)) continue;
    const shares = splitShares(tx.split, members);
    const payer = tx.paidBy || tx.created_by;
    if (!shares || !payer) continue;
    add(payer, tx.amount);
    shares.forEach((s) => add(s.email, -tx.amount * s.fraction));
  }
  for (const s of settlements) {
    if (!s?.from || !s?.to || s.from === s.to || !(s.amount > 0)) continue;
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }

  // Greedy: the biggest debtor pays the biggest creditor until everyone is even
  const debtors = [];
  const creditors = [];
  for (const [email, v] of Object.entries(net)) {
    const r = round2(v);
    net[email] = r;
    if (r <= -MIN_DEBT) debtors.push({ email, left: -r });
    else if (r >= MIN_DEBT) creditors.push({ email, left: r });
  }
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const debts = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount >= MIN_DEBT) debts.push({ from: debtors[i].email, to: creditors[j].email, amount: round2(amount) });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left < MIN_DEBT) i += 1;
    if (creditors[j].left < MIN_DEBT) j += 1;
  }
  return { net, debts };
}
