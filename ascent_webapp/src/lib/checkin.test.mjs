import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinDue, checkinQueue, duplicateOriginal, isUncategorized, weekSummary } from './checkin.js';

const tx = (id, date, extra = {}) => ({ id, type: 'Expense', date, _amount: 100, category: 'groceries', status: 'confirmed', ...extra });
const today = new Date(2026, 9, 2, 18);

test('"Other" in any language counts as not categorised', () => {
  assert.equal(isUncategorized(tx('a', '2026-10-01', { category: 'other_expense' })), true);
  assert.equal(isUncategorized(tx('a', '2026-10-01', { category: 'אחר' })), true);
  assert.equal(isUncategorized(tx('a', '2026-10-01', { category: '' })), true);
  assert.equal(isUncategorized(tx('a', '2026-10-01')), false);
  assert.equal(isUncategorized({ ...tx('a', '2026-10-01', { category: 'other_expense' }), type: 'Income' }), false);
});

test('the queue: duplicates, then unreviewed, then uncategorised; recent, happened, not skipped', () => {
  const rows = [
    tx('cat', '2026-09-30', { category: 'other_expense' }),
    tx('rev', '2026-09-28', { status: 'pending' }),
    tx('dup', '2026-09-20', { status: 'pending', ingest: { flags: ['possibleDuplicate'], duplicateOf: 'orig' } }),
    tx('orig', '2026-09-20'),
    tx('old', '2026-08-01', { status: 'pending' }),
    tx('future', '2026-10-10', { category: 'other_expense' }),
    tx('skip', '2026-10-01', { status: 'pending' }),
    tx('local:x', '2026-10-01', { status: 'pending' }),
  ];
  const q = checkinQueue(rows, { today, skipped: new Set(['skip']) });
  assert.deepEqual(q.map((x) => [x.tx.id, x.reason]), [['dup', 'duplicate'], ['rev', 'review'], ['cat', 'category']]);
  assert.equal(duplicateOriginal(q[0].tx, rows).id, 'orig');
});

test('the week: spent, against a usual week, top category and what is coming', () => {
  const rows = [];
  // Eight earlier weeks at 700 each (100 a day)
  for (let d = 7; d < 63; d += 1) rows.push(tx(`p${d}`, new Date(2026, 9, 2 - d).toLocaleDateString('sv')));
  rows.push(tx('w1', '2026-09-30', { _amount: 300, category: 'fun' }), tx('w2', '2026-10-01', { _amount: 50 }));
  rows.push(tx('next', '2026-10-05', { _amount: 120, isRecurring: true, description: 'Netflix' }));
  rows.push(tx('rent', '2026-10-01', { _amount: 4800, isRecurring: true, category: 'rent' }));
  const w = weekSummary(rows, { today });
  assert.equal(w.from, '2026-09-26');
  // Rent runs by itself: it is counted apart rather than making the week look unusual
  assert.equal(w.spent, 350);
  assert.equal(w.bills, 4800);
  assert.equal(w.usual, 700);
  assert.equal(w.change, -0.5);
  assert.equal(w.topCategory.category, 'fun');
  assert.equal(w.noSpendDays, 4); // 26, 27, 28, 29 (today is not over)
  assert.equal(w.coming.total, 120);
  assert.equal(w.coming.items[0].description, 'Netflix');
});

test('due when something waits, or a week after the last one', () => {
  assert.equal(checkinDue({ queueLength: 2, lastDone: '2026-10-01', today }), true);
  assert.equal(checkinDue({ queueLength: 0, lastDone: '2026-09-28', today }), false);
  assert.equal(checkinDue({ queueLength: 0, lastDone: '2026-09-25', today }), true);
  assert.equal(checkinDue({ queueLength: 0, lastDone: null, today }), true);
});
