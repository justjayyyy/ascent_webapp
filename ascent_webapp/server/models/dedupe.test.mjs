// The lists that save offline (budgets, plans, loans, settle-ups) take a device's "app:" key, and a
// second upload of the same row finds the first instead of adding a copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Budget from './Budget.js';
import Plan from './Plan.js';
import Commitment from './Commitment.js';
import Settlement from './Settlement.js';

for (const Model of [Budget, Plan, Commitment, Settlement]) {
  test(`${Model.modelName} keeps one row per offline key`, () => {
    assert.ok(Model.schema.path('dedupeKey'), 'has the field, so the API accepts it');
    const index = Model.schema.indexes().find(([fields]) => fields.dedupeKey === 1);
    assert.deepEqual(index[0], { workspaceId: 1, dedupeKey: 1 });
    assert.equal(index[1].unique, true);
    assert.deepEqual(index[1].partialFilterExpression, { dedupeKey: { $type: 'string' } });
  });
}
