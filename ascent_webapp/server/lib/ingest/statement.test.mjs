import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStatementImport, normalizeRow } from './statement.js';

const base = { scope: 'import:w1', userCurrency: 'ILS', cards: [], categorize: (r) => (r.type === 'Income' ? 'refunds' : 'other_expense') };
const run = (rows, existing = [], seenKeys = new Set()) => planStatementImport({ ...base, rows, existing, seenKeys });

test('rows are cleaned; unusable ones are counted, not thrown', () => {
  assert.equal(normalizeRow({ date: '2026-09-01', amount: '12.5', description: '  Aroma   #12 ' }, 'ILS').description, 'Aroma #12');
  assert.equal(normalizeRow({ date: '01/09/2026', amount: 5 }, 'ILS'), null);
  assert.equal(normalizeRow({ date: '2026-02-30', amount: 5 }, 'ILS'), null);
  assert.equal(normalizeRow({ date: '2026-09-01', amount: 0 }, 'ILS'), null);
  assert.equal(normalizeRow({ date: '2026-09-01', amount: 5, currency: 'usd' }, 'ILS').currency, 'USD');
  const plan = run([{ date: 'x', amount: 1 }, null, { date: '2026-09-01', amount: 10, description: 'Wolt' }]);
  assert.equal(plan.invalid, 2);
  assert.equal(plan.creates.length, 1);
});

test('a purchase already typed in or tapped is merged, never duplicated', () => {
  const existing = [
    { _id: 'm1', type: 'Expense', amount: 45.9, currency: 'ILS', date: '2026-09-01', description: 'coffee' },
    { _id: 'w1', type: 'Expense', amount: 120, currency: 'ILS', date: '2026-09-02', merchant: 'WOLT', occurredAt: new Date('2026-09-02T10:00:00Z'), ingest: { sources: [{ source: 'wallet' }] } },
  ];
  const plan = run([
    { date: '2026-09-02', amount: 45.9, description: 'ARCAFFE TLV' }, // posted a day late
    { date: '2026-09-03', amount: 120, description: 'WOLT TEL AVIV' },
    { date: '2026-09-03', amount: 77, description: 'SHUFERSAL' },
  ], existing);
  assert.deepEqual(plan.merges.map((m) => m.id), ['m1', 'w1']);
  // the manual row gets the merchant; the statement date never moves the purchase
  assert.deepEqual(plan.merges[0].set, { merchant: 'ARCAFFE TLV', merchantKey: 'arcaffe tlv' });
  assert.equal(plan.merges[1].entry.source, 'statement');
  assert.ok(plan.merges[1].entry.ref);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].description, 'SHUFERSAL');
  assert.equal(plan.creates[0].source, 'statement');
});

test('one existing row absorbs one statement row only', () => {
  const existing = [{ _id: 'm1', type: 'Expense', amount: 20, currency: 'ILS', date: '2026-09-01' }];
  const plan = run([
    { date: '2026-09-01', amount: 20, description: 'Cafe' },
    { date: '2026-09-01', amount: 20, description: 'Cafe' },
  ], existing);
  assert.equal(plan.merges.length, 1);
  assert.equal(plan.creates.length, 1); // two coffees that day: the second is new
});

test('importing the same file again changes nothing', () => {
  const rows = [
    { date: '2026-09-05', amount: 30, description: 'Pango' },
    { date: '2026-09-05', amount: 30, description: 'Pango' },
    { date: '2026-09-06', amount: -50, description: 'Refund ZARA' },
  ];
  const first = run(rows);
  assert.equal(first.creates.length, 3);
  const stored = new Set(first.creates.map((c) => c.dedupeKey));
  assert.equal(stored.size, 3);
  const again = run(rows, first.creates.map((c, i) => ({ ...c, _id: `n${i}` })), stored);
  assert.equal(again.creates.length, 0);
  assert.equal(again.merges.length, 0);
  assert.equal(again.duplicates, 3);
});

test('credits come in as income and are never merged into expenses', () => {
  const existing = [{ _id: 'm1', type: 'Expense', amount: 50, currency: 'ILS', date: '2026-09-06' }];
  const plan = run([{ date: '2026-09-06', amount: -50, description: 'Refund ZARA' }], existing);
  assert.equal(plan.merges.length, 0);
  assert.equal(plan.creates[0].type, 'Income');
  assert.equal(plan.creates[0].category, 'refunds');
  assert.equal(plan.creates[0].amount, 50);
});

test('the card on the row is matched to a saved card', () => {
  const cards = [{ _id: 'c1', lastFourDigits: '4580', isActive: true }];
  const plan = planStatementImport({ ...base, cards, rows: [{ date: '2026-09-01', amount: 10, description: 'X', card: '4580' }], existing: [], seenKeys: new Set() });
  assert.equal(plan.creates[0].cardId, 'c1');
  assert.equal(plan.creates[0].paymentMethod, 'Card');
});
