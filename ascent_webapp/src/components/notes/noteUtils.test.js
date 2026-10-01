import { describe, expect, test } from 'vitest';
import {
  noteToText, searchableText, textToItems, itemsToText, isEmptyNote, distribute, formatBytes, nextOccurrence,
  extractLinks, linkHost, matchesFilter, isPreviewable, toLocalInput, reminderPresets, fmt, base64ToBlob,
} from './noteUtils';

const list = (items, extra = {}) => ({ type: 'checklist', items: items.map((text, i) => ({ id: `i${i}`, text, done: i === 0 })), ...extra });

describe('text and lists', () => {
  test('a note as plain text, lists with their check marks', () => {
    expect(noteToText({ title: 'Trip', content: 'Pack' })).toBe('Trip\nPack');
    expect(noteToText(list(['milk', 'eggs'], { title: 'Shop' }))).toBe('Shop\n[x] milk\n[ ] eggs');
    expect(noteToText({ title: 'T', content: 'c' }, { withTitle: false })).toBe('c');
  });

  test('lines become list items without their bullets or boxes, and back', () => {
    const items = textToItems('- milk\n* eggs\n[x] bread\n\n  • jam  ');
    expect(items.map((i) => i.text)).toEqual(['milk', 'eggs', 'bread', 'jam']);
    expect(itemsToText(items)).toBe('milk\neggs\nbread\njam');
    expect(textToItems('')).toHaveLength(1); // an empty list still has one line to type in
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
