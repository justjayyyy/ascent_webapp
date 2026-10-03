// Budgets against the month's spending (BUD-*): approaching, over, the Dashboard's pace prediction, and limits that
// are not limits. The browser's clock is fixed at 10 June 2026 so "how far into the month" is the same every run.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

const june = (d) => `2026-06-${String(d).padStart(2, '0')}`;
const budget = (category, monthlyLimit) => ({ category, monthlyLimit, currency: 'USD', period: 'monthly', year: 2026, month: 6, alertThreshold: 80 });
const anyDate = (key, vars = {}) => new RegExp(L(key, { ...vars, date: '§' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('§', '.+'));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-10T10:00:00'));
});

test('on Expenses a budget says when it is getting close, and by how much it is over @critical', async ({ page, api }) => {
  await api.create('budgets', budget('groceries', 2000));
  await api.create('transactions', expense({ amount: 1700, category: 'groceries', description: 'Big shop', date: june(4) }));
  await openApp(page, '/Expenses');
  const tracking = page.locator('section').filter({ has: page.getByRole('heading', { name: L('budgetTracking') }) });
  await expect(tracking.getByText(L('approachingLimit'))).toBeVisible();

  await api.create('transactions', expense({ amount: 400, category: 'groceries', description: 'Party food', date: june(9) }));
  await page.reload();
  await expect(tracking.getByText(`${L('overBudgetBy')} $100`)).toBeVisible();
  await expect(tracking.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '105');
});

test('the Dashboard sees a budget heading past its limit before it gets there @critical', async ({ page, api }) => {
  // 500 of 1,000 by the 10th: at that pace it passes the limit around the 20th
  await api.create('budgets', budget('food_dining', 1000));
  await api.create('transactions', expense({ amount: 500, category: 'food_dining', date: june(5) }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(anyDate('stsWillExceed'))).toBeVisible();
});

test('the Dashboard says when a budget is already over, and when every budget is on pace @critical', async ({ page, api }) => {
  await api.create('budgets', budget('food_dining', 1000));
  await api.create('budgets', budget('transportation', 600));
  await api.create('transactions', expense({ amount: 1200, category: 'food_dining', date: june(3) }));
  await api.create('transactions', expense({ amount: 50, category: 'transportation', date: june(3) }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('stsIsOver', { amount: '$200' }))).toBeVisible();
  await expect(page.getByText(L('stsOnTrack'))).toHaveCount(0);

  const [food] = (await api.list('budgets')).filter((b) => b.category === 'food_dining');
  await api.update('budgets', food.id, { monthlyLimit: 5000 });
  await page.reload();
  await expect(page.getByText(L('stsOnTrack'))).toBeVisible();
});

test('a limit of nothing, or less, is refused: by the form, and by the server @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  await page.getByRole('button', { name: L('budgets'), exact: true }).click();
  const manager = page.getByRole('dialog');
  await manager.getByRole('combobox', { name: new RegExp(`^${L('category')}`) }).click();
  await page.getByRole('option', { name: L('foodDining') }).click();
  const limit = manager.getByLabel(new RegExp(`^${L('monthlyLimit')}`));
  for (const value of ['0', '-50']) {
    await limit.fill(value);
    await manager.getByRole('button', { name: L('addBudget') }).click();
    // The field allows 0.01 and up, so the browser stops the save and says why
    expect(await limit.evaluate((el) => [el.validity.valid, el.validationMessage.length > 0])).toEqual([false, true]);
  }
  expect(await api.list('budgets')).toEqual([]);

  for (const monthlyLimit of [0, -50]) {
    expect((await api.send('POST', '/entities/budgets', budget('groceries', monthlyLimit))).status(), String(monthlyLimit)).toBe(400);
  }
  const ok = await api.create('budgets', budget('groceries', 300));
  expect((await api.send('PUT', `/entities/budgets?id=${ok.id}`, { monthlyLimit: -1 })).status()).toBe(400);
});
