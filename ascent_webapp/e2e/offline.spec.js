// Offline: the installed app opens without a connection, takes an expense, and sends it once back online.
import { test, expect } from '@playwright/test';
import { openApp, serverTransactions, signUpViaApi } from './helpers.js';

test('an expense added offline reaches the server when the connection returns', async ({ page, context }) => {
  await signUpViaApi(page);
  await openApp(page, '/Expenses');
  // The service worker has the whole app before the connection goes
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add expense' }).first().click();
  await page.getByLabel('Amount').fill('42.5');
  await page.getByLabel(/Description/).fill('Offline coffee');
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await expect(page.getByText('Offline coffee').first()).toBeVisible();

  // Still offline, the app opens again from the device with the expense waiting
  await page.reload();
  await expect(page.getByText('Offline coffee').first()).toBeVisible();
  expect(await serverTransactions(page).catch(() => [])).toEqual([]);

  await context.setOffline(false);
  await expect.poll(async () => (await serverTransactions(page)).map((t) => [t.description, t.amount]), { timeout: 30_000 })
    .toEqual([['Offline coffee', 42.5]]);
});
