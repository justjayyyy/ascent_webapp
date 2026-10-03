// Your data: a CSV copy of it (safe to open in a spreadsheet), cards, and deleting the account for good.
import fs from 'node:fs';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

test('exporting expenses downloads every one, with spreadsheet formulas made harmless @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Plain coffee', amount: 12 }));
  await api.create('transactions', expense({ description: '=HYPERLINK("http://evil.example","click")', amount: 1 }));
  await api.create('transactions', expense({ description: '+cmd|calc', amount: 2 }));
  await openApp(page, '/Settings');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: `${L('setDownloadCsv')}: ${L('expenses')}` }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const csv = fs.readFileSync(await file.path(), 'utf8');

  expect(csv.charCodeAt(0)).toBe(0xfeff); // so Excel reads Hebrew and Russian correctly
  expect(csv).toContain('Plain coffee');
  // A cell that starts like a formula is kept as text: a leading apostrophe
  expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
  expect(csv).toMatch(/'\+cmd\|calc/);
  expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
});

test('cards: last 4 digits must be four numbers; a card can be added and removed @critical', async ({ page, api }) => {
  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('addCard') }).click();
  await page.getByLabel(L('cardName')).fill('Family Visa');
  await page.getByLabel(L('lastFourDigits')).fill('42a1');
  await page.getByRole('button', { name: L('save'), exact: true }).click();
  await expect(page.getByText(L('last4DigitsMustBe4'))).toBeVisible();

  await page.getByLabel(L('lastFourDigits')).fill('4242');
  await page.getByRole('button', { name: L('save'), exact: true }).click();
  await expect(page.getByText(L('cardAddedSuccessfully')).first()).toBeVisible();
  await expect.poll(async () => (await api.list('cards')).map((c) => [c.name, c.lastFourDigits])).toEqual([['Family Visa', '4242']]);
});

test('deleting the account takes typing its email; afterwards it cannot sign in @critical', async ({ page, owner }) => {
  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('delTitle') }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
  const confirm = dialog.getByRole('button', { name: L('delConfirm') });
  await dialog.getByLabel(new RegExp(L('delTypeEmail').split('{email}')[0].trim())).fill('someone-else@e2e.test');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(new RegExp(L('delTypeEmail').split('{email}')[0].trim())).fill(owner.email);
  await confirm.click();

  await expect(page).toHaveURL(/\/login\?.*reason=account_deleted/);
  const login = new LoginScreen(page);
  await login.chooseLanguage('en');
  await login.signIn(owner);
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.post('/api/auth/login', { data: { email: owner.email, password: owner.password } })).status()).toBe(401);
});
