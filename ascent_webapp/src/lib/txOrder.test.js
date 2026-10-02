import { describe, expect, test } from 'vitest';
import { newestFirst, txTime } from './txOrder';

const at = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

describe('transaction order', () => {
  test('newest day first, and within a day the latest time first', () => {
    const rows = [
      { id: 'a', date: '2026-10-01', created_date: at('2026-10-01', 9) },
      { id: 'b', date: '2026-10-02', created_date: at('2026-10-02', 8) },
      { id: 'c', date: '2026-10-02', occurredAt: at('2026-10-02', 18), created_date: at('2026-10-02', 7) },
      { id: 'd', date: '2026-10-02', created_date: at('2026-10-02', 12) },
    ];
    expect([...rows].sort(newestFirst).map(r => r.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  test('a row still on this device goes on top of its day', () => {
    const rows = [{ id: 'saved', date: '2026-10-02', created_date: at('2026-10-02', 20) }, { id: 'local', date: '2026-10-02' }];
    expect(rows.sort(newestFirst)[0].id).toBe('local');
  });
});

describe('time of day', () => {
  test('the purchase time, else when it was saved on that same day', () => {
    expect(txTime({ date: '2026-10-02', occurredAt: at('2026-10-02', 18) }).getHours()).toBe(18);
    expect(txTime({ date: '2026-10-02', created_date: at('2026-10-02', 9) }).getHours()).toBe(9);
  });

  test('unknown for a row added later for an earlier day', () => {
    expect(txTime({ date: '2026-09-28', created_date: at('2026-10-02', 9) })).toBeNull();
    expect(txTime({ date: '2026-09-28' })).toBeNull();
  });
});
