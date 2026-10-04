import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthForecast, baselineDaily, addDays, expectedIncome } from './forecast.js';
import { detectSubscriptions } from './subscriptions.js';

const exp = (date, amount, extra = {}) => ({ type: 'Expense', date, amount, category: 'food', ...extra });
const inc = (date, amount) => ({ type: 'Income', date, amount, category: 'salary' });

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('future-dated rows this month are committed, not spent', () => {
  const f = monthForecast({
    month: '2026-09',
    today: '2026-09-10',
    transactions: [
      inc('2026-09-01', 10000),
      exp('2026-09-05', 1000),
      exp('2026-09-25', 4000, { isRecurring: true, category: 'rent', description: 'Rent' }),
      exp('2026-08-05', 999), // other month
    ],
  });
  assert.equal(f.phase, 'current');
  assert.equal(f.spent, 1000);
  assert.equal(f.committed, 4000);
  assert.equal(f.safeToSpend, 5000);
  assert.equal(f.daysLeft, 21); // the 10th through the 30th
  assert.equal(f.perDay, Math.round((5000 / 21) * 100) / 100);
  assert.equal(f.upcoming[0].kind, 'recurring');
  assert.equal(f.upcoming[0].label, 'Rent');
});

test('the pace extrapolates only day-to-day spending', () => {
  const f = monthForecast({
    month: '2026-09',
    today: '2026-09-10',
    transactions: [
      inc('2026-09-01', 10000),
      exp('2026-09-02', 500),
      exp('2026-09-08', 500),
      exp('2026-09-03', 3000, { installmentGroupId: 'g1' }), // known in advance, never extrapolated
    ],
  });
  assert.equal(f.pace, 100); // 1000 of variable spending over 10 days
  assert.equal(f.projectedExpenses, 4000 + 100 * 20);
  assert.equal(f.projectedNet, 10000 - 6000);
  assert.ok(f.projectedLow <= f.projectedExpenses && f.projectedHigh >= f.projectedExpenses);
});

test('early in the month the pace leans on earlier months', () => {
  const f = monthForecast({ month: '2026-09', today: '2026-09-01', transactions: [exp('2026-09-01', 10)], baseline: 200 });
  // weight 0.1 on this month's own 10/day, 0.9 on the 200/day baseline
  assert.equal(f.pace, 0.1 * 10 + 0.9 * 200);
});

test('without income, budgets are the base', () => {
  const f = monthForecast({
    month: '2026-09', today: '2026-09-15',
    transactions: [exp('2026-09-02', 300)],
    budgets: [{ category: 'food', limit: 1000 }, { category: 'fun', limit: 500 }],
  });
  assert.equal(f.base, 'budgets');
  assert.equal(f.safeToSpend, 1200);
  const none = monthForecast({ month: '2026-09', today: '2026-09-15', transactions: [exp('2026-09-02', 300)] });
  assert.equal(none.base, null);
});

test('plan costs due later this month are committed', () => {
  const f = monthForecast({
    month: '2026-09', today: '2026-09-10',
    transactions: [inc('2026-09-01', 5000)],
    planDues: [
      { name: 'Flights', planName: 'Rome', date: '2026-09-20', amount: 1800 },
      { name: 'Overdue deposit', date: '2026-09-02', amount: 99 }, // before today: already late, not counted as ahead
      { name: 'Hotel', date: '2026-10-02', amount: 700 },
    ],
  });
  assert.equal(f.committed, 1800);
  assert.equal(f.upcoming[0].planName, 'Rome');
});

test('budget pace says when a category will pass its limit', () => {
  const f = monthForecast({
    month: '2026-09', today: '2026-09-10',
    transactions: [exp('2026-09-01', 400), exp('2026-09-09', 400)], // 80/day
    budgets: [{ category: 'food', limit: 1200 }, { category: 'fun', limit: 100 }],
  });
  const food = f.budgetPace.find((b) => b.category === 'food');
  assert.equal(food.status, 'will_exceed');
  assert.equal(food.overOn, '2026-09-16'); // 800 + 80/day crosses 1200 on the 6th day after the 10th
  assert.equal(f.budgetPace[0].category, 'food'); // at risk first
  const over = monthForecast({ month: '2026-09', today: '2026-09-10', transactions: [exp('2026-09-01', 1300)], budgets: [{ category: 'food', limit: 1200 }] });
  assert.equal(over.budgetPace[0].status, 'over');
});

test('past months are actuals and future months are all ahead', () => {
  const rows = [inc('2026-08-01', 3000), exp('2026-08-10', 1000), exp('2026-10-01', 500, { isRecurring: true })];
  const past = monthForecast({ month: '2026-08', today: '2026-09-10', transactions: rows });
  assert.equal(past.phase, 'past');
  assert.equal(past.committed, 0);
  assert.equal(past.projectedNet, 2000);
  assert.equal(past.daysLeft, 0);
  const next = monthForecast({ month: '2026-10', today: '2026-09-10', transactions: rows, baseline: 10 });
  assert.equal(next.phase, 'future');
  assert.equal(next.spent, 0);
  assert.equal(next.committed, 500);
  assert.equal(next.projectedExpenses, 500 + 10 * 31);
});

test('the daily path is actual up to today, then expected', () => {
  const f = monthForecast({ month: '2026-09', today: '2026-09-03', transactions: [exp('2026-09-01', 30), exp('2026-09-03', 30)] });
  assert.equal(f.path.length, 30);
  assert.equal(f.path[2].actual, 60);
  assert.equal(f.path[2].expected, 60); // the expected line starts where the actual one ends
  assert.equal(f.path[3].actual, null);
  assert.equal(f.path[3].expected, 80); // 20/day pace
});

test('baselineDaily averages the variable spending of earlier months', () => {
  const rows = [exp('2026-07-03', 310), exp('2026-08-03', 620), exp('2026-08-04', 999, { isRecurring: true })];
  assert.equal(baselineDaily(rows, ['2026-07', '2026-08', '2026-06']), (10 + 20) / 2);
  assert.equal(baselineDaily([], ['2026-08']), null);
});

// ---------- subscriptions ----------

const monthly = (key, amounts, start = '2026-01-05', extra = {}) =>
  amounts.map((amount, i) => exp(`2026-${String(Number(start.slice(5, 7)) + i).padStart(2, '0')}-${start.slice(8)}`, amount, { merchantKey: key, description: key, ...extra }));

test('finds a monthly subscription and its price rise', () => {
  const rows = [...monthly('netflix', [49.9, 49.9, 49.9, 54.9])];
  const [sub] = detectSubscriptions(rows, '2026-04-20');
  assert.equal(sub.cadence, 'monthly');
  assert.equal(sub.amount, 54.9);
  assert.equal(sub.nextDate.slice(0, 7), '2026-05');
  assert.deepEqual(sub.priceChange, { from: 49.9, to: 54.9, pct: 10 });
});

test('ignores irregular amounts, too few charges, stopped ones and future rows', () => {
  const groceries = monthly('shufersal', [312, 488, 205, 640]);
  const twice = monthly('gym', [199, 199]);
  const stopped = monthly('spotify', [19.9, 19.9, 19.9], '2025-01-05');
  const future = monthly('rent', [4000, 4000, 4000], '2026-05-01', { isRecurring: true });
  assert.deepEqual(detectSubscriptions([...groceries, ...twice, ...stopped, ...future], '2026-04-20'), []);
});

test('user-marked recurring rows need only two charges', () => {
  const rows = monthly('rent', [4000, 4000], '2026-02-01', { isRecurring: true });
  const [sub] = detectSubscriptions(rows, '2026-03-15');
  assert.equal(sub.key, 'rent');
  assert.equal(sub.priceChange, null);
});

test('weekly and yearly rhythms, costed per month', () => {
  const weekly = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'].map((d) => exp(d, 30, { merchantKey: 'cleaner' }));
  const yearly = [exp('2024-06-01', 1200, { merchantKey: 'insurance' }), exp('2025-06-02', 1200, { merchantKey: 'insurance' })];
  const subs = detectSubscriptions([...weekly, ...yearly], '2026-04-01');
  assert.deepEqual(subs.map((s) => [s.cadence, s.monthlyCost]), [['weekly', 130], ['yearly', 100]]);
  // a year and a bit after the last charge, the yearly one has stopped
  assert.deepEqual(detectSubscriptions(yearly, '2026-08-01'), []);
});

test('a bill saved as recurring shows from its first charge, with the next one it already has', () => {
  const series = { isRecurring: true, recurringFrequency: 'monthly', recurringGroupId: 'g1', recurringStartDate: '2026-04-10', recurringEndDate: '2027-03-10' };
  const rows = monthly('electric', [300, 300, 300, 300], '2026-04-10', series);
  const [sub] = detectSubscriptions(rows, '2026-04-20');
  assert.equal(sub.key, 'series:g1');
  assert.equal(sub.cadence, 'monthly');
  assert.equal(sub.amount, 300);
  assert.equal(sub.nextDate, '2026-05-10');
  assert.equal(sub.count, 1);
  // one starting soon is already listed; one starting months away is not yet
  assert.equal(detectSubscriptions(rows, '2026-04-01').length, 1);
  assert.deepEqual(detectSubscriptions(rows, '2026-01-15'), []);
  // after its last charge it has ended
  assert.deepEqual(detectSubscriptions(rows, '2026-09-01'), []);
});

test('a recurring bill is not listed twice when its history also looks like a subscription', () => {
  const series = { isRecurring: true, recurringFrequency: 'monthly', recurringGroupId: 'g2', recurringStartDate: '2026-01-05', recurringEndDate: '2026-12-05' };
  const rows = monthly('netflix', [49.9, 49.9, 49.9, 49.9, 49.9], '2026-01-05', series);
  assert.equal(detectSubscriptions(rows, '2026-04-20').length, 1);
});

test('expected income: the middle of the 3 months before, months with nothing recorded left out', () => {
  const rows = [
    inc('2026-07-31', 12000), exp('2026-07-10', 50),
    inc('2026-08-31', 12500), inc('2026-08-15', 3000), // a bonus month
    inc('2026-09-30', 12000),
  ];
  assert.equal(expectedIncome(rows, '2026-10'), 12000);
  // Only two months on record: their average
  assert.equal(expectedIncome(rows.filter((r) => !r.date.startsWith('2026-07')), '2026-10'), 13750);
  assert.equal(expectedIncome([exp('2026-09-02', 40)], '2026-10'), null);
  assert.equal(expectedIncome([], '2026-10'), null);
});

test('salary paid on the 1st for the month before: this month stands on what is expected until its own is in', () => {
  const salary = (d) => inc(d, 10000);
  const rows = [salary('2026-07-31'), salary('2026-08-31'), salary('2026-09-30'), exp('2026-10-03', 1500)];
  const f = monthForecast({ month: '2026-10', today: '2026-10-04', transactions: rows });
  assert.equal(f.income, 0);
  assert.equal(f.expectedIncome, 10000);
  assert.equal(f.incomeIsExpected, true);
  assert.equal(f.base, 'income');
  assert.equal(f.safeToSpend, 8500);
  // October's own salary, booked on its last day, takes over
  const done = monthForecast({ month: '2026-10', today: '2026-10-31', transactions: [...rows, salary('2026-10-31')] });
  assert.equal(done.incomeIsExpected, false);
  assert.equal(done.incomeUsed, 10000);
  // A month that is over counts only what came in
  const past = monthForecast({ month: '2026-10', today: '2026-11-04', transactions: rows });
  assert.equal(past.incomeIsExpected, false);
  assert.equal(past.projectedNet, -1500);
});
