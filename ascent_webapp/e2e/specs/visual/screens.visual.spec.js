// Visual regression (§4.4): key screens compared with approved screenshots, so an unintended change to the design
// (a token, spacing, a broken layout in one language) shows up as a diff. Everything that could vary is fixed: the
// date and time zone, the data, the account's name, fonts (bundled), animation (off) and motion (reduced).
//
// The approved screenshots are made on Linux in CI (e2e/screenshots/), since text renders differently on each
// system; locally these run only with E2E_VISUAL=1. After an intended change: Actions › Check › Run workflow with
// "update screenshots", then commit the screenshots it uploads (TEST_PLAN.md §4.4).
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { waitForPageReady } from '../../support/layout.js';
import { L } from '../../support/i18n.js';

test.skip(process.platform !== 'linux' && !process.env.E2E_VISUAL, 'approved screenshots are made on Linux, in CI');

// Mid-June 2026, mid-morning
const NOW = new Date('2026-06-17T09:30:00Z');
const june = (d) => `2026-06-${String(d).padStart(2, '0')}`;
const may = (d) => `2026-05-${String(d).padStart(2, '0')}`;

test.use({ timezoneId: 'UTC', locale: 'en-US', ownerAccount: { emailVerified: true } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** A household's June so far, and May for the comparisons */
async function aMonthOfMoney(api) {
  const rows = [
    { type: 'Income', amount: 9800, category: 'freelance', description: 'Design retainer', date: june(3) },
    { type: 'Expense', amount: 4200, category: 'rent_housing', description: 'Rent', date: june(2) },
    { type: 'Expense', amount: 612.4, category: 'groceries', description: 'Weekly shop', date: june(5) },
    { type: 'Expense', amount: 86, category: 'food_dining', description: 'Dinner with friends', date: june(9) },
    { type: 'Expense', amount: 54.9, category: 'transportation', description: 'Train tickets', date: june(12) },
    { type: 'Expense', amount: 310, category: 'utilities', description: 'Electricity', date: june(14) },
    { type: 'Expense', amount: 18.5, category: 'food_dining', description: 'Coffee', date: june(16) },
    { type: 'Income', amount: 9800, category: 'freelance', description: 'Design retainer', date: may(3) },
    { type: 'Expense', amount: 4200, category: 'rent_housing', description: 'Rent', date: may(2) },
    { type: 'Expense', amount: 1340, category: 'groceries', description: 'Groceries', date: may(15) },
  ];
  for (const row of rows) await api.create('transactions', { currency: 'USD', ...row });
  await api.create('budgets', { category: 'groceries', monthlyLimit: 1200, currency: 'USD', period: 'monthly', year: 2026, month: 6, alertThreshold: 80 });
}

// What changes every run: the account's address (each test has a new account) and any toast
const varying = (page, owner) => [page.locator('[data-sonner-toaster]'), ...(owner ? [page.getByText(owner.email)] : [])];

test('sign-in @visual', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#summit-email')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('sign-in.png', { mask: varying(page) });
});

test('sign-in in Hebrew @visual', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('ascent_login_lang', 'he'); } catch { /* storage unavailable */ } });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#summit-email')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('sign-in-he.png', { mask: varying(page) });
});

test('Dashboard @visual', async ({ page, api, owner }) => {
  await aMonthOfMoney(api);
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page).toHaveScreenshot('dashboard.png', { mask: varying(page, owner) });
});

test.describe('light', () => {
  test.use({ ownerAccount: { emailVerified: true, theme: 'light' } });

  test('Dashboard in the light theme @visual', async ({ page, api, owner }) => {
    await aMonthOfMoney(api);
    await openApp(page, '/Dashboard');
    await waitForPageReady(page, { timeout: 20_000 });
    await expect(page).toHaveScreenshot('dashboard-light.png', { mask: varying(page, owner) });
  });
});

test('Expenses, and adding one @visual', async ({ page, api, owner }) => {
  await aMonthOfMoney(api);
  await openApp(page, '/Expenses');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page.getByText('Weekly shop')).toBeVisible();
  await expect(page).toHaveScreenshot('expenses.png', { mask: varying(page, owner) });

  await page.getByRole('button', { name: L('addExpense') }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { checked: true }).first()).toBeVisible();
  await expect(dialog).toHaveScreenshot('add-expense.png');
});

test('Settings @visual', async ({ page, owner }) => {
  await openApp(page, '/Settings');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page).toHaveScreenshot('settings.png', { mask: varying(page, owner) });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('Dashboard on a phone @visual', async ({ page, api, owner }) => {
    await aMonthOfMoney(api);
    await openApp(page, '/Dashboard');
    await waitForPageReady(page, { timeout: 20_000 });
    await expect(page).toHaveScreenshot('dashboard-phone.png', { mask: varying(page, owner) });
  });
});
