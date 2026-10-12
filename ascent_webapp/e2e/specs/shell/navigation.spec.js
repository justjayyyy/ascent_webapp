// The sidebar on a computer: every page is one click away, in the sidebar, its Long-term group or a page's tabs.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

// [translation key of the sidebar entry, its page, [translation key of a tab, path]...]
const ENTRIES = [
  ['transactions', 'Expenses', [['income', 'Income'], ['expenses', 'Expenses']]],
  ['notes', 'Notes', []],
  ['grTitle', 'Groceries', []],
  ['tkNav', 'Tasks', []],
  ['dashboard', 'Dashboard', []],
];
// [translation key of the page in the Long-term group, path]
const GROUP = [['plans', 'Plans'], ['cmNavShort', 'Commitments'], ['svTitle', 'Savings']];

const landsOn = async (page, path) => {
  await expect(page).toHaveURL(new RegExp(`/${path}$`));
  await waitForPageReady(page);
  await expect(page.locator('main h1').first()).toBeVisible();
};

test('every page opens from the sidebar, its group or its tabs @smoke @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const nav = page.getByRole('navigation', { name: L('mainNavigation') });
  const tabs = page.getByRole('navigation', { name: L('navSectionPages') });
  for (const [key, path, pages] of ENTRIES) {
    const entry = nav.getByRole('link', { name: L(key), exact: true });
    await entry.click();
    await landsOn(page, path);
    for (const [tab, tabPath] of pages) {
      await tabs.getByRole('link', { name: L(tab), exact: true }).click();
      await landsOn(page, tabPath);
      await expect(tabs.getByRole('link', { name: L(tab), exact: true })).toHaveAttribute('aria-current', 'page');
      // The section's entry in the sidebar stays the current one on each of its pages
      await expect(entry).toHaveAttribute('aria-current', 'page');
    }
  }

  // Plans, Loans and Savings: a group that opens in place and stays open
  const group = nav.getByRole('button', { name: L('navLongTerm') });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  for (const [key, path] of GROUP) {
    await nav.getByRole('link', { name: L(key), exact: true }).click();
    await landsOn(page, path);
    await expect(nav.getByRole('link', { name: L(key), exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
});

test('the monthly review opens from its card on the Dashboard, and leads back @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const main = page.locator('main');
  await main.getByRole('link', { name: L('rvOpen') }).click();
  await expect(page).toHaveURL(/\/Review\?month=\d{4}-\d{2}$/);
  await expect(page.getByRole('heading', { name: L('rvTitle'), level: 1 })).toBeVisible();
  // The Dashboard stays the current entry in the sidebar
  await expect(page.getByRole('navigation', { name: L('mainNavigation') }).getByRole('link', { name: L('dashboard'), exact: true })).toHaveAttribute('aria-current', 'page');
  await main.getByRole('link', { name: L('dashboard'), exact: true }).click();
  await expect(page).toHaveURL(/\/Dashboard$/);
});

test('an address that is not a page says so and leads back @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/NoSuchPage');
  await expect(page.getByText(L('notFoundTitle'))).toBeVisible();
  await page.getByRole('link', { name: L('notFoundHome') }).or(page.getByRole('button', { name: L('notFoundHome') })).first().click();
  // The app's home, which is the Dashboard
  await expect(page).toHaveURL(/\/(Dashboard)?$/);
  await expect(page.getByRole('heading', { name: L('dashboard'), level: 1 })).toBeVisible();
});
