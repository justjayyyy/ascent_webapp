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

test('a document pasted into a checklist keeps its titles, its text and its tasks', async ({ page, api }) => {
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: L('ntNewChecklist') }).first().click();
  const doc = '# Before the wedding\nWhat is still open.\n\n☐ Book the hall\n☑ Buy the rings\n\n# The day before\n☐ Charge the phones';
  await page.getByRole('textbox', { name: L('ntListItem') }).last().evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, doc);
  await expect(page.getByRole('textbox', { name: L('ntListItem') }).last()).toHaveValue('Charge the phones');
  await page.keyboard.press('Escape');

  await expect.poll(async () => (await api.list('notes'))[0]?.items?.filter((i) => i.text).map((i) => [i.kind || (i.done ? 'done' : 'item'), i.text]))
    .toEqual([
      ['title', 'Before the wedding'], ['text', 'What is still open.'], ['item', 'Book the hall'], ['done', 'Buy the rings'],
      ['title', 'The day before'], ['item', 'Charge the phones'],
    ]);
});

test('a note can be pinned, archived and brought back with Undo, and trashed and restored @critical', async ({ page, api }) => {
  await api.create('notes', { type: 'text', title: 'Boiler code', content: '4471', isShared: false });
  await openApp(page, '/Notes');
  const card = page.locator('article, [role=listitem], div').filter({ has: page.getByRole('button', { name: 'Boiler code', exact: true }) }).last();
  const stored = async () => (await api.list('notes'))[0];

  await card.hover();
  await card.getByRole('button', { name: L('ntPin') }).click();
  await expect.poll(async () => (await stored()).isPinned).toBe(true);

  const fromMenu = async (item) => {
    await card.hover();
    await card.getByRole('button', { name: L('ntMore') }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };
  await fromMenu(L('ntArchive'));
  await expect.poll(async () => (await stored()).isArchived).toBe(true);
  await page.locator('[data-sonner-toast]').filter({ hasText: L('ntArchived') }).getByRole('button', { name: L('ntUndo') }).click();
  await expect.poll(async () => (await stored()).isArchived).toBe(false);

  await fromMenu(L('ntMoveToTrash'));
  await expect.poll(async () => (await stored()).trashedAt).not.toBeNull();
  await page.getByRole('link', { name: L('ntTrashNav') }).or(page.getByRole('button', { name: L('ntTrashNav') })).first().click();
  await fromMenu(L('ntRestore'));
  await expect.poll(async () => (await stored()).trashedAt).toBeNull();
});
