import { describe, expect, test } from 'vitest';
import {
  noteToText, searchableText, textToItems, parseLines, isEmptyNote, flowBlocks, flowChanges, noteForm, distribute, formatBytes, nextOccurrence,
  extractLinks, linkHost, matchesFilter, isPreviewable, toLocalInput, reminderPresets, fmt, base64ToBlob, sortNotes, groupNotes, reorderPositions,
} from './noteUtils';

const list = (items, extra = {}) => ({ type: 'checklist', items: items.map((text, i) => ({ id: `i${i}`, text, done: i === 0 })), ...extra });

describe('text and lists', () => {
  test('a note as plain text, lists with their check marks', () => {
    expect(noteToText({ title: 'Trip', content: 'Pack' })).toBe('Trip\nPack');
    expect(noteToText(list(['milk', 'eggs'], { title: 'Shop' }))).toBe('Shop\n[x] milk\n[ ] eggs');
    expect(noteToText({ title: 'T', content: 'c' }, { withTitle: false })).toBe('c');
  });

  test('lines become list items without their bullets or boxes', () => {
    const items = textToItems('- milk\n* eggs\n[x] bread\n\n  • jam  ');
    expect(items.map((i) => i.text)).toEqual(['milk', 'eggs', 'bread', 'jam']);
    expect(textToItems('')).toHaveLength(1); // an empty list still has one line to type in
  });

  test('continuous text stays plain text until it has more than one block of text', () => {
    const plain = { type: 'text', content: 'Dear diary' };
    expect(noteForm(plain)).toBe('text');
    expect(noteForm({ type: 'checklist', flow: true })).toBe('text');
    expect(noteForm({ type: 'checklist' })).toBe('checklist');
    const [block] = flowBlocks(plain, 'b1');
    expect(block).toEqual({ id: 'b1', kind: 'text', text: 'Dear diary', done: false });
    expect(flowChanges(plain, [{ ...block, text: 'Dear diary, today' }])).toEqual({ content: 'Dear diary, today' });
    const title = { id: 't', kind: 'title', text: 'Monday', done: false };
    const doc = flowChanges(plain, [title, block]);
    expect(doc).toEqual({ type: 'checklist', flow: true, content: '', items: [title, block] });
    expect(flowChanges({ ...plain, ...doc }, [block])).toEqual({ type: 'text', flow: false, content: 'Dear diary', items: [] });
    // An empty document is typed into as one empty block of text
    expect(flowBlocks({ type: 'checklist', flow: true, items: [] }, 'b2')[0]).toMatchObject({ id: 'b2', kind: 'text', text: '' });
  });

  const shape = (lines) => lines.map(({ text, kind, done }) => [kind || (done ? 'done' : 'item'), text]);

  test('plain lines with no marks are all items, a "# " line a title', () => {
    expect(shape(parseLines('# Shop\nmilk\neggs'))).toEqual([['title', 'Shop'], ['item', 'milk'], ['item', 'eggs']]);
  });

  test('a copied document keeps its titles, its text and its tasks, ticked or not', () => {
    const doc = [
      '# לפני החתונה',
      'הסימון הוא לקריאה בלבד.',
      'שורה שנייה של ההסבר.',
      '',
      '☐ לקנות נעליים',
      '☑ להזמין פרחים',
      '- [ ] לסגור סידורי שולחנות',
      '- [x] לשלוח את רשימת האורחים',
      '---',
      '## חתן, אולם ורבנות',
      '□',
      'לבחור רב מחתן.',
    ].join('\r\n');
    expect(shape(parseLines(doc))).toEqual([
      ['title', 'לפני החתונה'],
      ['text', 'הסימון הוא לקריאה בלבד.\nשורה שנייה של ההסבר.'],
      ['item', 'לקנות נעליים'],
      ['done', 'להזמין פרחים'],
      ['item', 'לסגור סידורי שולחנות'],
      ['done', 'לשלוח את רשימת האורחים'],
      ['title', 'חתן, אולם ורבנות'],
      ['item', 'לבחור רב מחתן.'], // a box on its own line, as PDFs copy it, goes with the next line
    ]);
  });

  test('a task wrapped onto the next line stays one task; after a blank line it is text', () => {
    expect(shape(parseLines('☐ book the hall\nand pay the deposit\n\nnotes for later'))).toEqual([
      ['item', 'book the hall and pay the deposit'],
      ['text', 'notes for later'],
    ]);
  });

  test('search covers title, body, list items and labels, case-insensitively', () => {
    const s = searchableText(list(['Milk'], { title: 'Shop', tags: ['Home'] }));
    expect(s).toContain('milk');
    expect(s).toContain('home');
  });

  test('a note with only whitespace is empty', () => {
    expect(isEmptyNote({ title: ' ', content: '\n' })).toBe(true);
    expect(isEmptyNote(list([' ']))).toBe(true);
    expect(isEmptyNote(list(['x']))).toBe(false);
  });

  test('cards are dealt into the shortest column, keeping order within each', () => {
    const notes = [{ id: 1, content: 'x'.repeat(400) }, { id: 2 }, { id: 3 }, { id: 4 }];
    const cols = distribute(notes, 2);
    expect(cols.flat()).toHaveLength(4);
    expect(cols[0].map((n) => n.id)).toEqual([1]);
    expect(cols[1].map((n) => n.id)).toEqual([2, 3, 4]);
  });
});

describe('reminders', () => {
  test('repeats land on the next time after now', () => {
    const after = Date.parse('2026-10-05T12:00:00Z');
    expect(nextOccurrence('2026-10-01T09:00:00Z', 'daily', after)).toBe('2026-10-06T09:00:00.000Z');
    expect(nextOccurrence('2026-10-01T09:00:00Z', 'weekly', after)).toBe('2026-10-08T09:00:00.000Z');
    expect(nextOccurrence('2026-10-01T09:00:00Z', 'none', after)).toBeNull();
    expect(nextOccurrence('not a date', 'daily', after)).toBeNull();
  });

  test('a monthly reminder on the 31st stays at the end of the month instead of drifting', () => {
    const jan31 = new Date(2026, 0, 31, 9, 0).toISOString();
    const feb = new Date(nextOccurrence(jan31, 'monthly', new Date(2026, 1, 1).getTime()));
    expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);
    const apr = new Date(nextOccurrence(jan31, 'monthly', new Date(2026, 3, 1).getTime()));
    expect([apr.getMonth(), apr.getDate()]).toEqual([3, 30]);
    const may = new Date(nextOccurrence(jan31, 'monthly', new Date(2026, 4, 1).getTime()));
    expect([may.getMonth(), may.getDate()]).toEqual([4, 31]);
  });

  test('a yearly reminder on 29 February falls on the 28th in other years', () => {
    const leap = new Date(2028, 1, 29, 9, 0).toISOString();
    const next = new Date(nextOccurrence(leap, 'yearly', new Date(2028, 2, 1).getTime()));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2029, 1, 28]);
  });

  test('quick presets are always in the future', () => {
    const now = new Date(2026, 9, 1, 20, 0);
    const presets = reminderPresets(now);
    expect(presets.every((p) => p.date > now)).toBe(true);
    expect(presets.map((p) => p.key)).not.toContain('later'); // 6 pm has passed
    expect(reminderPresets(new Date(2026, 9, 1, 9, 0)).map((p) => p.key)).toContain('later');
  });

  test('datetime-local values are in local time', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
  });
});

describe('links, files and filters', () => {
  test('links are found in text and items, deduplicated, at most five', () => {
    const note = { content: 'see https://a.test/x, www.b.test and https://a.test/x/', items: [{ text: 'http://c.test' }] };
    expect(extractLinks(note)).toEqual(['https://a.test/x', 'http://c.test', 'https://www.b.test']);
    expect(extractLinks({ content: [1, 2, 3, 4, 5, 6].map((i) => `https://s${i}.test`).join(' ') })).toHaveLength(5);
    expect(linkHost('https://www.example.test/path')).toBe('example.test');
    expect(linkHost('not a url')).toBe('not a url');
  });

  test('filters by kind of content', () => {
    const photo = { attachments: [{ type: 'image/png' }] };
    const pdf = { attachments: [{ type: 'application/pdf' }] };
    expect(matchesFilter(photo, 'images')).toBe(true);
    expect(matchesFilter(photo, 'files')).toBe(false);
    expect(matchesFilter(pdf, 'files')).toBe(true);
    expect(matchesFilter(list(['a']), 'lists')).toBe(true);
    expect(matchesFilter({ reminder: '2026-01-01' }, 'reminders')).toBe(true);
    expect(matchesFilter({}, null)).toBe(true);
    expect(isPreviewable('image/svg+xml')).toBe(false); // never inline an SVG from an upload
  });

  test('sizes read naturally', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });

  test('base64 back to bytes', () => {
    const blob = base64ToBlob(btoa('hi!'), 'text/plain');
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe(3);
    expect(base64ToBlob(btoa('x')).type).toBe('application/octet-stream');
  });

  test('placeholders fill in', () => {
    expect(fmt('{n} notes', { n: 3 })).toBe('3 notes');
  });
});

describe('sortNotes', () => {
  const notes = [
    { id: 'a', title: 'banana', created_date: '2026-01-03', updated_date: '2026-01-05' },
    { id: 'b', title: '', content: '', created_date: '2026-01-04', updated_date: '2026-01-04' },
    { id: 'c', title: 'Apple', created_date: '2026-01-01', updated_date: '2026-01-06' },
    { id: 'd', title: 'zebra', isPinned: true, created_date: '2026-01-02', updated_date: '2026-01-01' },
  ];
  const ids = (list) => list.map(n => n.id).join('');

  test('puts pinned notes first, then the latest edit', () => {
    expect(ids(sortNotes(notes, 'updated'))).toBe('dcab');
  });
  test('can go by creation date', () => {
    expect(ids(sortNotes(notes, 'created'))).toBe('dbac');
  });
  test('goes by title regardless of case, with untitled notes last', () => {
    expect(ids(sortNotes(notes, 'title'))).toBe('dcab');
    expect(ids(sortNotes(notes.map(n => ({ ...n, isPinned: false })), 'title'))).toBe('cadb');
  });
});

describe('groupNotes', () => {
  const now = new Date(2026, 9, 11, 15);
  const at = (y, m, d) => new Date(y, m, d, 9).toISOString();

  test('groups by date, newest first, older notes by month', () => {
    const notes = [
      { id: 'a', updated_date: at(2026, 9, 11) },
      { id: 'b', updated_date: at(2026, 9, 10) },
      { id: 'c', updated_date: at(2026, 9, 6) },
      { id: 'd', updated_date: at(2026, 9, 1) },
      { id: 'e', updated_date: at(2026, 7, 20) },
      { id: 'f', updated_date: at(2025, 11, 2) },
    ];
    const groups = groupNotes(notes, 'date', { now });
    expect(groups.map(g => g.bucket.key)).toEqual(['today', 'yesterday', 'week', 'month', 'm-2026-7', 'm-2025-11']);
  });

  test('groups by first label by name, unlabelled last, skipping the label being viewed', () => {
    const notes = [
      { id: 'a', tags: ['work', 'Home'] },
      { id: 'b', tags: [] },
      { id: 'c', tags: ['work'] },
    ];
    expect(groupNotes(notes, 'label', {}).map(g => [g.label, g.notes.map(n => n.id).join('')]))
      .toEqual([['Home', 'a'], ['work', 'c'], [null, 'b']]);
    expect(groupNotes(notes, 'label', { skipLabel: 'home' }).map(g => g.label)).toEqual(['work', null]);
  });

  test('groups by colour in palette order with plain notes last, and by type', () => {
    const notes = [{ id: 'a' }, { id: 'b', color: 'sky' }, { id: 'c', color: 'coral', type: 'checklist', items: [] }];
    expect(groupNotes(notes, 'color', {}).map(g => g.color)).toEqual(['coral', 'sky', 'default']);
    expect(groupNotes(notes, 'type', {}).map(g => g.type)).toEqual(['checklist', 'text']);
  });

  test('leaves the notes as one group when not grouping', () => {
    expect(groupNotes([{ id: 'a' }], 'none')).toEqual([{ key: 'all', kind: 'none', notes: [{ id: 'a' }] }]);
  });
});

describe('your own order', () => {
  const ids = (list) => list.map(n => n.id).join('');
  // Apply the positions a drag saves, then sort again, as the page does
  const drag = (list, id, to) => {
    const patches = Object.fromEntries(reorderPositions(list, id, to));
    return { patches, list: sortNotes(list.map(n => (n.id in patches ? { ...n, position: patches[n.id] } : n)), 'manual') };
  };

  test('places notes by position, with notes never placed first, newest on top', () => {
    const list = [
      { id: 'a', position: 2, updated_date: '2026-01-01' },
      { id: 'b', position: 1, updated_date: '2026-01-02' },
      { id: 'c', updated_date: '2026-01-03' },
      { id: 'd', updated_date: '2026-01-04' },
    ];
    expect(ids(sortNotes(list, 'manual'))).toBe('dcba');
  });

  test('a drag between placed notes moves only that note', () => {
    const list = [{ id: 'a', position: 0 }, { id: 'b', position: 1024 }, { id: 'c', position: 2048 }];
    const { patches, list: after } = drag(list, 'c', 1);
    expect(Object.keys(patches)).toEqual(['c']);
    expect(ids(after)).toBe('acb');
    expect(ids(drag(list, 'a', 2).list)).toBe('bca');
    expect(ids(drag(list, 'c', 0).list)).toBe('cab');
  });

  test('the first drag places the notes above where it lands, and the order holds', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const { patches, list: after } = drag(list, 'a', 2);
    expect(ids(after)).toBe('bcad');
    expect(Object.keys(patches).sort()).toEqual(['a', 'b', 'c', 'd']);
    // New notes on top of placed ones: dragging one down places only what it passes
    const mixed = [{ id: 'n' }, { id: 'p', position: 0 }, { id: 'q', position: 1024 }];
    const moved = drag(mixed, 'n', 1);
    expect(ids(moved.list)).toBe('pnq');
    expect(Object.keys(moved.patches)).toEqual(['n']);
    expect(ids(drag(mixed, 'q', 0).list)).toBe('qnp');
  });
});

describe('folders', () => {
  test('group by folder by name, notes in no folder last', () => {
    const notes = [{ id: 'a', folder: 'Work' }, { id: 'b' }, { id: 'c', folder: 'home' }, { id: 'd', folder: 'Work' }];
    expect(groupNotes(notes, 'folder', {}).map(g => [g.folder, g.notes.map(n => n.id).join('')]))
      .toEqual([['home', 'c'], ['Work', 'ad'], [null, 'b']]);
  });
});
