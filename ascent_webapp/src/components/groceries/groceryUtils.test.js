import { describe, expect, test } from 'vitest';
import {
  boughtChanges, findByName, groupByAisle, guessItem, isTracked, learnedInterval, parseEntries, runningLow, supplyOf,
} from './groceryUtils';

const bought = (...dates) => dates.map((date, i) => ({ id: `p${i}`, date }));

describe('reading what was typed', () => {
  test('commas, "and" and quantities on either side', () => {
    expect(parseEntries('milk, 2 eggs, bread x3 and 1.5kg tomatoes')).toEqual([
      { name: 'milk', qty: '' },
      { name: 'eggs', qty: '2' },
      { name: 'bread', qty: '3' },
      { name: 'tomatoes', qty: '1.5kg' },
    ]);
  });

  test('Hebrew and Russian', () => {
    expect(parseEntries('חלב, 2 לחם וביצים')).toEqual([
      { name: 'חלב', qty: '' },
      { name: 'לחם', qty: '2' },
      { name: 'ביצים', qty: '' },
    ]);
    expect(parseEntries('молоко и хлеб 2 шт')).toEqual([
      { name: 'молоко', qty: '' },
      { name: 'хлеб', qty: '2 шт' },
    ]);
  });

  test('a number inside a name is not a quantity on its own', () => {
    expect(parseEntries('7up')).toEqual([{ name: '7up', qty: '' }]);
    expect(parseEntries('  ,  ')).toEqual([]);
  });
});

describe('guessing emoji and aisle', () => {
  test('by a whole word in any of the three languages', () => {
    expect(guessItem('Whole milk 3%')).toEqual({ emoji: '🥛', aisle: 'dairy' });
    expect(guessItem('החלב')).toEqual({ emoji: '🥛', aisle: 'dairy' });
    expect(guessItem('Помидоры черри')).toMatchObject({ aisle: 'produce' });
    expect(guessItem('toilet paper')).toMatchObject({ aisle: 'household' });
    expect(guessItem('bananas')).toMatchObject({ aisle: 'produce' });
  });

  test('not by part of a word', () => {
    expect(guessItem('Ricotta').aisle).not.toBe('pantry'); // not "rice"
    expect(guessItem('something new')).toEqual({ emoji: '', aisle: 'other' });
  });

  test('finding the household\'s own item ignores case and plurals', () => {
    const items = [{ id: '1', name: 'Eggs' }, { id: '2', name: 'Tomato' }];
    expect(findByName(items, 'eggs')?.id).toBe('1');
    expect(findByName(items, 'tomatoes')?.id).toBe('2');
    expect(findByName(items, 'milk')).toBeNull();
  });
});

describe('how long things last', () => {
  test('the median of the gaps between purchases', () => {
    expect(learnedInterval({ purchases: bought('2026-09-01') })).toBeNull();
    expect(learnedInterval({ purchases: bought('2026-09-01', '2026-09-08') })).toBe(7);
    // One very late purchase does not move it much
    expect(learnedInterval({ purchases: bought('2026-08-01', '2026-08-06', '2026-08-11', '2026-08-16', '2026-09-15') })).toBe(5);
    // Two on the same day count once
    expect(learnedInterval({ purchases: bought('2026-09-01', '2026-09-01', '2026-09-05') })).toBe(4);
  });

  test('tracked once bought twice, unless someone said otherwise', () => {
    expect(isTracked({ purchases: bought('2026-09-01') })).toBe(false);
    expect(isTracked({ purchases: bought('2026-09-01', '2026-09-08') })).toBe(true);
    expect(isTracked({ staple: false, purchases: bought('2026-09-01', '2026-09-08') })).toBe(false);
    expect(isTracked({ staple: true, purchases: [] })).toBe(true);
  });

  test('runs down from the last purchase over the usual interval', () => {
    const milk = { purchases: bought('2026-09-20', '2026-09-26') }; // lasts 6 days
    expect(supplyOf(milk, '2026-09-26')).toMatchObject({ share: 1, daysLeft: 6, status: 'ok', learned: true });
    expect(supplyOf(milk, '2026-09-29')).toMatchObject({ share: 0.5, daysLeft: 3, status: 'ok' });
    expect(supplyOf(milk, '2026-09-30')).toMatchObject({ daysLeft: 2, status: 'low', runsOutOn: '2026-10-02' });
    expect(supplyOf(milk, '2026-10-05')).toMatchObject({ share: 0, status: 'out' });
  });

  test('a level set by hand wins from that day on, until the next purchase', () => {
    const rice = { purchases: bought('2026-09-01', '2026-09-21'), level: 'low', levelAt: '2026-09-22T10:00:00Z' };
    expect(supplyOf(rice, '2026-09-22')).toMatchObject({ manual: true, status: 'low' });
    expect(supplyOf({ ...rice, level: 'out' }, '2026-09-22').status).toBe('out');
    const boughtAgain = { ...rice, purchases: bought('2026-09-01', '2026-09-21', '2026-09-25') };
    expect(supplyOf(boughtAgain, '2026-09-25')).toMatchObject({ manual: false, share: 1 });
  });

  test('a hand-set level with no history stays where it was put', () => {
    expect(supplyOf({ level: 'half', levelAt: '2026-09-01T00:00:00Z' }, '2026-09-30')).toMatchObject({ share: 0.5, daysLeft: null, status: 'ok' });
    expect(supplyOf({ name: 'x' }, '2026-09-30')).toMatchObject({ share: null, status: 'unknown' });
  });

  test('running low lists tracked staples off the list, emptiest first', () => {
    const items = [
      { id: 'a', purchases: bought('2026-09-20', '2026-09-26') }, // 2 days left on the 30th: low
      { id: 'b', purchases: bought('2026-09-01', '2026-09-11') }, // out
      { id: 'c', purchases: bought('2026-09-01', '2026-09-11'), onList: true }, // already listed
      { id: 'd', purchases: bought('2026-09-28') }, // not tracked yet
    ];
    expect(runningLow(items, '2026-09-30').map((r) => r.item.id)).toEqual(['b', 'a']);
  });
});

describe('the list', () => {
  test('grouped by aisle in walking order', () => {
    const groups = groupByAisle([
      { id: '1', aisle: 'household' },
      { id: '2', aisle: 'produce' },
      { id: '3', aisle: 'nonsense' },
      { id: '4', aisle: 'produce' },
    ]);
    expect(groups.map((g) => g.aisle)).toEqual(['produce', 'household', 'other']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['2', '4']);
  });

  test('buying takes it off the list, records the purchase and clears a hand-set level', () => {
    const item = { qty: '2', onList: true, inCart: true, level: 'low', purchases: bought('2026-09-01') };
    const changes = boughtChanges(item, { date: '2026-09-30', by: 'Dana', price: 12.9, currency: 'ILS' });
    expect(changes).toMatchObject({ onList: false, inCart: false, qty: '', level: null });
    expect(changes.purchases).toHaveLength(2);
    expect(changes.purchases[1]).toMatchObject({ date: '2026-09-30', qty: '2', price: 12.9, currency: 'ILS', by: 'Dana' });
  });
});
