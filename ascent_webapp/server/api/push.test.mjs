import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

let user;
let configured;
let upserts;
let removed;
let notified;
mock.module(at('../middleware/auth.js'), { exports: { authMiddleware: async () => user } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {} } });
mock.module(at('../lib/push.js'), {
  exports: { pushConfigured: () => configured, notifyUser: async (id, p) => { notified.push({ id, p }); return { sent: 1 }; } },
});
mock.module(at('../models/PushSubscription.js'), {
  exports: {
    default: {
      findOneAndUpdate: async (q, u, o) => { upserts.push({ q, u, o }); return {}; },
      deleteOne: async (q) => { removed.push(q); return {}; },
    },
  },
});
process.env.VAPID_PUBLIC_KEY = 'PUBKEY';
const { default: handler } = await import('./push.js');

beforeEach(() => {
  user = { _id: 'u1' };
  configured = true;
  upserts = [];
  removed = [];
  notified = [];
});

const call = async (method, { body, query = {} } = {}) => {
  const res = { code: 200, headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, headers: { 'user-agent': 'iPhone' }, query, body }, res);
  return res;
};
const sub = (o = {}) => ({ subscription: { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 's' }, ...o } });

test('needs a login', async () => {
  user = null;
  assert.equal((await call('GET')).body, undefined);
  assert.equal(upserts.length, 0);
});

test('reports whether push is set up and gives the public key', async () => {
  assert.deepEqual((await call('GET')).body.data, { enabled: true, publicKey: 'PUBKEY' });
  configured = false;
  assert.deepEqual((await call('GET')).body.data, { enabled: false, publicKey: null });
});

test('saves a subscription for the signed-in user, replacing an existing endpoint', async () => {
  const r = await call('POST', { body: sub() });
  assert.equal(r.code, 201);
  assert.deepEqual(upserts[0].q, { endpoint: 'https://push.example/x' });
  assert.equal(upserts[0].u.$set.userId, 'u1');
  assert.equal(upserts[0].u.$set.userAgent, 'iPhone');
  assert.equal(upserts[0].o.upsert, true);
});

test('rejects malformed subscriptions', async () => {
  for (const body of [undefined, {}, sub({ endpoint: 'http://insecure' }), sub({ endpoint: { $ne: 1 } }), sub({ keys: {} }), sub({ keys: { p256dh: 'k' } })]) {
    assert.equal((await call('POST', { body })).code, 400, JSON.stringify(body));
  }
  assert.equal(upserts.length, 0);
});

test('a test push goes to the signed-in user only', async () => {
  const r = await call('POST', { body: { test: true } });
  assert.equal(r.body.data.sent, 1);
  assert.equal(notified[0].id, 'u1');
});

test('nothing is saved or sent when the server has no VAPID keys', async () => {
  configured = false;
  assert.equal((await call('POST', { body: sub() })).code, 503);
  assert.equal((await call('POST', { body: { test: true } })).code, 503);
  assert.equal(upserts.length + notified.length, 0);
});

test('removing a subscription is limited to the caller and needs a plain endpoint', async () => {
  await call('DELETE', { query: { endpoint: 'https://push.example/x' } });
  assert.deepEqual(removed[0], { endpoint: 'https://push.example/x', userId: 'u1' });
  assert.equal((await call('DELETE', { query: { endpoint: { $ne: 1 } } })).code, 400);
  assert.equal((await call('PUT')).code, 405);
});
