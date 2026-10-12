// The sidebar on a computer: every page is one click away, in the sidebar or in its section's tabs.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

// [translation key of the sidebar entry, its first page, [translation key of a tab, path]...]
const SECTIONS = [
  ['transactions', 'Expenses', [['income', 'Income'], ['expenses', 'Expenses']]],
  ['navPlanning', 'Plans', [['cmNavShort', 'Commitments'], ['svTitle', 'Savings'], ['plans', 'Plans']]],
  ['notes', 'Notes', []],
  ['grTitle', 'Groceries', []],
  ['tkNav', 'Tasks', []],
  ['dashboard', 'Dashboard', [['rvNav', 'Review'], ['dashboard', 'Dashboard']]],
];

test('every page opens from the sidebar or its section tabs @smoke @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const nav = page.getByRole('navigation', { name: L('mainNavigation') });
  const tabs = page.getByRole('navigation', { name: L('navSectionPages') });
  for (const [key, first, pages] of SECTIONS) {
    const entry = nav.getByRole('link', { name: L(key), exact: true });
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/${first}$`));
    await waitForPageReady(page);
    await expect(page.locator('main h1').first()).toBeVisible();
    for (const [tab, path] of pages) {
      await tabs.getByRole('link', { name: L(tab), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${path}$`));
      await waitForPageReady(page);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(tabs.getByRole('link', { name: L(tab), exact: true })).toHaveAttribute('aria-current', 'page');
      // The section's entry in the sidebar stays the current one on each of its pages
      await expect(entry).toHaveAttribute('aria-current', 'page');
    }
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
