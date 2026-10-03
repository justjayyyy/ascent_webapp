// Your own categories, and monthly budgets that the Dashboard measures spending against.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

test('a category you add can be picked for an expense @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  await page.getByRole('button', { name: L('categories'), exact: true }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel(new RegExp(`^${L('categoryName')}`)).fill('Dog food');
  await manager.getByRole('button', { name: L('addCategory') }).click();
  await expect(page.getByText(L('categoryCreatedSuccessfully'))).toBeVisible();
  await page.keyboard.press('Escape');

  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 60, description: 'Kibble', category: 'Dog food' });
  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.description, t.category]))
    .toEqual([['Kibble', 'Dog food']]);
});

test('a budget set on Expenses is measured on the Dashboard @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  await page.getByRole('button', { name: L('budgets'), exact: true }).click();
  const manager = page.getByRole('dialog');
  await manager.getByRole('combobox', { name: new RegExp(`^${L('category')}`) }).click();
  await page.getByRole('option', { name: L('foodDining') }).click();
  await manager.getByLabel(new RegExp(`^${L('monthlyLimit')}`)).fill('1000');
  await manager.getByRole('button', { name: L('addBudget') }).click();
  await expect.poll(async () => (await api.list('budgets')).map((b) => [b.category, b.monthlyLimit])).toEqual([['food_dining', 1000]]);

  await api.create('transactions', expense({ amount: 250, category: 'food_dining' }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('stsSpentOf', { spent: '$250', limit: '$1,000' }))).toBeVisible();
});
