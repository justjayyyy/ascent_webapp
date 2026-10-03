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

test('saving before the categories have loaded asks for one, and the message goes once one is chosen @critical', async ({ page, owner: _owner }) => {
  // A new account's first load, slow: the categories arrive after the dialog is open
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(/\/api\/entities\/categories/, async (route) => { await held; await route.continue(); });
  await openApp(page, '/Expenses');
  await page.getByRole('button', { name: L('addExpense') }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(new RegExp(`^${L('amount')}`)).fill('12');
  await dialog.getByRole('button', { name: L('addTransaction') }).click();
  await expect(dialog.getByText(L('selectCategory'))).toBeVisible();

  release();
  await expect(dialog.getByRole('radio', { checked: true })).toBeVisible();
  await expect(dialog.getByText(L('selectCategory'))).toBeHidden();
});

test('a category needs a name, and one that already exists is refused, also by its translated name and from another phone @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  await page.getByRole('button', { name: L('categories'), exact: true }).click();
  const manager = page.getByRole('dialog');
  const name = manager.getByLabel(new RegExp(`^${L('categoryName')}`));
  const add = manager.getByRole('button', { name: L('addCategory') });
  const count = async () => (await api.list('categories')).length;
  const before = await count();

  // No name, no adding
  await name.fill('   ');
  await expect(add).toBeDisabled();

  // A default category is stored by key and shown translated: typing what is shown is the same category
  for (const typed of [L('foodDining'), L('foodDining').toLowerCase()]) {
    await name.fill(typed);
    await add.click();
    await expect(manager.getByText(L('categoryExists'))).toBeVisible();
  }
  expect(await count()).toBe(before);

  // The server refuses a second one with the same name, whatever the case (two phones adding it at once)
  expect((await api.send('POST', '/entities/categories', { name: 'Dog food', type: 'Expense' })).status()).toBe(201);
  expect((await api.send('POST', '/entities/categories', { name: 'dog FOOD', type: 'Expense' })).status()).toBe(409);
  expect(await count()).toBe(before + 1);
});
