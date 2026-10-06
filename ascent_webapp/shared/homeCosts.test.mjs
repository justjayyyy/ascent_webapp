// Home costs are counted in the months each payment is for: a bill paid late lands in the months it covers,
// one paid ahead is spread over the months ahead, and a month whose bill has not come yet is estimated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveredMonths, hasPeriod, homeCosts, periodLabel } from './homeCosts.js';

const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const exp = (over) => ({ type: 'Expense', category: 'utilities', description: 'Meniv water', ...over, _amount: over.amount });
const at = (result, category, month) => result.byCategory[category]?.[month];

test('an expense is for the month it was paid, unless it says which months it covers', () => {
  assert.deepEqual(coveredMonths({ date: '2026-10-05' }), ['2026-10']);
  assert.deepEqual(coveredMonths({ date: '2026-10-05', coversFrom: '2026-07', coversTo: '2026-08' }), ['2026-07', '2026-08']);
  assert.deepEqual(coveredMonths({ date: '2026-09-01', coversFrom: '2026-12', coversTo: '2026-11' }), ['2026-11', '2026-12']);
  assert.deepEqual(coveredMonths({ date: '2026-09-01', coversFrom: '2026-09' }), ['2026-09']);
  assert.equal(coveredMonths({ date: '2026-01-01', coversFrom: '2026-01', coversTo: '2030-01' }).length, 24);
  assert.equal(hasPeriod({ date: '2026-10-05', coversFrom: '2026-07', coversTo: '2026-08' }), true);
  assert.equal(hasPeriod({ date: '2026-10-05', coversFrom: '2026-10', coversTo: '2026-10' }), false);
  assert.equal(hasPeriod({ date: '2026-10-05' }), false);
});

test('a water bill for July–August paid in October costs half in each of July and August', () => {
  const water = exp({ date: '2026-10-05', amount: 191.55, coversFrom: '2026-07', coversTo: '2026-08' });
  const r = homeCosts([water], { months: MONTHS, until: '2026-10' });
  assert.equal(at(r, 'utilities', '2026-07').amount, 191.55 / 2);
  assert.equal(at(r, 'utilities', '2026-08').amount, 191.55 / 2);
  assert.equal(at(r, 'utilities', '2026-08').estimated, false);
  // It was paid in October
  assert.equal(r.months.find((m) => m.key === '2026-10').paid, 191.55);
  // September and October have no bill yet: estimated from July–August
  assert.deepEqual([at(r, 'utilities', '2026-09'), at(r, 'utilities', '2026-10')].map((c) => [c.amount, c.estimated]), [[191.55 / 2, true], [191.55 / 2, true]]);
  assert.equal(at(r, 'utilities', '2026-06'), undefined);
});

test('property tax for September–October paid on September 1st is half each month, nothing estimated', () => {
  const tax = exp({ category: 'taxes', description: 'Arnona', date: '2026-09-01', amount: 916.3, coversFrom: '2026-09', coversTo: '2026-10' });
  const r = homeCosts([tax], { months: MONTHS, until: '2026-10' });
  assert.equal(at(r, 'taxes', '2026-09').amount, 458.15);
  assert.equal(at(r, 'taxes', '2026-10').amount, 458.15);
  assert.deepEqual(r.months.map((m) => Math.round(m.total * 100) / 100), [0, 0, 0, 0, 458.15, 458.15]);
  assert.equal(r.months.find((m) => m.key === '2026-09').paid, 916.3);
  assert.equal(r.months.find((m) => m.key === '2026-10').paid, 0);
});

test('rent not paid yet this month is expected at last month\'s amount; an old bill is not', () => {
  const rows = [
    exp({ category: 'rent_housing', description: 'Rent', date: '2026-08-10', amount: 4500 }),
    exp({ category: 'rent_housing', description: 'Rent', date: '2026-09-10', amount: 4500 }),
    exp({ category: 'insurance', description: 'Car insurance', date: '2025-11-01', amount: 2400 }),
  ];
  const r = homeCosts(rows, { months: MONTHS, until: '2026-10' });
  assert.deepEqual(at(r, 'rent_housing', '2026-10'), { amount: 4500, estimated: true, parts: at(r, 'rent_housing', '2026-10').parts });
  assert.equal(at(r, 'insurance', '2026-10'), undefined);
  // Nothing is estimated past this month
  const later = homeCosts(rows, { months: [...MONTHS, '2026-11'], until: '2026-10' });
  assert.equal(at(later, 'rent_housing', '2026-11'), undefined);
});

test('two bills of the same kind in different months are one series; other kinds are their own', () => {
  const rows = [
    exp({ date: '2026-08-20', amount: 180, coversFrom: '2026-05', coversTo: '2026-06' }),
    exp({ date: '2026-10-05', amount: 191.55, coversFrom: '2026-07', coversTo: '2026-08' }),
    exp({ description: 'IEC electricity', date: '2026-09-15', amount: 600, coversFrom: '2026-07', coversTo: '2026-08' }),
  ];
  const r = homeCosts(rows, { months: MONTHS, until: '2026-10' });
  // July: half the water bill and half the electricity bill, both real
  assert.equal(at(r, 'utilities', '2026-07').amount, 191.55 / 2 + 300);
  // October: both estimated from their latest bills
  assert.equal(Math.round(at(r, 'utilities', '2026-10').amount * 100) / 100, Math.round((191.55 / 2 + 300) * 100) / 100);
  assert.equal(r.months.find((m) => m.key === '2026-10').estimated, r.months.find((m) => m.key === '2026-10').total);
});

test('only the home counts: groceries are left out, a category with a bill for other months is in', () => {
  const rows = [
    exp({ category: 'groceries', description: 'Shufersal', date: '2026-10-02', amount: 300 }),
    exp({ category: 'Building fee', description: 'Vaad bayit', date: '2026-10-01', amount: 600, coversFrom: '2026-10', coversTo: '2026-12' }),
    { type: 'Income', category: 'salary', date: '2026-10-01', _amount: 10000 },
  ];
  const r = homeCosts(rows, { months: MONTHS, until: '2026-10' });
  assert.deepEqual(Object.keys(r.byCategory), ['Building fee']);
  assert.equal(r.average, 200);
});

test('a period reads the way people say it', () => {
  assert.equal(periodLabel('2026-07', '2026-08'), 'Jul–Aug 2026');
  assert.equal(periodLabel('2026-11', '2027-02'), 'Nov 2026–Feb 2027');
  assert.equal(periodLabel('2026-10', '2026-10'), 'Oct 2026');
  assert.equal(periodLabel(null, null), '');
});
