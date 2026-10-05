import { describe, expect, it, test } from 'vitest';
import {
  basketEstimate, boughtChanges, findByName, findLoggedExpense, lineQty, groupByAisle, guessItem, isTracked, knownStores, learnedInterval, parseEntries,
  priceMovers, priceStats, purchasePriceChanges, runningLow, storeComparison, supplyOf,
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

describe('prices', () => {
  const buy = (date, price, store, currency = 'ILS') => ({ id: `${date}-${store}`, date, price, store, currency });
  const milk = { id: 'm', name: 'Milk', onList: true, purchases: [buy('2026-08-01', 6.9, 'Shufersal'), buy('2026-08-15', 5.9, 'Rami Levy'), buy('2026-09-01', 7.5, 'Shufersal')] };
  const eggs = { id: 'e', name: 'Eggs', onList: true, purchases: [buy('2026-08-01', 14, 'Shufersal'), buy('2026-09-01', 12, 'Rami Levy')] };
  const bread = { id: 'b', name: 'Bread', onList: true, purchases: [{ id: 'x', date: '2026-09-01', price: null }] };

  test('an item: last price, how it moved, its range and the cheapest shop', () => {
    const s = priceStats(milk);
    expect(s.last).toMatchObject({ price: 7.5, store: 'Shufersal' });
    // Against Shufersal's own earlier price, not Rami Levy's cheaper one
    expect(s.changeFromPrev).toBeCloseTo((7.5 - 6.9) / 6.9);
    expect(s.changeFromAvg).toBeCloseTo((7.5 - 6.9) / 6.9);
    expect([s.min, s.max]).toEqual([5.9, 7.5]);
    expect(s.cheapest).toMatchObject({ store: 'Rami Levy', avg: 5.9 });
    expect(s.saving).toBeCloseTo(1.6);
    expect(priceStats(bread)).toBeNull();
    // Bought at the cheapest shop already: nothing to save by going there
    const atCheapest = { purchases: [buy('2026-08-01', 7, 'Shufersal'), buy('2026-09-01', 6, 'Rami Levy'), buy('2026-09-08', 6.5, 'Rami Levy')] };
    expect(priceStats(atCheapest).saving).toBe(0);
  });

  test('prices in another currency are converted, or left out when they cannot be', () => {
    const item = { purchases: [buy('2026-09-01', 2, 'Duty free', 'USD'), buy('2026-09-02', 7, 'Shufersal')] };
    expect(priceStats(item, (p, c) => (c === 'USD' ? p * 3.7 : p)).min).toBeCloseTo(7);
    expect(priceStats(item, (p, c) => (c === 'USD' ? null : p)).points).toHaveLength(1);
  });

  test('the list: estimated at the last prices, or at the chosen shop where it was bought before', () => {
    expect(basketEstimate([milk, eggs, bread])).toEqual({ total: 19.5, priced: 2, missing: 1, atStore: 0 });
    expect(basketEstimate([milk, eggs, bread], { store: 'rami levy' })).toEqual({ total: 17.9, priced: 2, missing: 1, atStore: 2 });
  });

  test('shops compared on the things bought at both', () => {
    const [cheap, dear] = storeComparison([milk, eggs]);
    expect(cheap.store).toBe('Rami Levy');
    expect(cheap.index).toBeLessThan(1);
    expect(dear.store).toBe('Shufersal');
    expect(cheap.items).toBe(2);
  });

  test('prices that went up or down from usual', () => {
    const { up, down } = priceMovers([milk, eggs]);
    expect(up.map((x) => x.item.name)).toEqual(['Milk']);
    expect(down.map((x) => x.item.name)).toEqual(['Eggs']);
  });

  test('shops, most recent first; a purchase priced by hand; the shop kept on a purchase', () => {
    expect(knownStores([milk, eggs])).toEqual(['Shufersal', 'Rami Levy']);
    const changed = purchasePriceChanges(bread, 'x', { price: 9.9, currency: 'ILS', store: ' Victory ' });
    expect(changed.purchases[0]).toMatchObject({ price: 9.9, currency: 'ILS', store: 'Victory' });
    expect(boughtChanges({ purchases: [] }, { date: '2026-10-01', store: 'Osher Ad' }).purchases[0].store).toBe('Osher Ad');
  });
});

describe('findLoggedExpense', () => {
  const receipt = { total: 87.4, currency: 'ILS', date: '2026-10-05' };
  const tx = (over) => ({ id: 'x', type: 'Expense', amount: 87.4, currency: 'ILS', date: '2026-10-05', ...over });

  it('finds the Apple Pay payment for the same amount on the same day', () => {
    expect(findLoggedExpense([tx({ id: 'pay' })], receipt)?.id).toBe('pay');
  });
  it('allows a day or two either side and a few agorot of difference, preferring the closest day', () => {
    expect(findLoggedExpense([tx({ id: 'far', date: '2026-10-03' }), tx({ id: 'near', date: '2026-10-06', amount: 87.2 })], receipt)?.id).toBe('near');
  });
  it('ignores other amounts, older payments and income', () => {
    expect(findLoggedExpense([tx({ amount: 90 }), tx({ date: '2026-09-30' }), tx({ type: 'Income' })], receipt)).toBeNull();
  });
  it('compares another currency after converting it', () => {
    const convert = (amount, from) => (from === 'USD' ? amount * 3.7 : null);
    expect(findLoggedExpense([tx({ id: 'usd', currency: 'USD', amount: 23.6 })], receipt, convert)?.id).toBe('usd');
    expect(findLoggedExpense([tx({ currency: 'EUR' })], receipt, convert)).toBeNull();
  });
  it('has nothing to look for without a total or a date', () => {
    expect(findLoggedExpense([tx()], { ...receipt, total: null })).toBeNull();
  });
});

describe('lineQty', () => {
  it('says how many, or how much by weight, and nothing for a single one', () => {
    expect(lineQty({ qty: 3 }, 'en-US')).toBe('3');
    expect(lineQty({ qty: 1.25, unit: 'kg' }, 'en-US')).toBe('1.25 kg');
    expect(lineQty({ qty: 1 }, 'en-US')).toBeNull();
    expect(lineQty({ qty: null }, 'en-US')).toBeNull();
  });
});
