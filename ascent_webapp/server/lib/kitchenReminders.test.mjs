// The kitchen check reminder: on the day it is due and two days later, counted from the last check by anyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitchenPush, kitchenReminderFor } from './kitchenReminders.js';

test('weekly: due seven days after the last check, and once more two days after that', () => {
  const check = { everyDays: 7, lastAt: new Date('2026-10-01T18:00:00Z'), since: new Date('2026-09-01T10:00:00Z') };
  assert.equal(kitchenReminderFor(check, '2026-10-07'), null);
  assert.equal(kitchenReminderFor(check, '2026-10-08'), 'due');
  assert.equal(kitchenReminderFor(check, '2026-10-09'), null);
  assert.equal(kitchenReminderFor(check, '2026-10-10'), 'late');
  assert.equal(kitchenReminderFor(check, '2026-10-11'), null);
});

test('a check by either of you starts the count again, so the other is not reminded', () => {
  const check = { everyDays: 7, lastAt: new Date('2026-10-07T09:00:00Z') };
  assert.equal(kitchenReminderFor(check, '2026-10-08'), null);
  assert.equal(kitchenReminderFor(check, '2026-10-14'), 'due');
});

test('before the first check it counts from when the reminder was set; off means never', () => {
  assert.equal(kitchenReminderFor({ everyDays: 3, since: new Date('2026-10-01T08:00:00Z') }, '2026-10-04'), 'due');
  assert.equal(kitchenReminderFor({ everyDays: null, lastAt: new Date('2026-10-01T08:00:00Z') }, '2026-10-08'), null);
  assert.equal(kitchenReminderFor(null, '2026-10-08'), null);
});

test('the notification opens the check, in the reader\'s language', () => {
  assert.deepEqual(kitchenPush('w1', 'due', 'en'), {
    title: 'Time for the kitchen check',
    body: 'Say how much is left of each thing. Once one of you does it, it is done for everyone.',
    url: '/Groceries?view=check',
    tag: 'kitchen-w1',
  });
  assert.equal(kitchenPush('w1', 'late', 'he').title, 'בדיקת המטבח עדיין מחכה');
});
