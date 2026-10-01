import { describe, expect, test } from 'vitest';
import { applyEntryChange, restoreEntry } from './listEntries';

const list = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }];

describe('applyEntryChange', () => {
  test('put replaces an entry with the same id in place', () => {
    expect(applyEntryChange(list, { op: 'put', item: { id: 'b', n: 9 } })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 9 }, { id: 'c', n: 3 }]);
  });
  test('put adds a new entry at the end, or at a position', () => {
    expect(applyEntryChange(list, { op: 'put', item: { id: 'd' } }).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyEntryChange(list, { op: 'put', item: { id: 'd' }, at: 1 }).map((e) => e.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(applyEntryChange(undefined, { op: 'put', item: { id: 'd' } })).toEqual([{ id: 'd' }]);
  });
  test('patch merges fields into one entry; remove drops it; nothing else changes', () => {
    expect(applyEntryChange(list, { op: 'patch', id: 'a', changes: { n: 5, s: 'paid' } })[0]).toEqual({ id: 'a', n: 5, s: 'paid' });
    expect(applyEntryChange(list, { op: 'remove', id: 'b' }).map((e) => e.id)).toEqual(['a', 'c']);
    expect(applyEntryChange(list, { op: 'patch', id: 'zz', changes: { n: 0 } })).toEqual(list);
    expect(list).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }]);
  });
  test('undoing a removal puts the entry back where it was', () => {
    const undo = restoreEntry(list, list[1]);
    expect(undo).toEqual({ op: 'put', item: list[1], at: 1 });
    expect(applyEntryChange(applyEntryChange(list, { op: 'remove', id: 'b' }), undo)).toEqual(list);
  });
});
