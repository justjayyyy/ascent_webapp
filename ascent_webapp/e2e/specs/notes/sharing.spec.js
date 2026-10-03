// Notes shared between two people in a household (NT-H07-H09, N03, N04, E01): view-only and can-edit, what only the
// owner may do, leaving a note, and two people ticking one checklist at once.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

// Shared with the people named only (notes are shared with the whole household unless set otherwise)
const note = (over = {}) => ({ type: 'text', title: 'Holiday packing', content: 'Passports, chargers', isShared: false, ...over });
const notesOf = async (who) => (await who.api.send('GET', '/entities/notes')).json().then((r) => r.data);

test('shared to view, the partner can read it but not change it; made an editor, they can, and the owner sees who did @critical @multiuser', async ({ page, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const shared = await api.create('notes', note({ collaborators: [{ userId: sam.userId, role: 'viewer' }] }));

  // On Sam's phone: there, marked view only, and refused if changed anyway
  await openApp(sam.page, '/Notes');
  await sam.page.getByRole('button', { name: 'Holiday packing', exact: true }).click();
  await expect(sam.page.getByText(L('ntViewOnlyHint'))).toBeVisible();
  const refused = await sam.api.send('PUT', `/entities/notes?id=${shared.id}`, { content: 'Passports' });
  expect(refused.status()).toBe(403);

  await api.update('notes', shared.id, { collaborators: [{ userId: sam.userId, role: 'editor' }] });
  const edited = await sam.api.send('PUT', `/entities/notes?id=${shared.id}`, { content: 'Passports, chargers, sunscreen' });
  expect(edited.status()).toBe(200);
  const [mine] = await api.list('notes');
  expect([mine.content, mine.updatedByEmail]).toEqual(['Passports, chargers, sunscreen', sam.email]);
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: 'Holiday packing', exact: true }).click();
  // By the name Sam goes by in the household, not an email address
  await expect(page.getByText(new RegExp(`^${L('ntEditedBy', { name: 'Sam Partner', time: '§' }).split('§')[0]}`)).first()).toBeVisible();
});

test('only the owner decides who a note is shared with, and only the owner deletes it; the partner can leave it @critical @multiuser', async ({ api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const shared = await api.create('notes', note({ collaborators: [{ userId: sam.userId, role: 'editor' }] }));

  for (const change of [{ collaborators: [] }, { isShared: true }, { trashed: true }]) {
    const res = await sam.api.send('PUT', `/entities/notes?id=${shared.id}`, change);
    expect(res.status(), JSON.stringify(change)).toBe(403);
  }
  // Sam deleting it means leaving it: gone for Sam, still the owner's
  const left = await sam.api.send('DELETE', `/entities/notes?id=${shared.id}`);
  expect((await left.json()).data).toMatchObject({ left: true });
  expect(await notesOf(sam)).toEqual([]);
  expect((await api.list('notes')).map((n) => [n.title, n.collaborators.length])).toEqual([['Holiday packing', 0]]);
});

test('a note shared with the whole household cannot be deleted by someone who is only reading it @critical @multiuser', async ({ api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const shared = await api.create('notes', note({ isShared: true }));
  expect((await notesOf(sam)).map((n) => n.title)).toEqual(['Holiday packing']);
  const res = await sam.api.send('DELETE', `/entities/notes?id=${shared.id}`);
  expect(res.status()).toBe(403);
  expect(await api.list('notes')).toHaveLength(1);
});

test('two people ticking different items of one checklist at once keep both ticks @critical @multiuser', async ({ api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const items = [{ id: 'a', text: 'Milk', done: false }, { id: 'b', text: 'Bread', done: false }, { id: 'c', text: 'Eggs', done: false }];
  const list = await api.create('notes', note({ type: 'checklist', title: 'Shopping', content: '', items, collaborators: [{ userId: sam.userId, role: 'editor' }] }));

  // Both start from the same list; each ticks one item and saves with the list they started from
  const tick = (id) => items.map((i) => (i.id === id ? { ...i, done: true } : i));
  const [mineRes, samsRes] = await Promise.all([
    api.send('PUT', `/entities/notes?id=${list.id}`, { items: tick('a'), itemsBase: items }),
    sam.api.send('PUT', `/entities/notes?id=${list.id}`, { items: tick('c'), itemsBase: items }),
  ]);
  expect([mineRes.status(), samsRes.status()]).toEqual([200, 200]);
  const [saved] = await api.list('notes');
  expect(saved.items.map((i) => [i.text, i.done])).toEqual([['Milk', true], ['Bread', false], ['Eggs', true]]);
});
