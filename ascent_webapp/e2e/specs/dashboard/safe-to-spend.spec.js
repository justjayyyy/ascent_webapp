// The Dashboard's main figure: what is safe to spend for the rest of the month.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense, income, today } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

test('safe to spend is this month’s income, less what was spent and what is still to come @smoke @critical', async ({ page, api }) => {
  const month = today().slice(0, 7);
  await api.create('transactions', income({ amount: 5000, date: today(), category: 'freelance', description: 'Design job' }));
  await api.create('transactions', expense({ amount: 1200, date: today(), description: 'Rent share' }));
  // Still to come this month, when there is a day left in it
  const later = day(1).startsWith(month) ? 300 : 0;
  if (later) await api.create('transactions', expense({ amount: 300, date: day(1), description: 'Phone bill' }));

  await openApp(page, '/Dashboard');
  const left = 5000 - 1200 - later;
  const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const bar = page.getByLabel(new RegExp(`^${L('stsSpent')} ${money(1200).replace('$', '\\$')}`));
  await expect(bar).toHaveAttribute('aria-label', `${L('stsSpent')} ${money(1200)}, ${L('stsCommitted')} ${money(later)}, ${L('stsLeft')} ${money(left)}`);
});

test('with no income and no budgets, it asks for one instead of showing a number @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ amount: 80 }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('stsNoBase'))).toBeVisible();
});

test('salary paid on the 1st for the month before: the month under way counts on its expected income @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-10-04T10:00:00'));
  // Each month's salary booked to the month it was for; nothing of October's own yet
  for (const date of ['2026-07-31', '2026-08-31', '2026-09-30']) {
    await api.create('transactions', income({ amount: 12000, date, category: 'salary', description: 'Salary' }));
  }
  await api.create('transactions', expense({ amount: 1500, date: '2026-10-02', description: 'Groceries' }));

  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('stsBasedOnExpected', { amount: '$12,000' }))).toBeVisible();
  await expect(page.getByRole('img', { name: `${L('stsSpent')} $1,500, ${L('stsCommitted')} $0, ${L('stsLeft')} $10,500` })).toBeVisible();
  await expect(page.getByText(L('expectedIncome'), { exact: true })).toBeVisible();

  await openApp(page, '/Expenses');
  await expect(page.getByText(L('expectedThisMonth', { amount: '$12,000' }), { exact: false })).toBeVisible();
});
