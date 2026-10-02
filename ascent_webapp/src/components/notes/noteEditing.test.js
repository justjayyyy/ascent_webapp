import { describe, expect, test } from 'vitest';
import { lastEditor, textDir } from './noteUtils';
import { suggestFor } from './ChecklistEditor';

describe('text direction', () => {
  test('the first letter decides, whatever language the app is in', () => {
    expect(textDir('שלום world')).toBe('rtl');
    expect(textDir('Milk חלב')).toBe('ltr');
    expect(textDir('Привет')).toBe('ltr');
    expect(textDir('  12. - קניות')).toBe('rtl');
  });

  test('no letters yet follows the page', () => {
    expect(textDir('')).toBeUndefined();
    expect(textDir('123 !?')).toBeUndefined();
    expect(textDir(undefined)).toBeUndefined();
  });
});

describe('who edited last', () => {
  const dana = { id: 'u2', email: 'dana@x.test', name: 'dana', isMe: false };
  const me = { id: 'u1', email: 'me@x.test', name: 'me', isMe: true };
  const people = { byId: { u1: me, u2: dana }, list: [me, dana], me: { id: 'u1', email: 'me@x.test' } };

  test('found by id, or by email in any case', () => {
    expect(lastEditor({ updatedBy: 'u2' }, people)).toBe(dana);
    expect(lastEditor({ updatedByEmail: 'Dana@X.test' }, people)).toBe(dana);
  });

  test('someone no longer in the workspace is still named, never shown as you', () => {
    const gone = lastEditor({ updatedByEmail: 'sam@x.test' }, people);
    expect(gone.name).toBe('sam');
    expect(gone.isMe).toBe(false);
  });

  test('unknown when nothing was recorded', () => {
    expect(lastEditor({}, people)).toBeNull();
  });
});

describe('checklist suggestions', () => {
  const items = [
    { id: 'a', text: 'Milk', done: true },
    { id: 'b', text: 'Bread', done: false },
    { id: 'c', text: 'mi', done: false },
  ];

  test('a ticked item comes back first, then items from other lists', () => {
    const found = suggestFor(items[2], items, ['Mint', 'milk', 'Rice']);
    expect(found.map(s => [s.kind, s.text])).toEqual([['restore', 'Milk'], ['fill', 'Mint']]);
  });

  test('an item already on the list is pointed to', () => {
    const typing = { id: 'd', text: 'bre', done: false };
    expect(suggestFor(typing, [...items, typing], [])).toEqual([{ kind: 'duplicate', text: 'Bread', id: 'b' }]);
  });

  test('nothing typed, nothing offered', () => {
    expect(suggestFor({ id: 'e', text: '  ', done: false }, items, ['Milk'])).toEqual([]);
  });
});

describe('text and titles between checklist items', () => {
  test('they are never ticked, suggested, or written with a box', async () => {
    const { isTicked, noteToText } = await import('./noteUtils');
    const title = { id: 't', text: 'Dairy', done: true, kind: 'title' };
    expect(isTicked(title)).toBe(false);
    expect(suggestFor({ id: 'n', text: 'dai', done: false }, [title], [])).toEqual([]);
    expect(noteToText({ type: 'checklist', items: [title, { id: 'm', text: 'Milk', done: false }] }))
      .toBe('Dairy\n[ ] Milk');
  });
});
