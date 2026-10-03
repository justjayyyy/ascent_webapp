// Notes: a quick note and a checklist, kept after a reload.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

test('a note written in the composer is kept @critical', async ({ page, api }) => {
  await openApp(page, '/Notes');
  await page.getByText(L('ntTakeNote')).first().click();
  await page.getByRole('textbox', { name: L('noteTitle') }).fill('Plumber');
  await page.getByRole('textbox', { name: L('noteContent') }).fill('Call Yossi on Sunday about the boiler');
  await page.keyboard.press('Escape');

  await expect.poll(async () => (await api.list('notes')).map((n) => [n.title, n.content])).toEqual([['Plumber', 'Call Yossi on Sunday about the boiler']]);
  await page.reload();
  await expect(page.getByText('Call Yossi on Sunday about the boiler')).toBeVisible();
});

test('a checklist: Enter adds the next item, and ticking one is kept @critical', async ({ page, api }) => {
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: L('ntNewChecklist') }).first().click();
  await page.getByRole('textbox', { name: L('noteTitle') }).fill('Weekend');
  const item = page.getByRole('textbox', { name: L('ntListItem') });
  await item.last().fill('Fix the bike');
  await item.last().press('Enter');
  await item.last().fill('Call grandma');
  await item.last().press('Enter');
  await item.last().fill('Pay the arnona');
  await page.keyboard.press('Escape');

  await expect.poll(async () => (await api.list('notes'))[0]?.items?.map((i) => i.text).filter(Boolean))
    .toEqual(['Fix the bike', 'Call grandma', 'Pay the arnona']);

  // Ticked from the card in the grid
  await page.reload();
  await page.getByRole('checkbox', { name: 'Call grandma' }).first().click();
  await expect.poll(async () => (await api.list('notes'))[0].items.filter((i) => i.done).map((i) => i.text)).toEqual(['Call grandma']);
});
