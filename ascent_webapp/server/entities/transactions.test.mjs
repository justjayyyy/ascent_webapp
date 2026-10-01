// The transaction list filters the app relies on, cast by the real Mongoose model (no database needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import { rangeAndPresence } from '../lib/entityHandler.js';

const cast = (filter) => ExpenseTransaction.find(filter).cast(ExpenseTransaction);

test('every "has" view the app uses casts against the real schema', () => {
  for (const field of ['planId', 'commitmentId', 'installmentGroupId', 'split']) {
    const filter = rangeAndPresence(ExpenseTransaction, { has: field }, 'date');
    assert.equal(filter.invalid, undefined, field);
    assert.doesNotThrow(() => cast(filter), field);
  }
});

test('date windows cast against the real schema', () => {
  const filter = rangeAndPresence(ExpenseTransaction, { from: '2024-01-01', to: '2024-12-31' }, 'date');
  assert.doesNotThrow(() => cast(filter));
});
