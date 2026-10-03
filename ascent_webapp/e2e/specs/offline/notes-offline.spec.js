// Notes without a connection (NT-E02, NT-N02, NT-H14): written and edited offline, they sync when it returns;
// files need the connection and say so; a note copied as text.
import { test, expect } from '../../fixtures.js';
import { installOffline, openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

test('a note written and another edited offline both reach the server when the connection returns @critical @offline', async ({ page, context, api }) => {
  await api.create('notes', { type: 'text', title: 'Packing', content: 'Passports', isShared: false });
  await openApp(page, '/Notes');
  await installOffline(page);
  await expect(page.getByRole('button', { name: 'Packing', exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.getByText(L('ntTakeNote')).first().click();
  await page.getByRole('textbox', { name: L('noteTitle') }).fill('Plumber');
  await page.getByRole('textbox', { name: L('noteContent') }).fill('Call on Sunday');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Packing', exact: true }).click();
  await page.getByRole('textbox', { name: L('noteContent') }).fill('Passports, chargers');
  await page.keyboard.press('Escape');

  await context.setOffline(false);
  await expect.poll(async () => (await api.list('notes')).map((n) => [n.title, n.content]).sort(), { timeout: 30_000 })
    .toEqual([['Packing', 'Passports, chargers'], ['Plumber', 'Call on Sunday']]);
});

test('attaching a file offline says it needs the connection @critical @offline', async ({ page, context, api }) => {
  await api.create('notes', { type: 'text', title: 'Warranty', content: 'TV', isShared: false });
  await openApp(page, '/Notes');
  await installOffline(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Warranty', exact: true }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('receipt') });
  await expect(page.getByText(L('ntNeedOnline')).first()).toBeVisible();
});

test('a note copied as text has its title and lines @critical', async ({ page, context, api, browserName }) => {
  test.skip(browserName !== 'chromium', 'reading the clipboard needs Chromium permissions');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await api.create('notes', { type: 'checklist', title: 'Shopping', content: '', isShared: false, items: [{ id: 'a', text: 'Milk', done: false }, { id: 'b', text: 'Bread', done: false }] });
  await openApp(page, '/Notes');
  const card = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Shopping', exact: true }) });
  await card.hover();
  await card.getByRole('button', { name: L('ntMore') }).click();
  await page.getByRole('menuitem', { name: L('ntCopyText') }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/Shopping[\s\S]*Milk[\s\S]*Bread/);
});
