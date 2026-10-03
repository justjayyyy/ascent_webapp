// Closing, reopening and deleting things that money was recorded against (LN-H06, H07, PL-H05), with the expenses
// left in place; and smaller views: an open-ended goal (SV-H05), the review of a month still running (RV-H03),
// no-spend days switched on (ACC-H06) and default categories in Hebrew (CAT-H03).
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

const more = (page) => page.getByRole('button', { name: L('ntMore') }).first();

test('a loan marked paid off can be reopened; deleted, its recorded expenses stay @critical', async ({ page, api }) => {
  const loan = await api.create('commitments', { name: 'Car loan', kind: 'car', direction: 'borrowed', currency: 'USD', principal: 6000, annualRate: 0, payment: 500, firstPaymentDate: day(-40), category: 'transportation' });
  await api.create('transactions', expense({ description: 'Car loan', amount: 500, category: 'transportation', commitmentId: loan.id, date: day(-10) }));
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: /Car loan/ }).first().click();

  await more(page).click();
  await page.getByRole('menuitem', { name: L('cmMarkPaidOff') }).click();
  await expect(page.getByText(L('cmPaidOffCongrats')).first()).toBeVisible();
  await expect.poll(async () => (await api.list('commitments'))[0].status).toBe('closed');
  await more(page).click();
  await page.getByRole('menuitem', { name: L('cmReopen') }).click();
  await expect.poll(async () => (await api.list('commitments'))[0].status).toBe('active');

  await more(page).click();
  await page.getByRole('menuitem', { name: L('delete') }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: L('delete'), exact: true }).click();
  await expect.poll(async () => (await api.list('commitments')).length).toBe(0);
  expect((await api.list('transactions')).map((t) => t.amount)).toEqual([500]);
});

test('a plan marked done can be reopened; deleted, its recorded expenses stay @critical', async ({ page, api }) => {
  const plan = await api.create('plans', { name: 'Summer trip', kind: 'vacation', currency: 'USD', startDate: day(30), items: [{ id: 'f', name: 'Flights', amount: 900, status: 'paid' }] });
  await api.create('transactions', expense({ description: 'Flights', amount: 900, planId: plan.id, planItemId: 'f', date: day(-5) }));
  await openApp(page, '/Plans');
  await page.getByRole('button', { name: /Summer trip/ }).first().click();

  await more(page).click();
  await page.getByRole('menuitem', { name: L('markPlanDone') }).click();
  await expect.poll(async () => (await api.list('plans'))[0].status).toBe('done');
  await more(page).click();
  await page.getByRole('menuitem', { name: L('reopenPlan') }).click();
  await expect.poll(async () => (await api.list('plans'))[0].status).toBe('active');

  await more(page).click();
  await page.getByRole('menuitem', { name: L('deletePlan') }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: L('delete'), exact: true }).click();
  await expect.poll(async () => (await api.list('plans')).length).toBe(0);
  expect((await api.list('transactions')).map((t) => t.amount)).toEqual([900]);
});

test('a goal with no target says so, and what has gone into it lately @critical', async ({ page, api }) => {
  await api.create('goals', { name: 'Rainy day', kind: 'emergency', currency: 'USD', entries: [{ id: 'a', date: day(-40), amount: 300 }, { id: 'b', date: day(-10), amount: 300 }] });
  await openApp(page, '/Savings');
  await page.getByRole('button', { name: /Rainy day/ }).first().click();
  await expect(page.getByText(L('svNoTarget')).first()).toBeVisible();
  await expect(page.getByText(new RegExp(L('svOutlookOpen', { amount: '§' }).replace('§', '.+'))).first()).toBeVisible();
});

test('the review of a month still running compares the same days, so far @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ amount: 40, date: day(0) }));
  const month = new Date().toISOString().slice(0, 7);
  await openApp(page, `/Review?month=${month}`);
  await expect(page.getByText(new RegExp(L('rvRunningNote', { day: '\\d+' })))).toBeVisible();
});

test('no-spend days switched on show on the Dashboard @critical', async ({ page, api }) => {
  await api.call('PUT', '/auth/me', { noSpendTracking: true });
  await openApp(page, '/Dashboard');
  await expect(page.getByRole('heading', { name: L('nsTitle') }).or(page.getByText(L('nsTitle'))).first()).toBeVisible();
  await expect(page.getByText(L('nsInARow')).first()).toBeVisible();
});

test.describe('in Hebrew', () => {
  test.use({ ownerAccount: { language: 'he' } });

  test('a new household’s default categories are in Hebrew @critical', async ({ page, owner: _owner }) => {
    await openApp(page, '/Expenses');
    await page.getByRole('button', { name: L('addExpense', {}, 'he') }).first().click();
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'אוכל ומסעדות' })).toBeVisible();
  });
});
