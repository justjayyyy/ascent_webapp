// Offline: the installed app opens without a connection, takes an expense, and sends it once back online.
import { test, expect } from '@playwright/test';
import { openApp, serverList, serverTransactions, signUpViaApi } from './helpers.js';

test('an expense added offline reaches the server when the connection returns', async ({ page, context }) => {
  await signUpViaApi(page);
  await openApp(page, '/Expenses');
  // The service worker has the whole app before the connection goes
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // A new account's default categories are on the device before the connection goes
  await expect(page.getByRole('button', { name: 'Food & Dining' }).first()).toBeVisible();

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

test('a plan made offline, with a cost added to it, reaches the server when the connection returns', async ({ page, context }) => {
  await signUpViaApi(page);
  await openApp(page, '/Plans');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  // With no plans yet, the page offers a kind of plan to start from
  await page.getByRole('button', { name: 'Vacation' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Offline trip');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText('Saved on this phone').first()).toBeVisible();

  // The new plan opens at once; a cost added to it waits on the device with it
  await page.getByRole('button', { name: 'Add cost' }).click();
  await page.getByLabel('What is it?').fill('Flights');
  await page.getByLabel(/^Amount/).fill('900');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Flights').first()).toBeVisible();
  expect(await serverList(page, 'plans')).toEqual([]);

  await context.setOffline(false);
  // The vacation template's costs came with it; the one added offline is among them
  await expect.poll(async () => (await serverList(page, 'plans')).map((p) => [p.name, (p.items || []).some((i) => i.name === 'Flights' && i.amount === 900)]), { timeout: 30_000 })
    .toEqual([['Offline trip', true]]);
  // Still open, now under its real id
  await expect(page.getByText('Flights').first()).toBeVisible();
  await expect(page).not.toHaveURL(/local%3A|local:/);
});
