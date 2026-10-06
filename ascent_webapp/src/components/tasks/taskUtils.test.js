import { describe, expect, test } from 'vitest';
import { addMonths, completeChanges, dueState, isMine, nextDue, sectionTasks, totalOf, upcomingCost } from './taskUtils';

const today = new Date(2026, 9, 2, 12);
const task = (title, dueDate, extra = {}) => ({ id: title, title, dueDate, status: 'open', repeat: 'none', amount: 0, remindDays: 7, ...extra });

describe('dates', () => {
  test('a month later keeps the day, or takes the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', 12)).toBe('2027-10-15');
    expect(nextDue('2026-11-30', 'bimonthly')).toBe('2027-01-30');
    expect(nextDue('2026-11-30', 'none')).toBeNull();
  });

  test('where a task stands', () => {
    expect(dueState(task('a', '2026-10-01'), today)).toBe('overdue');
    expect(dueState(task('a', '2026-10-02'), today)).toBe('today');
    expect(dueState(task('a', '2026-10-08'), today)).toBe('soon');
    expect(dueState(task('a', '2026-10-20'), today)).toBe('later');
    expect(dueState(task('a', '2026-10-20', { remindDays: 30 }), today)).toBe('soon');
    expect(dueState(task('a', null), today)).toBe('undated');
    expect(dueState(task('a', '2026-10-01', { status: 'done' }), today)).toBe('done');
  });
});

test('the page in reading order: what needs someone now, then by month', () => {
  const s = sectionTasks([
    task('later', '2027-01-01'), task('month', '2026-10-25'), task('soon', '2026-10-06'), task('late', '2026-09-20'),
    task('far but reminded early', '2026-10-30', { remindDays: 30 }), task('whenever', null),
    task('finished', '2026-09-01', { status: 'done' }), task('also October', '2026-10-20'),
  ], today);
  expect(s.now.map((t) => t.title)).toEqual(['late', 'soon', 'far but reminded early']);
  expect(s.months.map((m) => [m.key, m.tasks.map((t) => t.title)])).toEqual([
    ['2026-10', ['also October', 'month']], ['2027-01', ['later']],
  ]);
  expect(s.undated.map((t) => t.title)).toEqual(['whenever']);
  expect(s.done.map((t) => t.title)).toEqual(['finished']);
});

test('mine is what is given to me, and what is given to nobody', () => {
  expect(isMine(task('a', null, { assignee: 'me@x' }), 'me@x')).toBe(true);
  expect(isMine(task('a', null, { assignee: '' }), 'me@x')).toBe(true);
  expect(isMine(task('a', null, { assignee: 'you@x' }), 'me@x')).toBe(false);
});

test('a total converts each cost and skips the free ones', () => {
  expect(totalOf([task('a', null, { amount: 10, currency: 'USD' }), task('b', null, { amount: 5 }), task('c', null)], (a, c) => (c === 'USD' ? a * 4 : a))).toBe(45);
});

test('what the next month will cost, late tasks included', () => {
  const u = upcomingCost([
    task('late', '2026-09-20', { amount: 100 }), task('soon', '2026-10-20', { amount: 50, currency: 'USD' }),
    task('far', '2027-01-01', { amount: 999 }), task('free', '2026-10-05'),
  ], { today, toMine: (a, c) => (c === 'USD' ? a * 4 : a) });
  expect(u).toMatchObject({ total: 300, count: 2 });
});

describe('ticking a task off', () => {
  test('a repeating task rolls on, and remembers what it cost', () => {
    const { entry, changes } = completeChanges(task('Arnona', '2026-10-01', { repeat: 'bimonthly', amount: 600, currency: 'ILS' }), { date: '2026-10-02', amount: 640, logged: true, by: 'a@x' });
    expect(changes).toEqual({ dueDate: '2026-12-01', status: 'open', amount: 640 });
    expect(entry).toMatchObject({ date: '2026-10-02', dueDate: '2026-10-01', amount: 640, currency: 'ILS', logged: true, by: 'a@x' });
  });

  test('late by more than a round, the next date is after today', () => {
    const { changes } = completeChanges(task('Water', '2026-06-10', { repeat: 'monthly' }), { date: '2026-10-02' });
    expect(changes.dueDate).toBe('2026-10-10');
  });

  test('a one-off task is done', () => {
    const { entry, changes } = completeChanges(task('Passport', '2026-10-05'), { date: '2026-10-02' });
    expect(changes.status).toBe('done');
    expect(entry.amount).toBe(0);
    expect(entry.currency).toBeNull();
  });
});
