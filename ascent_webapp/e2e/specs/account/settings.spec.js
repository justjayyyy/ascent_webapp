// Settings that change how the whole app reads (ACC-H03, H07, N03): the currency everything is totalled in,
// finding a setting by typing, and a save the server does not take.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

const me = async (page) => (await (await page.request.get('/api/auth/me')).json()).data;
const currencies = (page) => page.getByRole('radiogroup', { name: L('defaultCurrency') });

test('switching the default currency re-totals the Dashboard in it, at the day’s rate @critical', async ({ page, api }) => {
  await api.call('PUT', '/auth/me', { currency: 'USD' });
  await api.create('transactions', expense({ amount: 100, currency: 'USD', category: 'groceries' }));
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 30_000 });
  await expect(page.getByText('$100').first()).toBeVisible({ timeout: 20_000 });

  await openApp(page, '/Settings');
  await currencies(page).getByRole('radio', { name: /ILS/ }).click();
  await expect.poll(async () => (await me(page)).currency).toBe('ILS');
  // 100 dollars at the stubbed 3.7 shekels each
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 30_000 });
  await expect(page.getByText(/₪\s?370/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('$100')).toHaveCount(0);
});

test('a setting is found by typing: "/" goes to the search, Escape clears it, and nothing found says so @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Settings');
  const search = page.getByRole('searchbox', { name: L('setSearch') });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(search).toBeFocused();

  await page.keyboard.type('passkey');
  await expect(page.getByText(L('secPasskeys')).first()).toBeVisible();
  await expect(currencies(page)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(currencies(page)).toBeVisible();

  await search.fill('zzz');
  await expect(page.getByText(L('setNoResults'))).toBeVisible();
});

test('when a setting cannot be saved, the app says so and shows what is really saved @critical', async ({ page, api }) => {
  await api.call('PUT', '/auth/me', { currency: 'USD' });
  await openApp(page, '/Settings');
  await expect(currencies(page).getByRole('radio', { name: /USD/ })).toHaveAttribute('aria-checked', 'true');

  await page.route(/\/api\/auth\/me$/, (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { success: false, error: 'Internal server error' } }) : route.continue()));
  await currencies(page).getByRole('radio', { name: /EUR/ }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: L('setUpdateFailed') })).toBeVisible();
  await expect(currencies(page).getByRole('radio', { name: /USD/ })).toHaveAttribute('aria-checked', 'true');
  expect((await me(page)).currency).toBe('USD');
});

test('a server error while the app re-checks the session in the background keeps you signed in, where you were @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Settings');
  await expect(currencies(page)).toBeVisible();
  // Saving a setting re-checks the session behind the open page; that check fails
  await page.route(/\/api\/auth\/me$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { success: false, error: 'Internal server error' } }) : route.continue()));
  const check = page.waitForResponse((res) => /\/api\/auth\/me$/.test(res.url()) && res.request().method() === 'GET');
  await currencies(page).getByRole('radio', { name: /EUR/ }).click();
  await check;
  await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 1500); }));
  await expect(page).toHaveURL(/\/Settings$/);
  await expect(currencies(page).getByRole('radio', { name: /EUR/ })).toHaveAttribute('aria-checked', 'true');
  expect((await me(page)).currency).toBe('EUR');
});
