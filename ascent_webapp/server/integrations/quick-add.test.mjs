// The older single-key Apple Pay Shortcut: money parsing, key checks, membership, duplicates.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const KEY = 'ask_' + 'a'.repeat(48);
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

let db;
const chain = (v) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => v });
mock.module(at('../models/User.js'), {
  exports: {
    default: {
      findOne: async (q) => db.users.find((u) => u.shortcutTokenHash === q.shortcutTokenHash) || null,
      findById: (id) => chain(db.users.find((u) => u._id === id) || null),
      async updateOne(q, u) { db.userUpdates.push({ q, u }); },
    },
  },
});
mock.module(at('../models/Workspace.js'), {
  exports: { default: { findOne: (q) => chain(db.workspaces.find((w) => w._id === q._id && w.members.some((m) => m.userId === q.members.$elemMatch.userId && q.members.$elemMatch.status.$in.includes(m.status ?? null))) || null) } },
});
mock.module(at('../models/Category.js'), { exports: { default: { find: () => chain([{ name: 'groceries', nameKey: 'groceries', type: 'Expense' }, { name: 'other_expense', nameKey: 'other_expense', type: 'Expense' }]) } } });
mock.module(at('../models/Card.js'), { exports: { default: { find: () => chain([{ _id: 'c1', name: 'Max', lastFourDigits: '1234' }]) } } });
mock.module(at('../models/ExpenseTransaction.js'), {
  exports: {
    default: {
      findOne: () => chain(db.recent),
      find: () => chain([]),
      async create(doc) { const row = { _id: { toString: () => 'tx1' }, ...doc }; db.created.push(row); return row; },
    },
  },
});
mock.module(at('../lib/merchantRules.js'), { exports: { loadRules: async () => [], ruleKeyFor: () => 'shufersal' } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
let signedIn;
mock.module(at('../middleware/auth.js'), {
  exports: { authMiddleware: async (req, res) => { if (!signedIn) { res.status(401).json({}); return null; } req.workspace = { _id: 'w1' }; return signedIn; } },
});

const { default: handler, parseMoney } = await import('./quick-add.js');

const call = async (method, body, headers = {}) => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, body, headers, query: {} }, res);
  return res;
};
const shortcut = (body) => call('POST', body, { authorization: `Bearer ${KEY}` });

beforeEach(() => {
  signedIn = null;
  db = {
    users: [{ _id: 'u1', email: 'dana@x.test', currency: 'ILS', language: 'en', shortcutTokenHash: hash(KEY), shortcutWorkspaceId: 'w1' }],
    workspaces: [{ _id: 'w1', members: [{ userId: 'u1', status: 'accepted', role: 'owner' }] }],
    created: [], userUpdates: [], recent: null,
  };
});

test('money in the shapes Wallet and people send it', () => {
  assert.deepEqual(parseMoney('₪1,234.50'), { amount: 1234.5, currency: 'ILS' });
  assert.deepEqual(parseMoney('12,50 €'), { amount: 12.5, currency: 'EUR' });
  assert.deepEqual(parseMoney('USD 8'), { amount: 8, currency: 'USD' });
  assert.deepEqual(parseMoney('1.234,56'), { amount: 1234.56, currency: null });
  assert.deepEqual(parseMoney(19.9), { amount: 19.9, currency: null });
  assert.ok(Number.isNaN(parseMoney('free').amount));
});

test('a purchase is added to the key\'s workspace, attributed, with the card matched', async () => {
  const r = await shortcut({ merchant: 'Shufersal', amount: '₪42.90', card: 'Max •••• 1234' });
  assert.equal(r.code, 201);
  const [tx] = db.created;
  assert.equal(tx.workspaceId, 'w1');
  assert.equal(tx.created_by, 'dana@x.test');
  assert.equal(tx.source, 'wallet');
  assert.equal(tx.cardId, 'c1');
  assert.deepEqual([tx.amount, tx.currency, tx.amountInGlobalCurrency, tx.globalCurrency], [42.9, 'ILS', 42.9, 'ILS']);
});

test('an unknown key is refused', async () => {
  const r = await call('POST', { amount: 5 }, { authorization: `Bearer ask_${'b'.repeat(48)}` });
  assert.equal(r.code, 401);
  assert.equal(db.created.length, 0);
});

test('a key stops working when its owner leaves the household or loses the right to add expenses', async () => {
  db.workspaces[0].members = [];
  assert.equal((await shortcut({ amount: 5 })).code, 403);
  db.workspaces[0].members = [{ userId: 'u1', status: 'accepted', role: 'viewer', permissions: { editExpenses: false } }];
  assert.equal((await shortcut({ amount: 5 })).code, 403);
  db.workspaces[0].members = [{ userId: 'u1', status: 'pending', role: 'editor', permissions: { editExpenses: true } }];
  assert.equal((await shortcut({ amount: 5 })).code, 403);
  assert.equal(db.created.length, 0);
  db.workspaces[0].members = [{ userId: 'u1', status: 'accepted', role: 'editor', permissions: { editExpenses: true } }];
  assert.equal((await shortcut({ amount: 5 })).code, 201);
});

test('amounts must be positive and sane', async () => {
  for (const amount of ['0', '-5', 'lots', '99999999']) assert.equal((await shortcut({ amount })).code, 400, amount);
});

test('the automation firing twice within a minute and a half is one purchase', async () => {
  db.recent = { _id: { toString: () => 'tx0' }, category: 'groceries' };
  const r = await shortcut({ merchant: 'Shufersal', amount: '42.90' });
  assert.equal(r.body.data.duplicate, true);
  assert.equal(db.created.length, 0);
});

test('the Shortcut may only add; managing the key needs a signed-in app', async () => {
  assert.equal((await call('GET', undefined, { authorization: `Bearer ${KEY}` })).code, 405);
  assert.equal((await call('POST', {})).code, 401);
  signedIn = { _id: 'u1' };
  const made = await call('POST', {});
  assert.equal(made.code, 201);
  assert.match(made.body.data.token, /^ask_[0-9a-f]{48}$/);
  assert.equal(db.userUpdates[0].u.$set.shortcutTokenHash, hash(made.body.data.token));
  assert.equal((await call('DELETE')).body.data.revoked, true);
});
