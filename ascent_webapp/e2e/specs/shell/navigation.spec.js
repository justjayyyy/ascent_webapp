// The sidebar on a computer: every page is one click away.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

// [translation key of the sidebar item, path]
const PAGES = [
  ['rvNav', 'Review'], ['expenses', 'Expenses'], ['income', 'Income'], ['plans', 'Plans'], ['cmNavShort', 'Commitments'],
  ['svTitle', 'Savings'], ['notes', 'Notes'], ['grTitle', 'Groceries'], ['tkNav', 'Tasks'], ['dashboard', 'Dashboard'],
];

test('every page opens from the sidebar @smoke @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const nav = page.getByRole('navigation', { name: L('mainNavigation') });
  for (const [key, path] of PAGES) {
    await nav.getByRole('link', { name: L(key), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await waitForPageReady(page);
    await expect(page.locator('main h1').first()).toBeVisible();
  }
});

test('an address that is not a page says so and leads back @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/NoSuchPage');
  await expect(page.getByText(L('notFoundTitle'))).toBeVisible();
  await page.getByRole('link', { name: L('notFoundHome') }).or(page.getByRole('button', { name: L('notFoundHome') })).first().click();
  // The app's home, which is the Dashboard
  await expect(page).toHaveURL(/\/(Dashboard)?$/);
  await expect(page.getByRole('heading', { name: L('dashboard'), level: 1 })).toBeVisible();
});
