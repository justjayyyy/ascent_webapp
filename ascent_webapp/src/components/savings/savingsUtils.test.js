import { describe, expect, test } from 'vitest';
import { entriesNewestFirst, goalEmoji, goalTotals, kindOf, milestoneCrossed, savedIn, savingsHistory } from './savingsUtils';

const today = new Date('2026-10-15T12:00:00');

const goal = {
  targetAmount: 12000,
  currentAmount: 2000,
  targetDate: '2027-04-15',
  entries: [
    { id: 'a', date: '2026-08-01', amount: 1000 },
    { id: 'b', date: '2026-09-01', amount: 1000 },
    { id: 'c', date: '2026-09-20', amount: -500 },
    { id: 'd', date: '2026-10-01', amount: 1500 },
  ],
};

describe('savedIn', () => {
  test('starts from what was already saved and nets deposits and withdrawals', () => {
    expect(savedIn(goal)).toBe(5000);
    expect(savedIn({})).toBe(0);
  });
});

describe('goalTotals', () => {
  test('what is left, what each month needs and this month', () => {
    const t = goalTotals(goal, today);
    expect(t.saved).toBe(5000);
    expect(t.remaining).toBe(7000);
    expect(t.pct).toBeCloseTo(5000 / 12000);
    expect(t.thisMonth).toBe(1500);
    expect(t.monthsLeft).toBe(6);
    expect(t.needPerMonth).toBeCloseTo(7000 / 6);
  });

  test('pace counts since the first entry when the goal is younger than three months', () => {
    const t = goalTotals(goal, today);
    // 3000 net from Aug 1 to Oct 15 (76 days ≈ 2.5 months)
    expect(t.pace).toBeCloseTo(3000 / (76 / 30.44), 0);
    expect(t.status).toBe('onTrack');
  });

  test('a monthly plan is what the projection uses', () => {
    const t = goalTotals({ ...goal, monthlyAmount: 500 }, today);
    expect(t.rate).toBe(500);
    expect(t.projected).toBe('2027-12'); // 7000 / 500 = 14 months
    expect(t.status).toBe('behind');
  });

  test('reached, open-ended, late and not started', () => {
    expect(goalTotals({ ...goal, targetAmount: 4000 }, today).status).toBe('reached');
    expect(goalTotals({ ...goal, targetAmount: 0 }, today).status).toBe('open');
    expect(goalTotals({ ...goal, targetDate: '2026-09-01' }, today).status).toBe('late');
    expect(goalTotals({ targetAmount: 1000, entries: [] }, today).status).toBe('start');
  });

  test('without a target there is no percentage or projection', () => {
    const t = goalTotals({ ...goal, targetAmount: 0 }, today);
    expect(t.pct).toBeNull();
    expect(t.projected).toBeNull();
    expect(t.needPerMonth).toBeNull();
  });
});

describe('savingsHistory', () => {
  test('runs month by month to this month with a running balance', () => {
    const months = savingsHistory(goal, today);
    expect(months.map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(months.map((m) => m.balance)).toEqual([3000, 3500, 5000]);
    expect(months[1]).toMatchObject({ in: 1000, out: 500 });
  });

  test('a new goal is just this month', () => {
    expect(savingsHistory({ currentAmount: 100 }, today)).toEqual([{ key: '2026-10', in: 0, out: 0, balance: 100 }]);
  });
});

describe('milestoneCrossed', () => {
  test('the highest milestone passed by a deposit', () => {
    expect(milestoneCrossed(2000, 3000, 10000)).toBe(25);
    expect(milestoneCrossed(2000, 8000, 10000)).toBe(75);
    expect(milestoneCrossed(9000, 10000, 10000)).toBe(100);
    expect(milestoneCrossed(3000, 4000, 10000)).toBeNull();
    expect(milestoneCrossed(3000, 2000, 10000)).toBeNull();
    expect(milestoneCrossed(0, 100, 0)).toBeNull();
  });
});

describe('kinds and order', () => {
  test('old goals map their category to a kind', () => {
    expect(kindOf({ category: 'emergency' })).toBe('emergency');
    expect(kindOf({ category: 'purchase' })).toBe('other');
    expect(goalEmoji({ kind: 'vacation' })).toBe('🏝️');
    expect(goalEmoji({ kind: 'car', emoji: '🏎️' })).toBe('🏎️');
  });

  test('newest first, latest added on top within a day', () => {
    const list = [{ id: 1, date: '2026-10-01' }, { id: 2, date: '2026-10-03' }, { id: 3, date: '2026-10-01' }];
    expect(entriesNewestFirst(list).map((e) => e.id)).toEqual([2, 3, 1]);
  });
});
