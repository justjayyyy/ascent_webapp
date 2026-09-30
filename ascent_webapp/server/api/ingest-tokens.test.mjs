// Runs the real /api/ingest-tokens handler against in-memory stand-ins for the models.
// Needs: node --test --experimental-test-module-mocks (see the test:server script).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { hashToken } from '../lib/ingest/tokens.js';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const oid = () => new mongoose.Types.ObjectId();

let db;
let auth; // what the real authMiddleware would attach for the current request

const chain = (value) => {
  const c = { select: () => c, sort: () => c, limit: () => c, lean: async () => value };
  return c;
};
const sameScope = (t, q) => String(t.userId) === String(q.userId) && String(t.workspaceId) === String(q.workspaceId);

mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      if (!auth.user) return null;
      req.workspace = auth.workspace;
      req.member = auth.member;
      return auth.user;
    },
  },
});
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => { db.calls.connected += 1; }, connectDB: async () => {} } });
mock.module(at('../models/IngestToken.js'), {
  exports: {
    default: {
      find: (q) => chain(db.tokens.filter((t) => sameScope(t, q) && !t.revokedAt)),
      countDocuments: async (q) => db.tokens.filter((t) => sameScope(t, q) && !t.revokedAt).length,
      async create(doc) {
        const t = { _id: oid(), created_date: new Date(), useCount: 0, lastUsedAt: null, revokedAt: null, ...doc };
        db.tokens.push(t);
        return { ...t, toObject: () => ({ ...t }) };
      },
      findOneAndUpdate(filter, update) {
        const t = db.tokens.find(
          (x) =>
            String(x._id) === String(filter._id) &&
            String(x.workspaceId) === String(filter.workspaceId) &&
            !x.revokedAt &&
            (filter.userId === undefined || String(x.userId) === String(filter.userId))
        );
        if (!t) return chain(null);
        Object.assign(t, update.$set);
        return chain(t);
      },
    },
  },
});
mock.module(at('../models/IngestEvent.js'), {
  exports: { default: { find: (q) => chain(db.events.filter((e) => sameScope(e, q))) } },
});

const { default: handler } = await import('./ingest-tokens.js');

/* ------------------------------------------------------------- fixtures */

const ME = { _id: oid(), email: 'me@example.com' };
const PARTNER = { _id: oid(), email: 'partner@example.com' };
const WS = { _id: oid() };
const OWNER = { userId: ME._id, role: 'owner', status: 'accepted' };
const EDITOR = { userId: PARTNER._id, role: 'editor', status: 'accepted', permissions: { editExpenses: true } };
const VIEWER = { userId: PARTNER._id, role: 'viewer', status: 'accepted', permissions: { viewExpenses: true, editExpenses: false } };

const as = (user, member, workspace = WS) => { auth = { user, workspace, member }; };

beforeEach(() => {
  db = { tokens: [], events: [], calls: { connected: 0 } };
  as(ME, OWNER);
});

const makeRes = () => ({
  code: 200, body: undefined, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});
async function call(method, { query = {}, body } = {}) {
  const res = makeRes();
  await handler({ method, headers: {}, query, body }, res);
  return res;
}
const create = (label) => call('POST', { body: { label } });

/* ---------------------------------------------------------------- access */

test('without a login nothing happens', async () => {
  auth = { user: null };
  const r = await call('GET');
  assert.equal(r.body, undefined);
  assert.equal(db.calls.connected, 0);
});

test('a request with no workspace context is refused', async () => {
  auth = { user: ME, workspace: undefined, member: undefined };
  assert.equal((await call('GET')).code, 400);
});

test('members who may not add expenses cannot manage tokens', async () => {
  as(PARTNER, VIEWER);
  for (const [method, opts] of [['GET', {}], ['POST', { body: { label: 'x' } }], ['DELETE', { query: { id: String(oid()) } }]]) {
    const r = await call(method, opts);
    assert.equal(r.code, 403, method);
  }
  assert.equal(db.tokens.length, 0);
});

/* ---------------------------------------------------------------- create */

test('creating a token returns the secret once and stores only its hash', async () => {
  const r = await create('  Meres iPhone  ');
  assert.equal(r.code, 201);
  const data = r.body.data;
  assert.match(data.token, /^asc_[A-Za-z0-9_-]{43}$/);
  assert.equal(data.label, 'Meres iPhone');
  assert.equal(data.prefix, data.token.slice(0, 8));
  assert.equal(data.useCount, 0);

  const stored = db.tokens[0];
  assert.equal(stored.tokenHash, hashToken(data.token));
  assert.ok(!JSON.stringify(stored).includes(data.token), 'the plaintext is never stored');
  assert.equal(String(stored.userId), String(ME._id));
  assert.equal(String(stored.workspaceId), String(WS._id));
});

test('a blank or non-text label falls back to a default, and long labels are cut', async () => {
  assert.equal((await create('   ')).body.data.label, 'iPhone');
  assert.equal((await call('POST', { body: { label: { $ne: 1 } } })).body.data.label, 'iPhone');
  assert.equal((await create('x'.repeat(200))).body.data.label.length, 60);
});

test('at most five active tokens per person and workspace', async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await create(`d${i}`)).code, 201);
  const sixth = await create('one too many');
  assert.equal(sixth.code, 409);
  assert.equal(sixth.body.error, 'token_limit');

  // revoking frees a slot
  const first = db.tokens[0];
  assert.equal((await call('DELETE', { query: { id: String(first._id) } })).code, 200);
  assert.equal((await create('again')).code, 201);
});

/* ------------------------------------------------------------------ list */

test('listing shows only my active tokens and never a secret or hash', async () => {
  await create('mine');
  as(PARTNER, EDITOR);
  await create('partners');
  as(ME, OWNER);
  const revoked = (await create('gone')).body.data;
  await call('DELETE', { query: { id: revoked.id } });

  const r = await call('GET');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.data.map((t) => t.label), ['mine']);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes('tokenHash'));
  assert.ok(!/asc_[A-Za-z0-9_-]{43}/.test(text));
  assert.deepEqual(Object.keys(r.body.data[0]).sort(), ['created_date', 'id', 'label', 'lastUsedAt', 'prefix', 'useCount']);
});

test('recent activity is mapped to a safe subset and scoped to me', async () => {
  db.events.push(
    { _id: oid(), userId: ME._id, workspaceId: WS._id, source: 'wallet', outcome: 'created', reason: '', summary: { merchant: 'Aroma', amount: 18, currency: 'ILS' }, transactionId: oid(), createdAt: new Date(), payload: { card: 'secret-ish' }, tokenId: oid() },
    { _id: oid(), userId: PARTNER._id, workspaceId: WS._id, source: 'wallet', outcome: 'created', createdAt: new Date() }
  );
  const r = await call('GET', { query: { activity: '1' } });
  assert.equal(r.body.data.length, 1);
  assert.deepEqual(Object.keys(r.body.data[0]).sort(), ['createdAt', 'id', 'outcome', 'reason', 'source', 'summary', 'transactionId']);
  assert.ok(!JSON.stringify(r.body).includes('secret-ish'));
});

/* ---------------------------------------------------------------- revoke */

test('revoking marks the token revoked and it disappears from the list', async () => {
  const { id } = (await create('phone')).body.data;
  const r = await call('DELETE', { query: { id } });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.data, { revoked: true, id });
  assert.ok(db.tokens[0].revokedAt instanceof Date);
  assert.equal((await call('GET')).body.data.length, 0);
  assert.equal((await call('DELETE', { query: { id } })).code, 404, 'already revoked');
});

test('an editor cannot revoke someone else’s token, an owner or admin can', async () => {
  const { id } = (await create('owners phone')).body.data;

  as(PARTNER, EDITOR);
  assert.equal((await call('DELETE', { query: { id } })).code, 404);
  assert.equal(db.tokens[0].revokedAt, null);

  as(ME, OWNER);
  const adminMember = { userId: PARTNER._id, role: 'admin', status: 'accepted' };
  as(PARTNER, adminMember);
  assert.equal((await call('DELETE', { query: { id } })).code, 200);
  assert.ok(db.tokens[0].revokedAt instanceof Date);
});

test('a token from another workspace cannot be revoked', async () => {
  const { id } = (await create('here')).body.data;
  as(ME, OWNER, { _id: oid() });
  assert.equal((await call('DELETE', { query: { id } })).code, 404);
});

test('malformed ids are rejected outright', async () => {
  for (const id of [undefined, 'x', '123', { $ne: null }, ['a'], '']) {
    const r = await call('DELETE', { query: { id } });
    assert.equal(r.code, 400, JSON.stringify(id));
  }
});

test('other methods are not allowed', async () => {
  assert.equal((await call('PUT')).code, 405);
});
