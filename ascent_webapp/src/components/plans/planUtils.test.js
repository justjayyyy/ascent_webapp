import { describe, expect, test, vi, afterEach } from 'vitest';
import { planTotals, planTimeline, kindEmoji, templateItems } from './planUtils';

afterEach(() => vi.useRealTimers());

const plan = {
  budget: 10000,
  startDate: '2026-12-20',
  items: [
    { id: 'a', amount: 3000, status: 'paid', transactionId: 't1', dueDate: '2026-09-01' },
    { id: 'b', amount: 2000, status: 'booked', dueDate: '2026-11-01' },
    { id: 'c', amount: 1000, status: 'planned', dueDate: '2026-10-15' },
    { id: 'd', amount: 500, status: 'paid' }, // paid before it was tracked here
  ],
};
const linked = [
  { id: 't1', amount: 3200, date: '2026-09-03' }, // the real price of item a
  { id: 't9', amount: 300, date: '2026-10-02' }, // spent for the plan, not for an item
];

describe('plan totals', () => {
  test('paid items count what was really paid; extra spending counts too', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 1) });
    const s = planTotals(plan, linked);
    expect(s.paid).toBe(3200 + 500 + 300);
    expect(s.planned).toBe(3200 + 2000 + 1000 + 500 + 300);
    expect(s.booked).toBe(2000);
    expect(s.extraSpent).toBe(300);
    expect(s.remaining).toBe(10000 - 4000);
    expect(s.next.id).toBe('c');
    expect(s.overdue).toBe(0);
    expect(s.pace).toBeCloseTo(6000 / 2, 5); // October and November left before December
  });

  test('amounts go through the plan currency converter', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 1) });
    const s = planTotals(plan, linked, (tx) => tx.amount * 2);
    expect(s.paid).toBe(6400 + 500 + 600);
  });

  test('a past due item is overdue; a plan without a date has no pace', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 5) });
    expect(planTotals(plan, linked).overdue).toBe(2);
    expect(planTotals({ items: [] }).pace).toBeNull();
  });
});

describe('plan timeline', () => {
  test('month by month from the first payment to the event, gaps filled', () => {
    const rows = planTimeline(plan, linked);
    expect(rows.map((r) => r.key)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(rows.find((r) => r.key === '2026-09').paid).toBe(3200);
    expect(rows.find((r) => r.key === '2026-10')).toMatchObject({ paid: 300, due: 1000 });
    expect(rows.find((r) => r.key === '2026-12')).toMatchObject({ paid: 500, isEvent: true });
  });

  test('an empty plan has no timeline', () => {
    expect(planTimeline({ items: [] })).toEqual([]);
  });
});

test('each kind has an emoji, unknown kinds a pin', () => {
  expect(kindEmoji('wedding')).toBe('💍');
  expect(kindEmoji('spaceship')).toBe('📌');
});

test('templates suggest dated items with translated names', () => {
  const items = templateItems('vacation', '2026-12-20', (k) => `t:${k}`);
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((i) => i.name.startsWith('t:') && i.status === 'planned' && i.id)).toBe(true);
});
