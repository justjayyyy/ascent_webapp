import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthReview, comparisonMonths } from './monthReview.js';

const tx = (date, type, amount, extra = {}) => ({ date, type, _amount: amount, ...extra });
const pad = (n) => String(n).padStart(2, '0');

// A steady year: 8000 in and about 5000 out each month, groceries growing over time
function year() {
  const rows = [];
  for (let m = 0; m < 12; m += 1) {
    const d = new Date(2025, 9 + m, 1); // Oct 2025 .. Sep 2026
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    rows.push(tx(`${k}-01`, 'Income', 8000, { category: 'salary' }));
    rows.push(tx(`${k}-03`, 'Expense', 3000, { category: 'housing', isRecurring: true, description: 'Rent' }));
    rows.push(tx(`${k}-10`, 'Expense', 1000 + m * 50, { category: 'groceries', merchant: 'Shufersal' }));
    rows.push(tx(`${k}-20`, 'Expense', 1000, { category: 'fun', description: 'Cinema' }));
  }
  return rows;
}

test('the months a month is compared with', () => {
  const sep = new Date(2026, 8, 15);
  assert.deepEqual(comparisonMonths(sep, 'prev').map((d) => d.getMonth()), [7]);
  assert.deepEqual(comparisonMonths(sep, 'lastYear').map((d) => [d.getFullYear(), d.getMonth()]), [[2025, 8]]);
  assert.equal(comparisonMonths(sep, 'avg6').length, 6);
});

test('totals, fixed and flexible, and the comparison with last month', () => {
  const r = buildMonthReview({ rows: year(), month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.key, '2026-09');
  assert.equal(r.running, false);
  assert.equal(r.totals.spent, 5550);
  assert.equal(r.totals.earned, 8000);
  assert.equal(r.totals.net, 2450);
  assert.equal(r.totals.fixed, 3000);
  assert.equal(r.totals.flexible, 2550);
  assert.equal(r.base.spent, 5500);
  const groceries = r.categories.find((c) => c.category === 'groceries');
  assert.equal(groceries.delta, 50);
  assert.equal(groceries.spark.length, 12);
  assert.equal(groceries.spark.at(-1), 1550);
});

test('an average comparison leaves out months before anything was recorded', () => {
  const rows = year().filter((x) => x.date >= '2026-07');
  const r = buildMonthReview({ rows, month: new Date(2026, 8, 1), compare: 'avg12', today: new Date(2026, 9, 2) });
  assert.deepEqual(r.compareKeys, ['2026-08', '2026-07']);
  assert.equal(r.base.spent, (5500 + 5450) / 2);
});

test('a running month is compared with the same days of the months before', () => {
  const rows = [...year(), tx('2026-10-01', 'Income', 8000), tx('2026-10-02', 'Expense', 200, { category: 'fun' })];
  const r = buildMonthReview({ rows, month: new Date(2026, 9, 1), today: new Date(2026, 9, 5) });
  assert.equal(r.running, true);
  assert.equal(r.elapsed, 5);
  assert.equal(r.totals.spent, 200);
  assert.equal(r.base.spent, 3000); // September up to the 5th: rent only
  assert.equal(r.cumulative.now.length, 5);
  assert.equal(r.cumulative.base.length, 31);
});

test('day by day counts chosen spending; the rent day is not the busiest', () => {
  const r = buildMonthReview({ rows: year(), month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.perDay[2].amount, 0);
  assert.equal(r.perDay[2].fixed, 3000);
  assert.equal(r.busiest.day, 10);
  assert.equal(r.cumulative.now.at(-1), r.totals.spent);
});

test('records: the cheapest month of the year, and a category at its highest', () => {
  const rows = year().map((x) => (x.date.startsWith('2026-09') && x.category === 'fun' ? { ...x, _amount: 100 } : x));
  const r = buildMonthReview({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.ok(r.records.some((x) => x.kind === 'lowestSpend'));
  assert.ok(r.records.some((x) => x.kind === 'categoryHigh' && x.category === 'groceries'));
  assert.ok(r.records.some((x) => x.kind === 'categoryLow' && x.category === 'fun'));
});

test('payees: new ones are those the year before never paid', () => {
  const rows = [...year(), tx('2026-09-15', 'Expense', 400, { category: 'home', merchant: 'IKEA Netanya' })];
  const r = buildMonthReview({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.deepEqual(r.newMerchants.map((m) => m.name), ['IKEA Netanya']);
  assert.equal(r.merchants.find((m) => m.name === 'Shufersal').isNew, false);
});

test('budgets of the month: kept and over', () => {
  const budgets = [
    { category: 'groceries', monthlyLimit: 1500, currency: 'ILS', year: 2026, month: 9 },
    { category: 'fun', monthlyLimit: 1200, currency: 'ILS', year: 2026, month: 9 },
  ];
  const r = buildMonthReview({ rows: year(), month: new Date(2026, 8, 1), today: new Date(2026, 9, 2), budgets });
  assert.equal(r.budgets.kept, 1);
  assert.deepEqual(r.budgets.over.map((b) => b.category), ['groceries']);
});

test('a budget with nothing spent in it is kept, and counted', () => {
  const budgets = [
    { category: 'groceries', monthlyLimit: 1500, currency: 'ILS', year: 2026, month: 9 },
    { category: 'gifts', monthlyLimit: 300, currency: 'ILS', year: 2026, month: 9 },
  ];
  const r = buildMonthReview({ rows: year(), month: new Date(2026, 8, 1), today: new Date(2026, 9, 2), budgets });
  assert.equal(r.budgets.list.length, 2);
  assert.equal(r.budgets.kept, 1);
  assert.deepEqual(r.budgets.list.find((b) => b.category === 'gifts'), { category: 'gifts', limit: 300, used: 0, ratio: 0 });
});

test('the year so far against last year needs last year fully on record', () => {
  const r = buildMonthReview({ rows: year(), month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.ytd.months, 9);
  assert.equal(r.ytd.before, null);
  assert.equal(r.ytd.now.earned, 72000);
});

test('who paid, in a shared household', () => {
  const rows = [tx('2026-09-02', 'Expense', 300, { created_by: 'a@x' }), tx('2026-09-03', 'Expense', 100, { created_by: 'a@x', paidBy: 'b@x' })];
  const r = buildMonthReview({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2), members: [{ email: 'a@x', name: 'Ann' }, { email: 'b@x', name: 'Ben' }] });
  assert.deepEqual(r.people.map((p) => [p.name, p.amount]), [['Ann', 300], ['Ben', 100]]);
});
