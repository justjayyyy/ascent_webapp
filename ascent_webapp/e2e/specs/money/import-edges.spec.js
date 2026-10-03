// Card statements that are not the easy case (IMP-H02, N01-N03, E01): a workbook with several sheets and charges
// as negative numbers, Hebrew headers with day-first dates, files that are not statements, too many rows, and the
// server failing midway.
import * as XLSX from 'xlsx';
import { format, subDays } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

const daysAgo = (n, pattern = 'yyyy-MM-dd') => format(subDays(new Date(), n), pattern);
const csv = (name, lines) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text });

async function chooseFile(page, file) {
  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('impTitle') }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(file);
  return dialog;
}

test('a workbook: the sheet with the purchases is found, negative charges are read as charges, and they can go to review @critical', async ({ page, api }) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Card statement'], ['Account', '••4580']]), 'Summary');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Date', 'Merchant', 'Amount'],
    [daysAgo(4), 'Super-Pharm', -64.5],
    [daysAgo(3), 'Wolt', -89.9],
  ]), 'Purchases');
  const dialog = await chooseFile(page, { name: 'statement.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) });

  await expect(dialog.getByText(L('impRowsFound', { count: 2 }))).toBeVisible();
  await expect(dialog.locator('#imp-sheet')).toContainText('Purchases');
  await expect(dialog.getByRole('checkbox', { name: L('impFlipSign') })).toBeChecked();
  await dialog.getByRole('checkbox', { name: L('impSendToReview') }).check();
  await dialog.getByRole('button', { name: L('impImport', { count: 2 }) }).click();
  await expect(dialog).toContainText(L('impDone', { created: 2, merged: 0, duplicates: 0 }));

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.description, t.amount, t.type, t.status]).sort())
    .toEqual([['Super-Pharm', 64.5, 'Expense', 'pending'], ['Wolt', 89.9, 'Expense', 'pending']]);
});

test('Hebrew headers, day-first dates and thousands separators are read, and a row with no amount is skipped @critical', async ({ page, api }) => {
  const dialog = await chooseFile(page, csv('isracard.csv', [
    'תאריך עסקה,שם בית העסק,סכום חיוב',
    `${daysAgo(6, 'dd/MM/yyyy')},איקאה נתניה,"1,250.00"`,
    `${daysAgo(5, 'dd/MM/yyyy')},שופרסל דיל,45.90`,
    `${daysAgo(4, 'dd/MM/yyyy')},זיכוי מבוטל,0`,
  ]));
  await expect(dialog.getByText(L('impRowsFound', { count: 2 }))).toBeVisible();
  await expect(dialog.getByText(L('impSkipped', { count: 1 }))).toBeVisible();
  await dialog.getByRole('button', { name: L('impImport', { count: 2 }) }).click();
  await expect(dialog).toContainText(L('impDone', { created: 2, merged: 0, duplicates: 0 }));
  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.description, t.amount, t.date]).sort())
    .toEqual([['איקאה נתניה', 1250, daysAgo(6)], ['שופרסל דיל', 45.9, daysAgo(5)]]);
});

test('a file that is not a statement says so, and nothing is imported @critical', async ({ page, api }) => {
  // A picture renamed to .csv
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  let dialog = await chooseFile(page, { name: 'photo.csv', mimeType: 'text/csv', buffer: png });
  await expect(toast(page, L('impUnreadable')).or(dialog.getByText(L('impNoRows')))).toBeVisible();
  // Nothing to import, so the button cannot be used
  await expect(dialog.getByRole('button', { name: L('impImport', { count: 0 }) })).toBeDisabled();

  await page.keyboard.press('Escape');
  dialog = await chooseFile(page, csv('contacts.csv', ['Name,Phone', 'Dana,050-1234567', 'Sam,052-7654321']));
  await expect(dialog.getByText(L('impNoRows'))).toBeVisible();
  expect(await api.list('transactions')).toEqual([]);
});

test('more rows than one import takes: the screen says so, and the server refuses them @critical', async ({ page, api }) => {
  const lines = ['Date,Description,Amount'];
  for (let i = 0; i < 2001; i += 1) lines.push(`${daysAgo(i % 300)},Shop ${i},${(i % 90) + 1}.50`);
  const dialog = await chooseFile(page, csv('year.csv', lines));
  await expect(dialog.getByText(L('impTooMany', { max: 2000 }))).toBeVisible();
  await expect(dialog.getByRole('button', { name: L('impImport', { count: 2000 }) })).toBeVisible();

  const rows = Array.from({ length: 2001 }, (_, i) => ({ date: daysAgo(i % 300), description: `Shop ${i}`, amount: 10 }));
  const tooMany = await api.send('POST', '/import/statement', { rows });
  expect(tooMany.status()).toBe(413);
  expect((await tooMany.json()).error).toBe('too_many_rows');
  expect(await api.list('transactions')).toEqual([]);
});

test('when the server fails the import, it says so and writes nothing @critical', async ({ page, api }) => {
  const dialog = await chooseFile(page, csv('statement.csv', ['Date,Description,Amount', `${daysAgo(2)},Paz fuel,250.00`]));
  await page.route(/\/api\/import\/statement/, (route) => route.fulfill({ status: 500, json: { success: false, error: 'Internal server error' } }));
  await dialog.getByRole('button', { name: L('impImport', { count: 1 }) }).click();
  await expect(toast(page, L('impFailed'))).toBeVisible();
  // Still there to try again
  await expect(dialog.getByRole('button', { name: L('impImport', { count: 1 }) })).toBeEnabled();
  expect(await api.list('transactions')).toEqual([]);
});
