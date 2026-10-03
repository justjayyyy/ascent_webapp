// Importing a card statement: read on the device, matched against what was already entered, never doubled.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { L, Lre } from '../../support/i18n.js';

const statement = () => ({
  name: 'statement.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from([
    'Date,Description,Amount',
    `${day(-3)},Shufersal Deal,42.90`,
    `${day(-2)},Paz fuel,250.00`,
    `${day(-5)},Netflix,54.90`,
  ].join('\n')),
});

async function importFile(page, file) {
  await page.getByRole('button', { name: L('impTitle') }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.getByText(L('impRowsFound', { count: 3 }))).toBeVisible();
  await dialog.getByRole('button', { name: L('impImport', { count: 3 }) }).click();
  return dialog;
}

test('a statement adds the new purchases and matches the one already entered by hand @critical', async ({ page, api }) => {
  // Entered by hand on the day; the statement has the same purchase
  await api.create('transactions', expense({ amount: 42.9, date: day(-3), description: 'Supermarket' }));
  await openApp(page, '/Settings');

  const dialog = await importFile(page, statement());
  await expect(dialog.getByText(Lre('impDone'))).toBeVisible();
  await expect(dialog).toContainText(L('impDone', { created: 2, merged: 1, duplicates: 0 }));

  await expect.poll(async () => (await api.list('transactions')).map((t) => t.amount).sort((a, b) => a - b)).toEqual([42.9, 54.9, 250]);
});

test('importing the same statement again adds nothing @critical', async ({ page, api }) => {
  await openApp(page, '/Settings');
  let dialog = await importFile(page, statement());
  await expect(dialog).toContainText(L('impDone', { created: 3, merged: 0, duplicates: 0 }));
  await page.keyboard.press('Escape');

  dialog = await importFile(page, statement());
  await expect(dialog).toContainText(L('impDone', { created: 0, merged: 0, duplicates: 3 }));
  expect((await api.list('transactions'))).toHaveLength(3);
});
