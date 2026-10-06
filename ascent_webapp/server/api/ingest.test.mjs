// Runs the real POST /api/ingest/:kind handler against in-memory stand-ins for the models.
// Needs: node --test --experimental-test-module-mocks (see the test:server script).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { newToken } from '../lib/ingest/tokens.js';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const oid = () => new mongoose.Types.ObjectId();

let db;
let limiter = { limited: false, calls: 0 };

const chain = (value) => {
  const c = { select: () => c, sort: () => c, limit: () => c, lean: async () => value };
  return c;
};

mock.module(at('../lib/push.js'), { exports: { notifyUser: async (userId, payload) => { pushed.push({ userId, payload }); }, pushConfigured: () => true } });
const pushed = [];

const models = {
  IngestToken: {
    findOne(q) {
      db.calls.tokenQuery = q;
      const now = new Date();
      return chain(db.tokens.find((t) => t.tokenHash === q.tokenHash && !t.revokedAt && (!t.expiresAt || t.expiresAt > now)) ?? null);
    },
    async updateOne(q, u) {
      db.calls.tokenUpdates.push({ q, u });
      const t = db.tokens.find((x) => String(x._id) === String(q._id));
      if (t) {
        Object.assign(t, u.$set);
        t.useCount = (t.useCount ?? 0) + (u.$inc?.useCount ?? 0);
      }
      return { acknowledged: true };
    },
  },
  User: { findById: (id) => chain(db.users.find((u) => String(u._id) === String(id)) ?? null) },
  Workspace: {
    findOne(q) {
      const ws = db.workspaces.find((w) => String(w._id) === String(q._id));
      const em = q.members?.$elemMatch;
      const ok = ws?.members?.some(
        (m) => String(m.userId) === String(em.userId) && (m.status === undefined || m.status === null || em.status.$in.includes(m.status))
      );
      return chain(ok ? ws : null);
    },
  },
  Card: {
    find() {
      let fields = null;
      const c = {
        select: (f) => { fields = f.split(/\s+/); return c; },
        lean: async () => db.cards.map((card) => (fields ? Object.fromEntries(['_id', ...fields].filter((k) => k in card).map((k) => [k, card[k]])) : card)),
      };
      return c;
    },
  },
  ExpenseTransaction: {
    findOne(q) {
      return chain(db.rows.find((r) => r.dedupeKey && r.dedupeKey === q.dedupeKey) ?? null);
    },
    find(q) {
      db.calls.candidateQuery = q;
      return chain(
        db.rows.filter(
          (r) => r.type === q.type && r.currency === q.currency && r.amount >= q.amount.$gte && r.amount <= q.amount.$lte && r.date >= q.date.$gte && r.date <= q.date.$lte
        )
      );
    },
    findOneAndUpdate(filter, update) {
      db.calls.mergeUpdate = { filter, update };
      if (db.mergeRace) return chain(null);
      const row = db.rows.find((r) => String(r._id) === String(filter._id));
      const guard = filter['ingest.sources.source']?.$ne;
      if (!row || (row.ingest?.sources ?? []).some((s) => s.source === guard)) return chain(null);
      row.ingest.sources.push(update.$push['ingest.sources']);
      Object.assign(row, update.$set ?? {});
      return chain(row);
    },
    async create(doc) {
      if (db.raceOnCreate) {
        db.rows.push({ _id: oid(), ...doc, dedupeKey: doc.dedupeKey }); // the concurrent request that won
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      if (doc.dedupeKey && db.rows.some((r) => r.dedupeKey === doc.dedupeKey)) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      const row = { _id: oid(), ...doc };
      db.rows.push(row);
      return row;
    },
  },
  Category: { find: () => chain(db.categories ?? []) },
  IngestEvent: {
    async countDocuments(q) {
      return db.events.filter((e) => String(e.tokenId) === String(q.tokenId) && e.createdAt >= q.createdAt.$gte).length;
    },
    async create(doc) {
      const e = { _id: oid(), createdAt: new Date(), ...doc };
      db.events.push(e);
      return e;
    },
  },
};

// Without this, merchant-rule lookups reach real Mongoose and wait out its 10 s buffer timeout
models.MerchantRule ??= { find: () => chain([]), findOne: () => chain(null), updateOne: async () => ({}) };

for (const [name, model] of Object.entries(models)) {
  mock.module(at(`../models/${name}.js`), { exports: { default: model } });
}
let rates = { USD: 1, ILS: 3.7, EUR: 0.9 }; // what the rate service answers (null: unreachable)
mock.module(at('../lib/rates.js'), { exports: { getRates: async () => rates } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
mock.module(at('../lib/rateLimit.js'), {
  exports: {
    authRateLimit: (req, res) => {
      limiter.calls += 1;
      if (!limiter.limited) return false;
      res.status(429).json({ success: false, error: 'too_many_attempts' });
      return true;
    },
  },
});

const { default: ingest } = await import('./ingest.js');

/* ------------------------------------------------------------- fixtures */

const NOW = () => new Date();
const iso = (offsetMs = 0) => {
  // Israel-style offset so the local date differs from UTC around midnight
  const d = new Date(Date.now() + offsetMs);
  const local = new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 19);
  return `${local}+03:00`;
};

const ME = { _id: oid(), email: 'me@example.com', currency: 'ILS' };
const WS = { _id: oid(), members: [{ userId: ME._id, role: 'owner', status: 'accepted' }] };
let TOKEN;
let TOKEN_DOC;

beforeEach(() => {
  TOKEN = newToken();
  TOKEN_DOC = { _id: oid(), userId: ME._id, workspaceId: WS._id, label: 'iPhone', prefix: TOKEN.prefix, tokenHash: TOKEN.tokenHash, revokedAt: null, expiresAt: null, useCount: 0 };
  limiter = { limited: false, calls: 0 };
  pushed.length = 0;
  db = {
    tokens: [TOKEN_DOC],
    users: [ME],
    workspaces: [{ ...WS, members: WS.members.map((m) => ({ ...m })) }],
    categories: [{ name: 'food_dining', nameKey: 'food_dining', type: 'Expense' }, { name: 'other_expense', nameKey: 'other_expense', type: 'Expense' }],
    cards: [{ _id: oid(), name: 'Isracard', lastFourDigits: '1234', isActive: true }],
    rows: [],
    events: [],
    mergeRace: false,
    raceOnCreate: false,
    calls: { tokenQuery: null, candidateQuery: null, mergeUpdate: null, tokenUpdates: [] },
  };
});

const makeRes = () => ({
  code: 200, body: undefined, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const payload = (o = {}) => ({ v: 1, merchant: 'Aroma Espresso Bar', amount: '₪18.00', card: 'Visa ••1234', at: iso(-60_000), ...o });

async function call(opts = {}) {
  const { kind = 'wallet', headers, method = 'POST' } = opts;
  const body = 'body' in opts ? opts.body : payload(); // an explicit undefined must stay undefined
  const res = makeRes();
  await ingest({ method, headers: headers ?? { authorization: `Bearer ${TOKEN.token}` }, query: { kind }, body }, res);
  return res;
}

/* ------------------------------------------------------------------ auth */

test('only POST is accepted, and only known sources', async () => {
  assert.equal((await call({ method: 'GET' })).code, 405);
  const unknown = await call({ kind: 'carrier-pigeon' });
  assert.equal(unknown.code, 404);
  assert.equal(unknown.body.error, 'unknown_source');
});

test('missing or malformed credentials are refused before the database is touched', async () => {
  for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: `Bearer ${TOKEN.token.slice(0, -1)}` }]) {
    const r = await call({ headers });
    assert.equal(r.code, 401);
    assert.deepEqual(r.body, { success: false, error: 'unauthorized' });
  }
  assert.equal(db.calls.tokenQuery, null);
  assert.equal(limiter.calls, 3, 'each failed attempt counts toward the per-IP throttle');
});

test('repeated failures hit the throttle, which answers instead of the handler', async () => {
  limiter.limited = true;
  const r = await call({ headers: {} });
  assert.equal(r.code, 429);
  assert.equal(r.body.error, 'too_many_attempts');
});

test('an unknown, revoked or expired token gets the same 401 as no token', async () => {
  const other = newToken();
  assert.equal((await call({ headers: { authorization: `Bearer ${other.token}` } })).code, 401);

  TOKEN_DOC.revokedAt = new Date();
  assert.equal((await call()).code, 401);

  TOKEN_DOC.revokedAt = null;
  TOKEN_DOC.expiresAt = new Date(Date.now() - 1000);
  const expired = await call();
  assert.equal(expired.code, 401);
  assert.deepEqual(expired.body, { success: false, error: 'unauthorized' });
  assert.equal(db.calls.tokenQuery.revokedAt, null, 'the query itself excludes revoked tokens');
  assert.ok(db.calls.tokenQuery.$or, 'and expired ones');
});

test('a member who was removed, demoted to viewer or is still pending gets 403 and the attempt is logged', async () => {
  const cases = {
    removed: [],
    viewer: [{ userId: ME._id, role: 'viewer', status: 'accepted', permissions: { viewExpenses: true, editExpenses: false } }],
    pending: [{ userId: ME._id, role: 'editor', status: 'pending', permissions: { editExpenses: true } }],
  };
  for (const [name, members] of Object.entries(cases)) {
    db.workspaces[0].members = members;
    db.events = [];
    const r = await call();
    assert.equal(r.code, 403, name);
    assert.deepEqual(r.body, { success: false, error: 'forbidden' }, name);
    assert.equal(db.events[0]?.outcome, 'forbidden', name);
    assert.equal(db.rows.length, 0, name);
  }
});

test('an editor with editExpenses may submit', async () => {
  db.workspaces[0].members = [{ userId: ME._id, role: 'editor', status: 'accepted', permissions: { editExpenses: true } }];
  assert.equal((await call()).code, 201);
});

/* -------------------------------------------------------------- happy path */

test('a wallet tap becomes a pending expense with everything filled in', async () => {
  const r = await call();
  assert.equal(r.code, 201);
  assert.equal(r.body.success, true);
  assert.deepEqual(Object.keys(r.body.data).sort(), ['id', 'outcome']);
  assert.equal(r.body.data.outcome, 'created');

  assert.equal(db.rows.length, 1);
  const row = db.rows[0];
  assert.equal(String(row._id), r.body.data.id);
  assert.equal(String(row.workspaceId), String(WS._id));
  assert.equal(String(row.createdBy), String(ME._id));
  assert.equal(row.created_by, 'me@example.com');
  assert.equal(row.type, 'Expense');
  assert.equal(row.status, 'pending');
  assert.equal(row.source, 'wallet');
  assert.equal(row.amount, 18);
  assert.equal(row.currency, 'ILS');
  assert.equal(row.amountInGlobalCurrency, 18);
  assert.equal(row.category, 'other_expense');
  assert.equal(row.description, 'Aroma Espresso Bar');
  assert.equal(row.merchantKey, 'aroma espresso bar');
  assert.equal(row.paymentMethod, 'Card');
  assert.equal(row.cardId, String(db.cards[0]._id), 'matched by the last four digits');
  assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(row.occurredAt instanceof Date);
  assert.equal(typeof row.dedupeKey, 'string');
  assert.deepEqual(row.ingest.sources.map((s) => s.source), ['wallet']);
  assert.deepEqual(row.ingest.flags, []);
});

test('the category is suggested from the merchant, with a fallback', async () => {
  await call({ body: payload({ merchant: 'Starbucks' }) });
  assert.equal(db.rows[0].category, 'food_dining');
  await call({ body: payload({ merchant: 'Zzzq Corp', at: iso(-30 * 60_000) }) });
  assert.equal(db.rows[1].category, 'other_expense');
});

test('with no suggestion the workspace own "other" or first expense category is used', async () => {
  db.categories = [{ name: 'Groceries', type: 'Expense' }, { name: 'Other', type: 'Expense' }, { name: 'Salary', type: 'Income' }];
  await call({ body: payload({ merchant: 'Zzzq Corp' }) });
  assert.equal(db.rows[0].category, 'Other');
  db.categories = [{ name: 'Groceries', type: 'Expense' }];
  await call({ body: payload({ merchant: 'Zzzq Corp', at: iso(-30 * 60_000) }) });
  assert.equal(db.rows[1].category, 'Groceries');
});

test('a new payment sends one push to its owner, and nothing else does', async () => {
  await call();
  assert.equal(pushed.length, 1);
  assert.equal(String(pushed[0].userId), String(ME._id));
  assert.equal(pushed[0].payload.title, 'Aroma Espresso Bar');
  assert.match(pushed[0].payload.body, /18\.00.*Needs review/);
  assert.equal(pushed[0].payload.url, '/Expenses');
  await call();                                              // replay: duplicate
  await call({ body: payload({ amount: 'x' }) });            // rejected
  assert.equal(pushed.length, 1);
});

test('the request is recorded and the token shows activity', async () => {
  await call();
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].outcome, 'created');
  assert.deepEqual(db.events[0].summary, { merchant: 'Aroma Espresso Bar', amount: 18, currency: 'ILS' });
  assert.equal(db.events[0].payload.card, 'Visa ••1234');
  assert.ok(TOKEN_DOC.lastUsedAt instanceof Date);
  assert.equal(TOKEN_DOC.useCount, 1);
});

test('a foreign currency keeps its own currency and the conversion at the rate of that moment', async () => {
  await call({ body: payload({ amount: '€12,50' }) });
  assert.equal(db.rows[0].currency, 'EUR');
  assert.equal(db.rows[0].amount, 12.5);
  assert.equal(db.rows[0].amountInGlobalCurrency, 51.39); // 12.50 EUR / 0.9 * 3.7
  assert.equal(db.rows[0].globalCurrency, 'ILS');
});

test('with no rate to be had, a foreign purchase is still added and converted later by the app', async () => {
  rates = null;
  try {
    await call({ body: payload({ amount: '€12,50' }) });
    assert.equal(db.rows[0].amount, 12.5);
    assert.equal(db.rows[0].amountInGlobalCurrency, null);
    assert.equal(db.rows[0].globalCurrency, null);
  } finally {
    rates = { USD: 1, ILS: 3.7, EUR: 0.9 };
  }
});

test('nothing secret ever comes back', async () => {
  const bodies = [(await call()).body, (await call({ headers: {} })).body, (await call({ body: payload({ amount: 'x' }) })).body];
  const text = JSON.stringify(bodies);
  assert.ok(!text.includes(TOKEN.token));
  assert.ok(!text.includes(TOKEN.tokenHash));
});

/* ------------------------------------------------------------------ dedupe */

test('the same request replayed is answered as a duplicate and stores nothing new', async () => {
  const body = payload();
  const first = await call({ body });
  const second = await call({ body });
  assert.equal(second.code, 200);
  assert.equal(second.body.data.outcome, 'duplicate');
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(db.rows.length, 1);
  assert.equal(TOKEN_DOC.useCount, 1, 'a duplicate is not counted as a payment');
});

test('the trigger firing twice a few seconds apart is one purchase', async () => {
  await call({ body: payload({ at: iso(-60_000) }) });
  const echo = await call({ body: payload({ at: iso(-30_000) }) });
  assert.equal(echo.body.data.outcome, 'duplicate');
  assert.equal(db.rows.length, 1);
});

test('two identical purchases twenty minutes apart are two rows, not flagged', async () => {
  await call({ body: payload({ at: iso(-25 * 60_000) }) });
  const second = await call({ body: payload({ at: iso(-5 * 60_000) }) });
  assert.equal(second.body.data.outcome, 'created');
  assert.equal(db.rows.length, 2);
  assert.deepEqual(db.rows[1].ingest.flags, []);
});

test('a concurrent replay that wins the unique index is reported as the duplicate it is', async () => {
  db.raceOnCreate = true;
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(r.body.data.outcome, 'duplicate');
  assert.equal(db.rows.length, 1);
  assert.equal(r.body.data.id, String(db.rows[0]._id));
});

/* ----------------------------------------------------------- merge / flag */

const smsRow = (o = {}) => ({
  _id: oid(), workspaceId: WS._id, type: 'Expense', status: 'pending', source: 'sms', amount: 18, currency: 'ILS',
  date: iso(-120_000).slice(0, 10), occurredAt: new Date(Date.now() - 180_000), merchant: '', merchantKey: '', description: '', cardId: null,
  ingest: { sources: [{ source: 'sms', at: new Date(Date.now() - 180_000) }], flags: [] }, ...o,
});

test('a tap that another source already reported is merged into that row', async () => {
  const existing = smsRow();
  db.rows.push(existing);
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(r.body.data.outcome, 'merged');
  assert.equal(r.body.data.id, String(existing._id));
  assert.equal(db.rows.length, 1, 'no second row');
  assert.deepEqual(existing.ingest.sources.map((s) => s.source), ['sms', 'wallet']);
  assert.equal(existing.merchant, 'Aroma Espresso Bar', 'blank merchant filled in');
  assert.equal(existing.cardId, String(db.cards[0]._id), 'blank card filled in');
  assert.equal(existing.status, 'pending');
  assert.equal(db.calls.mergeUpdate.filter['ingest.sources.source'].$ne, 'wallet', 'a row absorbs each source once');
  assert.ok(db.events[0].gapMs > 0, 'the time gap is logged for tuning the window');
  assert.equal(TOKEN_DOC.useCount, 1);
});

test('losing the merge race falls back to a flagged row instead of dropping the payment', async () => {
  const existing = smsRow();
  db.rows.push(existing);
  db.mergeRace = true;
  const r = await call();
  assert.equal(r.code, 201);
  assert.equal(r.body.data.outcome, 'flagged');
  assert.equal(db.rows.length, 2);
  const created = db.rows[1];
  assert.ok(created.ingest.flags.includes('possibleDuplicate'));
  assert.equal(String(created.ingest.duplicateOf), String(existing._id));
});

test('a manual entry for the same amount that day is flagged, never merged or dropped', async () => {
  const manual = { _id: oid(), workspaceId: WS._id, type: 'Expense', status: 'confirmed', source: 'manual', amount: 18, currency: 'ILS', date: iso().slice(0, 10), occurredAt: null, cardId: null };
  db.rows.push(manual);
  const r = await call();
  assert.equal(r.body.data.outcome, 'flagged');
  assert.equal(db.rows.length, 2);
  assert.ok(db.rows[1].ingest.flags.includes('possibleDuplicate'));
  assert.equal(String(db.rows[1].ingest.duplicateOf), String(manual._id));
});

/* --------------------------------------------------------- bad payloads */

test('an unreadable amount is rejected with a reason, recorded, and creates nothing', async () => {
  const r = await call({ body: payload({ amount: 'free' }) });
  assert.equal(r.code, 422);
  assert.deepEqual(r.body, { success: false, error: 'amount_unreadable' });
  assert.equal(db.rows.length, 0);
  assert.equal(db.events[0].outcome, 'rejected');
  assert.equal(db.events[0].reason, 'amount_unreadable');
  assert.equal(db.events[0].payload.amount, 'free');
  assert.equal(TOKEN_DOC.useCount, 0);
  assert.ok(TOKEN_DOC.lastUsedAt instanceof Date, 'but the device was heard from');
});

test('operator-shaped values are treated as unreadable, not passed on', async () => {
  for (const amount of [{ $gt: 0 }, ['5'], null]) {
    const r = await call({ body: payload({ amount }) });
    assert.equal(r.code, 422, JSON.stringify(amount));
  }
  assert.equal(db.rows.length, 0);
});

test('a missing or non-object body is rejected', async () => {
  for (const body of [undefined, null, 'text', []]) {
    const r = await call({ body });
    assert.equal(r.code, 422);
    assert.equal(r.body.error, 'invalid_body');
  }
});

/* ------------------------------------------------------------ rate limit */

test('a token that sent 60 requests in ten minutes is told to slow down, and nothing is stored', async () => {
  for (let i = 0; i < 60; i += 1) db.events.push({ tokenId: TOKEN_DOC._id, createdAt: NOW(), outcome: 'created' });
  const r = await call();
  assert.equal(r.code, 429);
  assert.equal(r.body.error, 'rate_limited');
  assert.equal(r.headers['Retry-After'], '600');
  assert.equal(db.rows.length, 0);
  assert.equal(db.events.length, 60, 'refused requests are not logged, so a flood cannot grow the log');
});

test('requests older than the window do not count', async () => {
  for (let i = 0; i < 60; i += 1) db.events.push({ tokenId: TOKEN_DOC._id, createdAt: new Date(Date.now() - 11 * 60_000), outcome: 'created' });
  assert.equal((await call()).code, 201);
});
