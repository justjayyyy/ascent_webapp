// Expenses and income: adding, changing and removing them, and a big purchase paid in installments.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

test('add an expense: it shows under today and the server has it @smoke @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 42.5, description: 'Lunch with Max', category: L('foodDining') });

  await expect(page.getByRole('region', { name: L('today') }).getByText('Lunch with Max')).toBeVisible();
  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.type, t.description, t.amount, t.category]))
    .toEqual([['Expense', 'Lunch with Max', 42.5, 'food_dining']]);
});

test('add income from the Income page @critical', async ({ page, api }) => {
  await openApp(page, '/Income');
  const income = new ExpensesScreen(page);
  // Not Salary: in the first days of a month the app books salary to the month before
  await income.addExpense({ kind: 'income', amount: 9000, description: 'October salary', category: 'Freelance' });

  await expect(income.row('October salary')).toBeVisible();
  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.type, t.description, t.amount]))
    .toEqual([['Income', 'October salary', 9000]]);
});

test('edit an expense: the new amount is on screen and on the server @critical', async ({ page, api }) => {
  const row = await api.create('transactions', expense({ description: 'Taxi home', amount: 30 }));
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.edit('Taxi home', { amount: 45 });

  await expect.poll(async () => (await api.list('transactions')).find((t) => t.id === row.id)?.amount).toBe(45);
  await expect(page.getByRole('button', { name: /Taxi home/ }).first()).toContainText('45');
});

test('delete an expense: it leaves the list and the server @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Wrong entry' }));
  await api.create('transactions', expense({ description: 'Keep me' }));
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.delete('Wrong entry');

  await expect(page.getByRole('button', { name: /Wrong entry/ })).toHaveCount(0);
  await expect(expenses.row('Keep me')).toBeVisible();
  await expect.poll(async () => (await api.list('transactions')).map((t) => t.description)).toEqual(['Keep me']);
});

test('what you are typing survives a change someone else makes meanwhile @critical @multiuser', async ({ page, member }) => {
  const partner = await member('editor');
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.openAdd();
  await expenses.amount.fill('77');
  await expenses.description.fill('Half-typed expense');

  // The partner adds a category; within a few seconds the open app refetches its lists (the workspace pulse)
  // and the new category is offered in the dialog
  const refetched = page.waitForResponse((r) => r.url().includes('/api/entities/categories') && r.request().method() === 'GET', { timeout: 20_000 });
  await partner.api.create('categories', { name: 'Gifts for Max', type: 'Expense' });
  await refetched;
  await expect(expenses.dialog.getByRole('radio', { name: 'Gifts for Max' })).toBeVisible();

  await expect(expenses.amount).toHaveValue('77');
  await expect(expenses.description).toHaveValue('Half-typed expense');
});

test('an amount that is missing, zero or negative is refused before saving @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.openAdd();
  const add = page.getByRole('button', { name: L('addTransaction'), exact: true });

  for (const value of ['', '0', '-5']) {
    await expenses.amount.fill(value);
    await add.click();
    await expect(page.getByText(L('amountGreaterThanZero'))).toBeVisible();
  }
  await expect(expenses.dialog).toBeVisible();
  expect(await api.list('transactions')).toEqual([]);
});

test('a big purchase in 10 payments: ten monthly rows that add up to the price @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.addInstallments({ amount: 3000, description: 'New sofa', payments: 10 });

  await expect.poll(async () => (await api.list('transactions')).length).toBe(10);
  const rows = (await api.list('transactions')).sort((a, b) => a.installmentIndex - b.installmentIndex);
  expect(rows.map((r) => r.installmentIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(rows.every((r) => r.installmentCount === 10 && r.isBigPurchase && r.description === 'New sofa')).toBe(true);
  expect(Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100).toBe(3000);
  // One a month, from this month on
  expect(new Set(rows.map((r) => r.date.slice(0, 7))).size).toBe(10);

  await expect(page.getByLabel(L('installmentOf', { index: 1, count: 10 })).first()).toBeVisible();
  await expect(page.getByText(L('bigPurchases')).first()).toBeVisible();
});
