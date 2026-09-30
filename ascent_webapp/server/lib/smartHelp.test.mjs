import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCategory } from './categorize.js';
import { alertRecipients, amountIn, largeExpensePush } from './transactionHooks.js';
import { spendingSummary } from './spendingSummary.js';

const categories = [
  { name: 'groceries', type: 'Expense' },
  { name: 'food_dining', type: 'Expense' },
  { name: 'Pets', type: 'Expense' },
  { name: 'salary', type: 'Income' },
];

test('a learned merchant rule beats keywords and history', () => {
  const history = [{ type: 'Expense', description: 'Shufersal Deal', category: 'groceries' }];
  // keywords and history both say groceries...
  assert.equal(suggestCategory({ description: 'Shufersal Deal 0123', categories, history }).name, 'groceries');
  // ...but this household files it under Pets (it is where they buy pet food)
  const rules = [{ merchantKey: 'shufersal deal', type: 'Expense', category: 'Pets' }];
  assert.deepEqual(suggestCategory({ description: 'SHUFERSAL DEAL #0123', categories, history, rules }), { name: 'Pets', source: 'rule' });
});

test('rules for deleted categories or the other type are ignored', () => {
  const rules = [
    { merchantKey: 'aroma', type: 'Expense', category: 'Gone' },
    { merchantKey: 'aroma', type: 'Income', category: 'salary' },
  ];
  const s = suggestCategory({ description: 'Aroma', categories, rules });
  assert.notEqual(s?.source, 'rule');
});

test('a rule works even for very short merchant names', () => {
  const rules = [{ merchantKey: 'am', type: 'Expense', category: 'food_dining' }];
  assert.equal(suggestCategory({ description: 'AM', categories, rules })?.name, 'food_dining');
});

test('large-expense alerts go to members who can see expenses, never the payer', () => {
  const ws = {
    ownerId: 'o',
    members: [
      { userId: 'o', role: 'owner', status: 'accepted' },
      { userId: 'p', role: 'editor', status: 'accepted', permissions: { viewExpenses: true } },
      { userId: 'v', role: 'viewer', status: 'accepted', permissions: { viewExpenses: false } },
      { userId: 'q', role: 'editor', status: 'pending', permissions: { viewExpenses: true } },
    ],
  };
  assert.deepEqual(alertRecipients(ws, 'p').map((m) => m.userId), ['o']);
  assert.deepEqual(alertRecipients(ws, 'o').map((m) => m.userId), ['p']);
});

test('amounts compare in the alert currency when they can', () => {
  assert.equal(amountIn({ amount: 100, currency: 'ILS' }, 'ILS'), 100);
  assert.equal(amountIn({ amount: 100, currency: 'USD', amountInGlobalCurrency: 370 }, 'ILS'), 370);
  assert.equal(amountIn({ amount: 100, currency: 'USD' }, 'ILS'), null);
});

test('the alert reads naturally in each language', () => {
  const tx = { _id: '1', amount: 1200, currency: 'ILS', merchant: 'IKEA' };
  assert.match(largeExpensePush(tx, 'Dana', 'en').title, /^Dana spent .*1,200/);
  assert.match(largeExpensePush(tx, 'Dana', 'he').title, /^Dana הוציא\/ה/);
  assert.equal(largeExpensePush(tx, '', 'ru').body, 'IKEA');
});

test('the AI summary holds totals and patterns, not people', () => {
  const rows = [
    { type: 'Income', date: '2026-09-01', amount: 10000, category: 'salary', created_by: 'a@x' },
    { type: 'Expense', date: '2026-09-03', amount: 400, category: 'groceries', merchant: 'Shufersal', created_by: 'a@x' },
    { type: 'Expense', date: '2026-08-03', amount: 300, category: 'groceries', merchant: 'Shufersal', created_by: 'b@x' },
    { type: 'Expense', date: '2026-09-25', amount: 4000, category: 'rent', isRecurring: true, description: 'Rent' },
  ];
  const s = spendingSummary({ transactions: rows, today: '2026-09-10', currency: 'ILS', categoryName: (k) => k.toUpperCase() });
  assert.equal(s.thisMonth.spentSoFar, 400);
  assert.equal(s.thisMonth.stillCommitted, 4000);
  assert.equal(s.thisMonth.safeToSpend, 5600);
  assert.deepEqual(s.categoriesByMonth[0].categories, { GROCERIES: 400 }); // future rent is not spent yet
  assert.equal(s.topMerchantsLastMonth[0].name, 'Shufersal');
  assert.doesNotMatch(JSON.stringify(s), /@x/);
});
