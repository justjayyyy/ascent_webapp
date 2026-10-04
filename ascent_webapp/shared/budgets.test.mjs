import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, budgetsForMonth, removalFrom, lastBudgetedBefore } from './budgets.js';

const b = (id, category, ym, limit, extra = {}) => {
  const [year, month] = ym.split('-').map(Number);
  return { id, category, year, month, monthlyLimit: limit, ...extra };
};
const limits = (list) => Object.fromEntries(list.map((x) => [x.category, x.monthlyLimit]));

test('addMonths crosses year ends both ways', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('a budget that does not repeat counts in its own month only', () => {
  const rows = [b('1', 'food', '2026-09', 500)];
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-09')), { food: 500 });
  assert.deepEqual(budgetsForMonth(rows, '2026-10'), []);
  assert.deepEqual(budgetsForMonth(rows, '2026-08'), []);
});

test('a repeating budget carries on until a later one takes over, and earlier months keep theirs', () => {
  const rows = [b('1', 'food', '2026-09', 500, { repeat: true }), b('2', 'food', '2026-11', 700, { repeat: true })];
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-10')), { food: 500 });
  assert.equal(budgetsForMonth(rows, '2026-10')[0].inherited, true);
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-11')), { food: 700 });
  assert.equal(budgetsForMonth(rows, '2026-11')[0].inherited, false);
  assert.deepEqual(limits(budgetsForMonth(rows, '2027-05')), { food: 700 });
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-09')), { food: 500 });
});

test('a one-month change sits on top of a repeating budget, which comes back the month after', () => {
  const rows = [b('1', 'food', '2026-09', 500, { repeat: true }), b('2', 'food', '2026-10', 900)];
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-10')), { food: 900 });
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-11')), { food: 500 });
});

test('until ends a repeating budget; inactive ones never count', () => {
  const rows = [b('1', 'food', '2026-09', 500, { repeat: true, until: '2026-10' }), b('2', 'fun', '2026-09', 50, { repeat: true, isActive: false })];
  assert.deepEqual(limits(budgetsForMonth(rows, '2026-10')), { food: 500 });
  assert.deepEqual(budgetsForMonth(rows, '2026-11'), []);
});

test('two budgets for one month (two phones at once) count once, the one saved last', () => {
  const rows = [
    b('1', 'food', '2026-10', 500, { updated_date: '2026-10-01T10:00:00Z' }),
    b('2', 'food', '2026-10', 600, { updated_date: '2026-10-01T10:05:00Z' }),
  ];
  assert.deepEqual(budgetsForMonth(rows, '2026-10').map((x) => x.id), ['2']);
});

test('removing a repeating budget stops it from that month; earlier months keep it', () => {
  const rows = [b('1', 'food', '2026-07', 500, { repeat: true }), b('2', 'food', '2026-09', 600, { repeat: true }), b('3', 'food', '2026-12', 800), b('4', 'fun', '2026-07', 90, { repeat: true })];
  const change = removalFrom(rows, 'food', '2026-10');
  assert.deepEqual(change, { updates: [{ id: '1', until: '2026-09' }, { id: '2', until: '2026-09' }], deletes: ['3'] });
  const after = rows.filter((x) => !change.deletes.includes(x.id)).map((x) => ({ ...x, ...change.updates.find((u) => u.id === x.id) }));
  assert.deepEqual(limits(budgetsForMonth(after, '2026-10')), { fun: 90 });
  assert.deepEqual(limits(budgetsForMonth(after, '2026-09')), { food: 600, fun: 90 });
});

test('removing a one-month change only removes that month', () => {
  const rows = [b('1', 'food', '2026-09', 500, { repeat: true }), b('2', 'food', '2026-10', 900)];
  assert.deepEqual(removalFrom(rows, 'food', '2026-10'), { updates: [], deletes: ['2'] });
});

test('the last month with budgets, for a month that has none', () => {
  const rows = [b('1', 'food', '2026-08', 500), b('2', 'fun', '2026-08', 50)];
  const last = lastBudgetedBefore(rows, '2026-10');
  assert.equal(last.month, '2026-08');
  assert.deepEqual(limits(last.budgets), { food: 500, fun: 50 });
  assert.equal(lastBudgetedBefore(rows, '2026-08'), null);
});
