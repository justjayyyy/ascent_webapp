import { describe, expect, test } from 'vitest';
import { normalizeItem, buildDayMap, layoutTimed, fmtHourLabel, weekStartsOnFor, dayKey, minutesOfDay } from './calendarUtils';

describe('Google items in one shape', () => {
  test('an all-day event covers its days (Google end dates are exclusive)', () => {
    const e = normalizeItem({ id: 'e1', summary: 'Trip', start: { date: '2026-10-01' }, end: { date: '2026-10-04' } }, 'event');
    expect(e).toMatchObject({ allDay: true, title: 'Trip', editable: true });
    expect(dayKey(e.lastDay)).toBe('2026-10-03');
  });

  test('a timed event without an end lasts an hour; holidays are read-only', () => {
    const e = normalizeItem({ id: 'e2', start: { dateTime: '2026-10-01T10:00:00' } }, 'event');
    expect(+e.end - +e.start).toBe(60 * 60 * 1000);
    const h = normalizeItem({ id: 'h', start: { date: '2026-10-02' } }, 'holiday');
    expect(h.editable).toBe(false);
  });

  test('tasks need a due date and are never edited here', () => {
    expect(normalizeItem({ id: 't', title: 'x' }, 'task')).toBeNull();
    expect(normalizeItem({ id: 't', title: 'x', due: '2026-10-05T00:00:00.000Z', status: 'completed' }, 'task')).toMatchObject({ id: 'task:t', done: true, editable: false });
    expect(normalizeItem({ id: 'x' }, 'event')).toBeNull();
  });
});

describe('day map and layout', () => {
  test('multi-day items appear on every day; all-day items first, holidays before events', () => {
    const items = [
      normalizeItem({ id: 'timed', start: { dateTime: '2026-10-02T09:00:00' }, end: { dateTime: '2026-10-02T10:00:00' } }, 'event'),
      normalizeItem({ id: 'trip', start: { date: '2026-10-01' }, end: { date: '2026-10-03' } }, 'event'),
      normalizeItem({ id: 'hol', start: { date: '2026-10-02' } }, 'holiday'),
    ];
    const map = buildDayMap(items);
    expect(map.get('2026-10-01').map((i) => i.id)).toEqual(['trip']);
    expect(map.get('2026-10-02').map((i) => i.id)).toEqual(['hol', 'trip', 'timed']);
    expect(map.has('2026-10-03')).toBe(false);
  });

  test('overlapping events share the width; separate ones get it all', () => {
    const at = (h, m = 0) => new Date(2026, 9, 1, h, m);
    const a = { start: at(9), end: at(10) };
    const b = { start: at(9, 30), end: at(11) };
    const c = { start: at(12), end: at(13) };
    const out = layoutTimed([c, b, a]);
    const of = (item) => out.find((o) => o.item === item);
    expect([of(a).col, of(a).cols]).toEqual([0, 2]);
    expect([of(b).col, of(b).cols]).toEqual([1, 2]);
    expect([of(c).col, of(c).cols]).toEqual([0, 1]);
  });
});

test('clock and week conventions per language', () => {
  expect(weekStartsOnFor('ru')).toBe(1);
  expect(weekStartsOnFor('he')).toBe(0);
  expect(fmtHourLabel(13, 'he')).toMatch(/13/);
  expect(minutesOfDay(new Date(2026, 0, 1, 2, 30))).toBe(150);
});
