import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, recapToOffer } from './recap.js';

const tx = (date, type, amount, extra = {}) => ({ date, type, _amount: amount, ...extra });

const september = [
  tx('2026-09-01', 'Income', 10000),
  tx('2026-09-02', 'Expense', 300, { category: 'food', description: 'Groceries', created_by: 'a@x.com' }),
  tx('2026-09-04', 'Expense', 1200, { category: 'home', description: 'Sofa', created_by: 'b@x.com' }),
  tx('2026-09-04', 'Expense', 100, { category: 'food', created_by: 'a@x.com' }),
  tx('2026-09-18', 'Expense', 400, { category: 'fun', created_by: 'a@x.com', paidBy: 'b@x.com' }),
];
const august = [
  tx('2026-08-03', 'Expense', 1000, { category: 'food' }),
  tx('2026-08-09', 'Expense', 250, { category: 'fun' }),
];
const rows = [...september, ...august];

test('totals, net and savings rate for a finished month', () => {
  const r = buildRecap({ rows, month: new Date(2026, 8, 15), today: new Date(2026, 9, 2) });
  assert.equal(r.key, '2026-09');
  assert.equal(r.running, false);
  assert.equal(r.spent, 2000);
  assert.equal(r.earned, 10000);
  assert.equal(r.net, 8000);
  assert.equal(r.savingsRate, 0.8);
  assert.equal(r.count, 5);
  assert.equal(r.elapsed, 30);
});

test('where it went, largest first, with shares', () => {
  const r = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.deepEqual(r.categories.map((c) => [c.category, c.amount]), [['home', 1200], ['food', 400], ['fun', 400]]);
  assert.equal(r.categories[0].share, 0.6);
});

test('against last month: overall change and the categories that moved most', () => {
  const r = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.prevSpent, 1250);
  assert.equal(r.spentChange, 0.6);
  assert.equal(r.rose.category, 'home');
  assert.equal(r.fell.category, 'food');
  assert.equal(r.fell.delta, -600);
});

test('days: the busiest one, quiet days and the longest quiet run', () => {
  const r = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.deepEqual([r.busiest.day, r.busiest.amount], [4, 1300]);
  assert.equal(r.quietDays, 27);
  assert.equal(r.longestQuiet, 13); // Sept 5–17
  assert.equal(r.biggest.description, 'Sofa');
});

test('a month still running only counts the days so far', () => {
  const r = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 8, 10) });
  assert.equal(r.running, true);
  assert.equal(r.elapsed, 10);
  assert.equal(r.quietDays, 8);
  assert.equal(r.perDayAverage, 160);
});

test('a month still running is compared with the same days of last month', () => {
  // Sept 1-10: 1600 spent. Aug 1-10: 1250 (both rows). Aug 1-5: only the 1000 on the 3rd.
  assert.equal(buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 8, 10) }).prevSpent, 1250);
  const early = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 8, 5) });
  assert.equal(early.prevSpent, 1000);
  assert.equal(early.spentChange, 0.6);
});

test('who paid, in a shared household (paidBy wins over who typed it in)', () => {
  const members = [{ email: 'a@x.com', name: 'Ana' }, { email: 'b@x.com', name: 'Ben' }];
  const r = buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2), members });
  assert.deepEqual(r.people.map((p) => [p.name, p.amount]), [['Ben', 1600], ['Ana', 400]]);
  assert.equal(buildRecap({ rows, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) }).people.length, 0);
});

test('an empty month says so and divides by nothing', () => {
  const r = buildRecap({ rows, month: new Date(2026, 5, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.isEmpty, true);
  assert.equal(r.savingsRate, null);
  assert.equal(r.spentChange, null);
  assert.equal(r.busiest, null);
  assert.equal(r.topWeekday, null);
});

test('last month is offered in the first week of the next one', () => {
  assert.equal(recapToOffer(new Date(2026, 9, 3)).getMonth(), 8);
  assert.equal(recapToOffer(new Date(2026, 0, 2)).getFullYear(), 2025);
  assert.equal(recapToOffer(new Date(2026, 9, 12)), null);
});

test('a category that barely moved is not called out', () => {
  const rows2 = [
    tx('2026-09-03', 'Expense', 1000, { category: 'food' }), tx('2026-09-04', 'Expense', 500, { category: 'fun' }),
    tx('2026-08-03', 'Expense', 1006, { category: 'food' }), tx('2026-08-04', 'Expense', 200, { category: 'fun' }),
  ];
  const r = buildRecap({ rows: rows2, month: new Date(2026, 8, 1), today: new Date(2026, 9, 2) });
  assert.equal(r.rose.category, 'fun');
  assert.equal(r.fell, null); // food went down by 6: not worth a line
});
