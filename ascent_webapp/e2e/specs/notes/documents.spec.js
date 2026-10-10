// Notes as documents: a PDF imported with its picture, and a web page pasted with its shape.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { tinyPdf } from '../../support/pdf.js';

const lines = async (api) => (await api.list('notes'))[0]?.items?.map((i) => [i.kind || (i.done ? 'done' : 'item'), i.text, i.amount ?? null, !!i.fileId]);

test('a PDF is imported into a note: its title, text, picture, box, numbered suppliers with their total, and tasks @critical', async ({ page, owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await openApp(page, '/Notes');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: L('ntImportDocument') }).first().click();
  await (await chooser).setFiles({ name: 'wedding.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });

  // What the assistant read (stubbed), with the picture pdf.js cut out of the page placed where it said
  await expect.poll(() => lines(api), { timeout: 30000 }).toEqual([
    ['text', 'Version 3, with the latest answers.', null, false],
    ['image', 'For illustration only', null, true],
    ['callout', 'What is not settled\nPayment dates are missing.', null, false],
    ['title', 'Suppliers', null, false],
    ['number', 'DJ\nNo contract yet', 8000, false],
    ['number', 'Hall', 73440, false],
    ['item', 'Book the hall', null, false],
  ]);
  const [note] = await api.list('notes');
  expect(note.title).toBe('Before the wedding');
  // The picture, and the PDF itself to open the original
  expect(note.attachments.map((a) => a.type).sort()).toEqual(['application/pdf', 'image/jpeg']);

  // It opens as the note, numbered, with the total under the suppliers and the picture shown
  const editor = page.getByRole('dialog', { name: 'Before the wedding' });
  await expect(editor.getByText(L('ntTotal'), { exact: true })).toBeVisible();
  await expect(editor.getByText('₪81,440')).toBeVisible();
  await expect(editor.getByRole('img', { name: 'For illustration only' })).toBeVisible();
});

test('importing without the assistant says how to turn it on, and makes nothing', async ({ page, api }) => {
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: L('ntImportDocument') }).first().click();
  await expect(page.getByText(L('ntImportNeedsAssistantOwner'))).toBeVisible();
  expect(await api.list('notes')).toEqual([]);
});

// A real 1×1 PNG: the app draws a pasted picture before uploading it
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a web page pasted into a checklist keeps its heading, numbered prices with their total, box, ticked task and picture', async ({ page, api }) => {
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: L('ntNewChecklist') }).first().click();
  const html = `<h2>Suppliers</h2><ol><li>DJ <span>₪8,000</span></li><li>Hall <span>₪73,440</span></li></ol>
    <blockquote>Not settled</blockquote><ul><li><input type="checkbox" checked> Book the hall</li></ul><img src="${PIXEL}" alt="rings">`;
  await page.getByRole('textbox', { name: L('ntListItem') }).last().evaluate((el, data) => {
    const dt = new DataTransfer();
    dt.setData('text/html', data.html);
    dt.setData('text/plain', 'Suppliers\nDJ ₪8,000\nHall ₪73,440\nNot settled\nBook the hall');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html });

  // On a wide screen the paste lands in the composer, which hands a paste with pictures to a note of its own
  const editor = page.getByRole('dialog', { name: L('ntUntitled') });
  await expect(editor.getByText('₪81,440')).toBeVisible();
  await expect(editor.getByRole('img', { name: 'rings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => lines(api)).toEqual([
    ['title', 'Suppliers', null, false],
    ['number', 'DJ', 8000, false],
    ['number', 'Hall', 73440, false],
    ['callout', 'Not settled', null, false],
    ['done', 'Book the hall', null, false],
    ['image', 'rings', null, true],
  ]);
});
