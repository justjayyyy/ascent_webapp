import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsISO, annuityPayment, buildSchedule, commitmentStatus, simulateExtra, duesBetween,
  commitmentsSummary, balanceByMonth,
} from './commitments.js';

const loan = (extra = {}) => ({
  principal: 12000, annualRate: 6, termMonths: 12, firstPaymentDate: '2026-01-10', currency: 'ILS', ...extra,
});

test('addMonthsISO keeps the day and clamps to month end', () => {
  assert.equal(addMonthsISO('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsISO('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonthsISO('2026-03-10', 0), '2026-03-10');
});

test('annuity payment matches the standard formula and handles zero interest', () => {
  assert.equal(annuityPayment(12000, 6, 12), 1032.8);
  assert.equal(annuityPayment(12000, 0, 12), 1000);
  assert.equal(annuityPayment(0, 5, 12), 0);
});

test('schedule clears the balance in its term, interest first', () => {
  const rows = buildSchedule(loan());
  assert.equal(rows.length, 12);
  assert.equal(rows[0].interest, 60);
  assert.equal(rows[11].balance, 0);
  assert.equal(rows[11].date, '2026-12-10');
  const principal = rows.reduce((s, r) => s + r.principal, 0);
  assert.ok(Math.abs(principal - 12000) < 0.05);
});

test('status counts payments due on or before today as made', () => {
  const s = commitmentStatus(loan(), '2026-03-10');
  assert.equal(s.mode, 'scheduled');
  assert.equal(s.paymentsMade, 3);
  assert.equal(s.paymentsLeft, 9);
  assert.equal(s.next.date, '2026-04-10');
  assert.equal(s.payoffDate, '2026-12-10');
  assert.ok(s.balance > 9000 && s.balance < 9100);
  assert.ok(s.progress > 0.24 && s.progress < 0.26);
});

test('before the first payment nothing is paid yet', () => {
  const s = commitmentStatus(loan(), '2025-12-01');
  assert.equal(s.balance, 12000);
  assert.equal(s.next.date, '2026-01-10');
});

test('an extra payment shortens the loan and counts today', () => {
  const c = loan({ payments: [{ id: 'x', date: '2026-03-20', amount: 3000 }] });
  const s = commitmentStatus(c, '2026-03-25');
  const plain = commitmentStatus(loan(), '2026-03-25');
  assert.ok(Math.abs(plain.balance - s.balance - 3000) < 0.01);
  assert.ok(s.payoffDate < plain.payoffDate);
});

test('flexible commitments subtract recorded repayments', () => {
  const c = { principal: 5000, direction: 'lent', payments: [{ date: '2026-02-01', amount: 1000 }, { date: '2026-09-01', amount: 500 }] };
  const s = commitmentStatus(c, '2026-05-01');
  assert.equal(s.mode, 'flexible');
  assert.equal(s.balance, 4000);
  assert.equal(s.progress, 0.2);
  assert.equal(commitmentStatus(c, '2026-10-01').balance, 3500);
});

test('a payment smaller than the interest never ends and is flagged', () => {
  const s = commitmentStatus({ principal: 100000, annualRate: 12, payment: 500, firstPaymentDate: '2026-01-01' }, '2026-02-01');
  assert.equal(s.neverEnds, true);
  assert.equal(s.payoffDate, null);
});

test('paying more each month finishes sooner and saves interest', () => {
  const c = { principal: 100000, annualRate: 5, termMonths: 120, firstPaymentDate: '2026-01-05' };
  const sim = simulateExtra(c, 500, '2026-06-01');
  assert.ok(sim.monthsSooner >= 20, `sooner by ${sim.monthsSooner}`);
  assert.ok(sim.interestSaved > 2000);
  assert.equal(simulateExtra(c, 0, '2026-06-01').monthsSooner, 0);
});

test('dues between two dates follow the schedule and skip closed ones', () => {
  assert.deepEqual(duesBetween(loan(), '2026-04-01', '2026-04-30').map((d) => d.date), ['2026-04-10']);
  assert.equal(duesBetween(loan({ status: 'closed' }), '2026-04-01', '2026-04-30').length, 0);
});

test('balance by month starts at today and ends at zero', () => {
  const months = balanceByMonth(loan(), '2026-03', '2026-03-15');
  assert.equal(months[0].key, '2026-03');
  assert.equal(months[months.length - 1].balance, 0);
  assert.equal(months[months.length - 1].key, '2026-12');
});

test('summary adds up what is owed, apart from money lent', () => {
  const list = [
    loan({ id: 'a' }),
    loan({ id: 'b', principal: 6000, currency: 'USD' }),
    { id: 'c', principal: 2000, direction: 'lent' },
    loan({ id: 'd', status: 'closed' }),
  ];
  const toILS = (v, cur) => (cur === 'USD' ? v * 4 : v);
  const sum = commitmentsSummary(list, '2025-12-01', toILS);
  assert.equal(sum.count, 2);
  assert.equal(sum.balance, 12000 + 24000);
  assert.equal(sum.lentBalance, 2000);
  assert.equal(sum.debtFreeDate, '2026-12-10');
  assert.equal(sum.next.date, '2026-01-10');
});
