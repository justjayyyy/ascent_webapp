// Notes features (NT-H06, H10-H15): several notes at once, copying as text, search and the grid/list choice,
// labels, a reminder going off, files attached, and the keyboard shortcuts list.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

const note = (title, over = {}) => ({ type: 'text', title, content: `${title} details`, isShared: false, ...over });
const cardButton = (page, title) => page.getByRole('button', { name: title, exact: true });

test('several notes selected at once are archived together; Escape clears the selection @critical', async ({ page, api }) => {
  for (const t of ['Gas bill', 'Water bill', 'Keep me']) await api.create('notes', note(t));
  await openApp(page, '/Notes');
  for (const t of ['Gas bill', 'Water bill']) {
    const card = page.getByRole('article').filter({ has: cardButton(page, t) });
    await card.hover();
    await card.getByRole('button', { name: L('ntSelect') }).click();
  }
  await expect(page.getByText(L('ntSelectedCount', { n: 2 }))).toBeVisible();
  await page.getByRole('toolbar', { name: L('ntSelectedCount', { n: 2 }) }).getByRole('button', { name: L('ntArchive') }).click();
  await expect.poll(async () => (await api.list('notes')).filter((n) => n.isArchived).map((n) => n.title).sort()).toEqual(['Gas bill', 'Water bill']);
  await expect(page.getByText(L('ntSelectedCount', { n: 2 }))).toHaveCount(0);

  const keep = page.getByRole('article').filter({ has: cardButton(page, 'Keep me') });
  await keep.hover();
  await keep.getByRole('button', { name: L('ntSelect') }).click();
  await expect(page.getByText(L('ntSelectedCount', { n: 1 }))).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(L('ntSelectedCount', { n: 1 }))).toHaveCount(0);
});

test('search finds a note, and the grid or list choice is remembered @critical', async ({ page, api }) => {
  await api.create('notes', note('Plumber'));
  await api.create('notes', note('Electrician'));
  await openApp(page, '/Notes');
  await page.getByRole('searchbox').first().fill('plumb');
  await expect(cardButton(page, 'Plumber')).toBeVisible();
  await expect(cardButton(page, 'Electrician')).toHaveCount(0);

  await page.getByRole('searchbox').first().fill('');
  await page.getByRole('button', { name: L('ntListView') }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: L('ntGridView') })).toBeVisible();
});

test('a label filters the notes; renamed, it changes on every note @critical', async ({ page, api }) => {
  await api.create('notes', note('Paint the fence', { tags: ['Home'] }));
  await api.create('notes', note('Quarterly report', { tags: ['Work'] }));
  await openApp(page, '/Notes');
  await page.getByRole('navigation', { name: L('ntFilters') }).getByRole('button', { name: /^Home/ }).first().click();
  await expect(cardButton(page, 'Paint the fence')).toBeVisible();
  await expect(cardButton(page, 'Quarterly report')).toHaveCount(0);

  await page.getByRole('button', { name: L('ntEditLabels') }).first().click();
  const dialog = page.getByRole('dialog');
  // Each label: a rename button that turns it into a field
  await dialog.getByRole('button', { name: L('ntRenameLabel') }).first().click();
  const field = dialog.getByRole('textbox', { name: L('ntRenameLabel') });
  await field.fill('House');
  await field.press('Enter');
  await expect.poll(async () => (await api.list('notes')).find((n) => n.title === 'Paint the fence').tags).toEqual(['House']);
});

test('a reminder that came due while the app was closed goes off when Notes opens, once @critical', async ({ page, api }) => {
  // A reminder is personal: set with a change, as the app does
  const due = await api.create('notes', note('Call the dentist'));
  await api.update('notes', due.id, { reminder: new Date(Date.now() - 60_000).toISOString() });
  const later = await api.create('notes', note('Book the MOT'));
  await api.update('notes', later.id, { reminder: new Date(Date.now() + 3_600_000).toISOString() });
  await openApp(page, '/Notes');
  const toast = (title) => page.locator('[data-sonner-toast]').filter({ hasText: `${L('ntReminder')}: ${title}` });
  await expect(toast('Call the dentist')).toBeVisible();
  await expect(toast('Book the MOT')).toHaveCount(0);
  // Not again on the next visit
  await page.reload();
  await expect(page.getByRole('button', { name: 'Call the dentist', exact: true })).toBeVisible();
  await expect(toast('Call the dentist')).toHaveCount(0);
});

test('a file attached to a note is kept with it @critical', async ({ page, api }) => {
  await api.create('notes', note('Warranty'));
  await openApp(page, '/Notes');
  await cardButton(page, 'Warranty').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => (await api.list('notes'))[0].attachments.map((a) => a.name)).toEqual(['receipt.png']);
});

test('"?" opens the keyboard shortcuts @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Notes');
  await page.locator('body').click({ position: { x: 640, y: 5 } });
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog', { name: L('ntShortcuts') })).toBeVisible();
});
