import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipientsOf, reminderFor, reminderPush } from './taskReminders.js';

const task = (dueDate, extra = {}) => ({ _id: 't1', title: 'Car insurance', dueDate, remindDays: 7, status: 'open', amount: 2400, currency: 'ILS', ...extra });

test('a reminder when the window opens, on the day, and the day after', () => {
  assert.equal(reminderFor(task('2026-10-09'), '2026-10-02'), 'ahead');
  assert.equal(reminderFor(task('2026-10-08'), '2026-10-02'), null);
  assert.equal(reminderFor(task('2026-10-02'), '2026-10-02'), 'today');
  assert.equal(reminderFor(task('2026-10-01'), '2026-10-02'), 'late');
  assert.equal(reminderFor(task('2026-09-30'), '2026-10-02'), null);
  assert.equal(reminderFor(task('2026-10-02', { status: 'done' }), '2026-10-02'), null);
  assert.equal(reminderFor(task(null), '2026-10-02'), null);
  // "On the day" only: no reminder ahead
  assert.equal(reminderFor(task('2026-10-09', { remindDays: 0 }), '2026-10-02'), null);
});

test('the notification, in the reader\'s language, opens the task', () => {
  const en = reminderPush(task('2026-10-09'), 'ahead', 'en');
  assert.equal(en.title, 'In 7 days: Car insurance');
  assert.match(en.body, /2,400/);
  assert.equal(en.url, '/Tasks?task=t1');
  assert.equal(reminderPush(task('2026-10-02', { amount: 0 }), 'today', 'he').title, 'היום: Car insurance');
  assert.equal(reminderPush(task('2026-10-02', { amount: 0 }), 'today', 'he').body, '');
});

test('the assignee hears about it; a task for anyone goes to everyone', () => {
  const workspace = { members: [
    { userId: 'u1', email: 'dana@x', status: 'accepted' },
    { userId: 'u2', email: 'Sam@x', status: 'accepted' },
    { userId: 'u3', email: 'gone@x', status: 'pending' },
  ] };
  assert.deepEqual(recipientsOf(task('2026-10-02'), workspace).map((m) => m.userId), ['u1', 'u2']);
  assert.deepEqual(recipientsOf(task('2026-10-02', { assignee: 'sam@x' }), workspace).map((m) => m.userId), ['u2']);
  assert.deepEqual(recipientsOf(task('2026-10-02', { assignee: 'left@x' }), workspace).map((m) => m.userId), ['u1', 'u2']);
});
