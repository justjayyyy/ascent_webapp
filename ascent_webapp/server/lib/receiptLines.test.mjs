// A receipt's lines keep how many were bought and the price of one, worked out when only the line total is printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReceiptLines } from './receiptLines.js';

test('a line keeps its quantity, unit and the price of one', () => {
  assert.deepEqual(cleanReceiptLines([{ text: ' Milk 3% ', qty: 3, unit: null, unitPrice: 6.9, price: 20.7 }]), [
    { text: 'Milk 3%', qty: 3, unit: null, unitPrice: 6.9, price: 20.7 },
  ]);
});

test('the price of one is worked out from the line total when it is not printed', () => {
  const [line] = cleanReceiptLines([{ text: 'Tomatoes', qty: 1.25, unit: 'KG', unitPrice: null, price: 11.13 }]);
  assert.equal(line.unit, 'kg');
  assert.equal(line.unitPrice, 8.9);
});

test('nonsense is dropped: unknown units, negative or huge numbers, lines with no text', () => {
  const lines = cleanReceiptLines([
    { text: 'Bread', qty: -2, unit: 'boxes', unitPrice: -1, price: 1e9 },
    { text: '   ', qty: 1, price: 5 },
  ]);
  assert.deepEqual(lines, [{ text: 'Bread', qty: null, unit: null, unitPrice: null, price: null }]);
});

test('a match to the shopping list is kept only for an item on that list', () => {
  const ids = new Set(['a1']);
  const lines = cleanReceiptLines([{ text: 'Milk', qty: 1, price: 6.9, matchId: 'a1' }, { text: 'Eggs', qty: 1, price: 12, matchId: 'zz' }], { ids });
  assert.deepEqual(lines.map((l) => l.matchId), ['a1', null]);
});
