import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertAmount, amountInCurrency, conversionFields } from './money.js';

const RATES = { USD: 1, ILS: 3.7, EUR: 0.9 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('converts through the USD base in every direction', () => {
  close(convertAmount(10, 'USD', 'ILS', RATES), 37);
  close(convertAmount(37, 'ILS', 'USD', RATES), 10);
  close(convertAmount(9, 'EUR', 'ILS', RATES), 37);
  assert.equal(convertAmount(5, 'ILS', 'ILS', {}), 5);
});

test('missing rates give null instead of a wrong number', () => {
  assert.equal(convertAmount(10, 'GBP', 'ILS', RATES), null);
  assert.equal(convertAmount(10, 'USD', 'ILS', {}), null);
  assert.equal(convertAmount(10, 'USD', 'ILS', undefined), null);
  assert.equal(convertAmount('x', 'USD', 'ILS', RATES), null);
});

test('a row in the viewer\'s currency is its own amount', () => {
  assert.equal(amountInCurrency({ amount: 18, currency: 'ILS', amountInGlobalCurrency: 999, globalCurrency: 'USD' }, 'ILS', RATES), 18);
  assert.equal(amountInCurrency({ amount: 18 }, 'ILS', RATES), 18);
});

test('a conversion saved into the viewer\'s currency keeps the day\'s rate', () => {
  assert.equal(amountInCurrency({ amount: 10, currency: 'USD', amountInGlobalCurrency: 35, globalCurrency: 'ILS' }, 'ILS', RATES), 35);
});

test('a conversion saved into someone else\'s currency is not mistaken for the viewer\'s', () => {
  // Saved by a member who keeps the books in EUR; the viewer uses ILS
  close(amountInCurrency({ amount: 10, currency: 'USD', amountInGlobalCurrency: 9, globalCurrency: 'EUR' }, 'ILS', RATES), 37);
});

test('older rows without globalCurrency keep their stored conversion, but only into the viewer currency', () => {
  const old = { amount: 10, currency: 'USD', amountInGlobalCurrency: 36 };
  assert.equal(amountInCurrency(old, 'ILS', RATES), 36);
  assert.equal(amountInCurrency(old, 'ILS', RATES, { legacyCurrency: 'ILS' }), 36);
  close(amountInCurrency(old, 'EUR', RATES, { legacyCurrency: 'ILS' }), 9); // a plan kept in EUR
});

test('a foreign row with no stored conversion uses today\'s rate, or null without one', () => {
  close(amountInCurrency({ amount: 10, currency: 'USD', amountInGlobalCurrency: null }, 'ILS', RATES), 37);
  assert.equal(amountInCurrency({ amount: 10, currency: 'USD' }, 'ILS', {}), null);
  assert.equal(amountInCurrency(null, 'ILS', RATES), null);
});

test('what to store with a new row', () => {
  const f = conversionFields(10, 'USD', 'ILS', RATES);
  assert.deepEqual(f, { amountInGlobalCurrency: 37, exchangeRate: 3.7, globalCurrency: 'ILS' });
  assert.deepEqual(conversionFields(10, 'ILS', 'ILS', RATES), { amountInGlobalCurrency: 10, exchangeRate: 1, globalCurrency: 'ILS' });
  assert.deepEqual(conversionFields(10, 'GBP', 'ILS', RATES), { amountInGlobalCurrency: null, exchangeRate: null, globalCurrency: null });
});
