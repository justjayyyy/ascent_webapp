// Apple Pay capture: a device key from Settings, a tap reported by the iPhone Shortcut, a row to review.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { identityHeaders } from '../../support/network.js';

async function addDevice(page) {
  await openApp(page, '/Settings');
  await page.getByRole('textbox', { name: L('apDeviceName') }).fill('My iPhone');
  await page.getByRole('button', { name: L('apAddDevice') }).click();
  // Shown once, to paste into the Shortcut
  const key = page.getByRole('textbox', { name: L('apKey'), exact: true });
  await expect(key).toHaveValue(/^asc_/);
  return key.inputValue();
}

test('an Apple Pay tap reported by the Shortcut arrives as an expense to review, on the open app too @smoke @critical', async ({ page, context, api, playwright, baseURL, testKey }) => {
  const key = await addDevice(page);
  const expensesTab = await context.newPage();
  await openApp(expensesTab, '/Expenses');

  // The phone: no session, just the device key
  const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 7) });
  const res = await phone.post('/api/ingest/wallet', {
    headers: { Authorization: `Bearer ${key}` },
    data: { v: 1, merchant: 'Aroma Espresso Bar', amount: '$18.50', card: 'Visa', at: new Date().toISOString() },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  await phone.dispose();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.source, t.status, t.amount, t.currency, t.merchant]))
    .toEqual([['wallet', 'pending', 18.5, 'USD', 'Aroma Espresso Bar']]);
  // The open Expenses page picks it up by itself, marked for review
  const row = expensesTab.getByRole('button', { name: /Aroma Espresso Bar/ }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(L('needsReview'));
});

test('a revoked or made-up key cannot add anything @critical', async ({ page, api, playwright, baseURL, testKey }) => {
  await addDevice(page);
  const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 7) });
  const madeUp = `asc_${'x'.repeat(43)}`;
  const res = await phone.post('/api/ingest/wallet', {
    headers: { Authorization: `Bearer ${madeUp}` },
    data: { v: 1, merchant: 'Somewhere', amount: '$5', at: new Date().toISOString() },
  });
  expect(res.status()).toBe(401);
  expect((await phone.post('/api/ingest/wallet', { data: { v: 1, merchant: 'Somewhere', amount: '$5' } })).status()).toBe(401);
  await phone.dispose();
  expect(await api.list('transactions')).toEqual([]);
});
