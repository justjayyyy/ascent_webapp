// Phone layout (iPhone 13 size, touch): every main screen fits the width, and the menu moves between them.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { offScreen, waitForPageReady } from '../../support/layout.js';
import { Shell } from '../../screens/Shell.js';

// Every page in src/pages.config.js
const PAGES = ['Dashboard', 'Review', 'Expenses', 'Income', 'Plans', 'Commitments', 'Savings', 'Notes', 'Groceries', 'Tasks', 'Settings'];

for (const name of PAGES) {
  test(`${name} fits the phone without sideways scrolling @critical`, async ({ page, owner: _owner }) => {
    await openApp(page, `/${name}`);
    await waitForPageReady(page);
    expect(await page.evaluate(offScreen), `${name} is wider than the phone`).toEqual({ page: 0, cut: [] });
  });
}

test('the menu moves between screens @smoke @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const shell = new Shell(page);
  for (const [key, path] of [['expenses', /\/Expenses/], ['notes', /\/Notes/], ['dashboard', /\/Dashboard/]]) {
    await shell.goByMenu(key);
    await expect(page).toHaveURL(path);
    await expect(shell.menuButton).toHaveAttribute('aria-expanded', 'false');
  }
});

test('the sign-in page fits the phone @critical', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  expect(await page.evaluate(offScreen)).toEqual({ page: 0, cut: [] });
});
