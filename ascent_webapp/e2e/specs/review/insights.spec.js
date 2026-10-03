// What the review and the plans notice (RV-H04, PL-H07, PL-E02, PL-N03, LN-H08): a place new this month, who paid,
// plan costs on Expenses and the Dashboard, an overdue cost, a paid cost that stays paid, and purchases in parts.
import { format, startOfMonth, subMonths } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

const monthDay = (monthsBack, d) => format(new Date(startOfMonth(subMonths(new Date(), monthsBack)).setDate(d)), 'yyyy-MM-dd');
const monthKey = (monthsBack) => format(subMonths(new Date(), monthsBack), 'yyyy-MM');

test('the review marks a place first seen this month, and says who paid what @critical @multiuser', async ({ page, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  await api.create('transactions', expense({ description: 'Shufersal', amount: 300, date: monthDay(2, 5) }));
  await api.create('transactions', expense({ description: 'Shufersal', amount: 320, date: monthDay(1, 5) }));
  await sam.api.create('transactions', expense({ description: 'Corner Bakery', amount: 45, date: monthDay(1, 9) }));
  await openApp(page, `/Review?month=${monthKey(1)}`);
  await waitForPageReady(page, { timeout: 30_000 });

  // One new place (the bakery; the supermarket was there the month before), marked in the list
  await expect(page.getByText(L('rvNewPlaces', { n: 1 }))).toBeVisible();
  await expect(page.getByText(L('rvNew'), { exact: true })).toHaveCount(1);
  await expect(page.getByText(L('rvWhoPaid'))).toBeVisible();
  await expect(page.getByText('Sam Partner').first()).toBeVisible();
  await expect(page.getByText('Dana Owner').last()).toBeVisible();
});

test('a plan cost due this month shows on Expenses and in the Dashboard’s still to pay; a late one says overdue @critical', async ({ page, api }) => {
  await api.create('plans', { name: 'Summer trip', kind: 'vacation', currency: 'USD', startDate: day(60), items: [
    { id: 'hotel', name: 'Hotel deposit', amount: 400, dueDate: day(3) },
    { id: 'visa', name: 'Visa fee', amount: 60, dueDate: day(-4) },
  ] });
  await openApp(page, '/Expenses');
  await waitForPageReady(page, { timeout: 30_000 });
  await expect(page.getByText(L('comingUpFromPlans'))).toBeVisible();
  await expect(page.getByText('Hotel deposit').first()).toBeVisible();

  await openApp(page, '/Plans');
  await page.getByRole('button', { name: /Summer trip/ }).first().click();
  const costs = page.getByRole('region', { name: L('planCosts') });
  await expect(costs.locator('li').filter({ hasText: 'Visa fee' }).getByText(new RegExp(L('overdue'), 'i')).first()).toBeVisible();
});

test('a cost paid with a recorded expense stays paid: the cost says to delete that expense to reopen it @critical', async ({ page, api }) => {
  const plan = await api.create('plans', { name: 'Wedding', kind: 'wedding', currency: 'USD', startDate: day(90), items: [{ id: 'venue', name: 'Venue', amount: 5000, status: 'paid' }] });
  const tx = await api.create('transactions', expense({ description: 'Venue', amount: 5000, planId: plan.id, planItemId: 'venue' }));
  await api.update('plans', plan.id, { items: [{ id: 'venue', name: 'Venue', amount: 5000, status: 'paid', transactionId: tx.id }] });
  await openApp(page, '/Plans');
  await page.getByRole('button', { name: /Wedding/ }).first().click();
  await page.getByRole('region', { name: L('planCosts') }).getByRole('button', { name: /Venue/ }).first().click();
  await expect(page.getByRole('dialog').getByText(L('planItemPaidLocked'))).toBeVisible();
});

test('a purchase paid in parts shows on Loans with how many parts are paid @critical', async ({ page, api }) => {
  const group = 'tv-2026';
  for (let i = 1; i <= 3; i += 1) {
    await api.create('transactions', expense({
      description: 'Television', amount: 1000, category: 'shopping', isBigPurchase: true,
      installmentGroupId: group, installmentIndex: i, installmentCount: 3, installmentTotal: 3000,
      date: i === 1 ? day(-20) : day(30 * (i - 1)),
    }));
  }
  await openApp(page, '/Commitments');
  await expect(page.getByText(L('cmInstallments'))).toBeVisible();
  await expect(page.getByText(L('paymentsMade', { paid: 1, count: 3 })).first()).toBeVisible();
});
