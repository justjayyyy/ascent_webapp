import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChosenSpend, monthNoSpend, noSpendStats, streakMilestone } from './noSpend.js';

const spend = (date, extra = {}) => ({ type: 'Expense', date, _amount: 50, ...extra });

test('bills that run on their own do not break a no-spend day', () => {
  assert.equal(isChosenSpend(spend('2026-10-01')), true);
  assert.equal(isChosenSpend(spend('2026-10-01', { isRecurring: true })), false);
  assert.equal(isChosenSpend(spend('2026-10-01', { installmentGroupId: 'g' })), false);
  assert.equal(isChosenSpend(spend('2026-10-01', { commitmentId: 'c' })), false);
  assert.equal(isChosenSpend({ type: 'Income', date: '2026-10-01', _amount: 50 }), false);
  assert.equal(isChosenSpend(spend('2026-10-01', { status: 'pending', ingest: { flags: ['possibleDuplicate'] } })), false);
});

test('the current streak runs through today while nothing was bought today', () => {
  const rows = [spend('2026-09-20'), spend('2026-09-26'), spend('2026-09-27', { isRecurring: true })];
  const s = noSpendStats(rows, { today: new Date(2026, 9, 2, 15) });
  // 27, 28, 29, 30 Sep, 1 Oct and today
  assert.equal(s.todayClear, true);
  assert.equal(s.current, 6);
  assert.equal(s.best, 6);
});

test('a purchase today ends the run at yesterday', () => {
  const rows = [spend('2026-09-28'), spend('2026-10-02')];
  const s = noSpendStats(rows, { today: new Date(2026, 9, 2, 15) });
  assert.equal(s.todayClear, false);
  assert.equal(s.current, 3); // 29, 30 Sep, 1 Oct
});

test('days before the first record are not counted as no-spend days', () => {
  const rows = [spend('2026-10-01')];
  const s = noSpendStats(rows, { today: new Date(2026, 9, 3) });
  assert.equal(s.start, '2026-10-01');
  assert.equal(s.best, 2); // the 2nd and today
  assert.equal(s.month.days[0].state, 'spent');
  assert.equal(s.month.days[2].state, 'free');
  assert.equal(s.month.days[3].state, 'future');
  // Today is not over, so it is not in the month's count yet
  assert.equal(s.month.free, 1);
});

test('a finished month: no-spend days and the longest run', () => {
  const rows = [spend('2026-08-31'), ...[1, 2, 5, 6, 7, 8, 9, 10, 20].map((d) => spend(`2026-09-${String(d).padStart(2, '0')}`))];
  const m = monthNoSpend(rows, new Date(2026, 8, 1), new Date(2026, 9, 2));
  assert.equal(m.counted, 30);
  assert.equal(m.free, 21);
  assert.equal(m.longest, 10); // 21-30
});

test('milestones are 3, 7, 14, 21 and every 30 days', () => {
  assert.deepEqual([2, 3, 7, 10, 14, 21, 30, 45, 60].map(streakMilestone), [null, 3, 7, null, 14, 21, 30, null, 60]);
});
