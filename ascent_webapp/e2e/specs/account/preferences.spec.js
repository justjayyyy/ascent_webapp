// Your own account: the name others see, and the language the app speaks (right to left in Hebrew).
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L, LANGUAGE_NAMES } from '../../support/i18n.js';

const me = async (page) => (await (await page.request.get('/api/auth/me')).json()).data;

test('changing your name saves it and shows it in the app @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Settings');
  const name = page.getByLabel(L('fullName'));
  await name.fill('Dana Renamed');
  await name.press('Enter');

  await expect.poll(async () => (await me(page)).full_name).toBe('Dana Renamed');
  await page.reload();
  await expect(page.getByLabel(L('fullName'))).toHaveValue('Dana Renamed');
});

test('switching the language turns the whole app around, and it stays after a reload @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Settings');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.getByRole('radiogroup', { name: L('language') }).getByRole('radio', { name: LANGUAGE_NAMES.he }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByRole('radiogroup', { name: L('language', {}, 'he') })).toBeVisible();
  await expect.poll(async () => (await me(page)).language).toBe('he');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.getByRole('radiogroup', { name: L('language', {}, 'he') }).getByRole('radio', { name: LANGUAGE_NAMES.ru }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('radiogroup', { name: L('language', {}, 'ru') })).toBeVisible();
});
