// A receipt into Groceries without a shopping trip: scanned on the Groceries page, or added from a supermarket
// payment. What was on the list comes off it, new products become items, every one with its price.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { expense } from '../../support/factories.js';

// A real image (1×1 PNG): the app draws the photo onto a canvas before sending it, so it has to decode
const RECEIPT_PHOTO = { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };

const groceries = async (api) => (await api.list('groceries'))
  .map((i) => [i.name, i.onList, i.aisle, (i.purchases || []).map((p) => [p.qty, p.price, p.store])])
  .sort((a, b) => a[0].localeCompare(b[0]));

test('a receipt scanned on the Groceries page puts everything bought into Groceries, list or not @critical', async ({ page, owner, api, stubs }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await stubs.set({ ai: 'whole-receipt' });
  await api.create('groceries', { name: 'Milk', aisle: 'dairy', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grScanAReceipt') }).first().click();
  const dialog = page.getByRole('dialog', { name: L('grFromReceiptTitle') });
  await dialog.getByLabel(L('grChooseReceipt')).setInputFiles(RECEIPT_PHOTO);

  // What it will do with each line
  await expect(dialog.getByText(L('grTagOnList'), { exact: true })).toBeVisible();
  await expect(dialog.getByText(L('grTagNew'), { exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: L('grAddFromReceipt', { n: 3 }) }).click();

  await expect.poll(() => groceries(api)).toEqual([
    ['Hummus', false, 'pantry', [['', 8.9, 'Rami Levy']]],
    ['Milk', false, 'dairy', [['2', 6.9, 'Rami Levy']]],
    ['Tomatoes', false, 'produce', [['1.25 kg', 8.9, 'Rami Levy']]],
  ]);
  await expect(dialog.getByText(L('grSumOffList', { n: 1 }))).toBeVisible();
  // Nothing in Expenses for it yet, so it asks; no closes it
  await expect(dialog.getByText(L('grExpenseQ'))).toBeVisible();
  await dialog.getByRole('button', { name: L('grExpenseNo') }).click();
  await expect(dialog).toBeHidden();
});

test('a supermarket payment waiting for review takes its receipt into Groceries, and is confirmed with it @critical', async ({ page, owner, api, stubs }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await stubs.set({ ai: 'whole-receipt' });
  const tx = await api.create('transactions', expense({ description: 'SHUFERSAL DEAL', amount: 33.83, category: 'groceries', status: 'pending', source: 'wallet' }));
  await openApp(page, '/Expenses');
  await page.getByText('SHUFERSAL DEAL').first().click();
  await page.getByRole('button', { name: L('grReceiptToGroceries') }).click();
  const dialog = page.getByRole('dialog', { name: L('grFromReceiptTitle') });
  await dialog.getByLabel(L('grChooseReceipt')).setInputFiles(RECEIPT_PHOTO);
  // No grocery items yet: both products are new (the stub matches the first item it is given, and there is none)
  await dialog.getByRole('button', { name: L('grAddFromReceipt', { n: 2 }) }).click();
  await expect.poll(async () => (await groceries(api)).map((g) => g[0])).toEqual(['Hummus', 'Tomatoes']);

  await dialog.getByRole('button', { name: L('grConfirmPaymentToo') }).click();
  await expect.poll(async () => (await api.list('transactions')).find((x) => x.id === tx.id)?.status).not.toBe('pending');
});
