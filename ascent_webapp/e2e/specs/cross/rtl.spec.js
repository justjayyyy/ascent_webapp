// Hebrew is a first-class layout (PRODUCT.md): the app reads right to left, the sidebar sits on the right, amounts
// still read left to right inside it, and a whole task can be done in Hebrew.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

test.beforeEach(async ({ page, owner: _owner }) => {
  await page.request.put('/api/auth/me', { data: { language: 'he' } });
});

test('in Hebrew the app is mirrored: right to left, sidebar on the right @critical', async ({ page }) => {
  await openApp(page, '/Dashboard');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: L('dashboard', {}, 'he'), level: 1 })).toBeVisible();
  const nav = await page.getByRole('navigation', { name: L('mainNavigation', {}, 'he') }).first().boundingBox();
  const main = await page.locator('main').boundingBox();
  expect(nav.x, 'the sidebar is to the right of the page').toBeGreaterThan(main.x);
});

test('adding an expense in Hebrew, with a Hebrew description; the amount reads left to right @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page, { language: 'he' });
  await expenses.addExpense({ amount: 64.9, description: 'סופר-פארם' });

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.description, t.amount])).toEqual([['סופר-פארם', 64.9]]);
  const row = page.getByRole('button', { name: /סופר-פארם/ }).first();
  await expect(row).toBeVisible();
  // Numbers keep their own direction inside the Hebrew text
  await expect(row.locator('[dir="ltr"]').filter({ hasText: '64' }).first()).toBeVisible();
});

test('categories and months show in Hebrew, not in English @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Groceries run', category: 'groceries', amount: 120 }));
  await openApp(page, '/Expenses');
  await expect(page.getByRole('heading', { name: L('expenses', {}, 'he'), level: 1 })).toBeVisible();
  // The default category's name (src/lib/translations.js) and the month picker (PeriodSelector's month keys)
  await expect(page.getByText('מכולת').first()).toBeVisible();
  const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  await expect(page.getByText(L(MONTH_KEYS[new Date().getMonth()], {}, 'he'), { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Groceries', { exact: true })).toHaveCount(0);
});
