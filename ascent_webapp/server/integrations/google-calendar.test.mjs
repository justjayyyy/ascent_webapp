import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './google-calendar.js';
import { forgetAccess, seal, unseal } from '../lib/calendarTokens.js';

function fakeGoogle(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) });
    const hit = routes.find(([m, re]) => m === init.method && re.test(url));
    const [, , status = 200, data = {}] = hit || [null, null, 404, { error: { message: 'nope' } }];
    return { ok: status < 300, status, json: async () => data };
  };
  return { calls, fetchImpl };
}

async function call(handler, { method = 'GET', query = {}, body, token = 'g-token' } = {}) {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return res;
}

test('needs the person\'s Google token and a known action with the right method', async () => {
  const h = createHandler(fakeGoogle([]).fetchImpl);
  assert.equal((await call(h, { query: { action: 'list-calendars' }, token: null })).code, 401);
  assert.equal((await call(h, { query: { action: 'drop-database' } })).code, 400);
  assert.equal((await call(h, { method: 'GET', query: { action: 'create-event' } })).code, 405);
});

test('lists calendars and events with the token, ids encoded into the path', async () => {
  const g = fakeGoogle([
    ['GET', /calendarList$/, 200, { items: [{ id: 'primary' }] }],
    ['GET', /calendars\/a%2Fb%40x\.com\/events\?/, 200, { items: [{ id: 'e1' }] }],
  ]);
  const h = createHandler(g.fetchImpl);
  assert.deepEqual((await call(h, { query: { action: 'list-calendars' } })).body, [{ id: 'primary' }]);
  const r = await call(h, { query: { action: 'list-events', calendarId: 'a/b@x.com', maxResults: '99999' } });
  assert.deepEqual(r.body, [{ id: 'e1' }]);
  assert.equal(g.calls[1].auth, 'Bearer g-token');
  const qs = new URL(g.calls[1].url).searchParams;
  assert.equal(qs.get('maxResults'), '2500');
  assert.equal(qs.get('singleEvents'), 'true');
});

test('creates, updates and deletes events', async () => {
  const g = fakeGoogle([
    ['POST', /calendars\/primary\/events$/, 200, { id: 'new' }],
    ['PUT', /events\/e1$/, 200, { id: 'e1', summary: 'b' }],
    ['DELETE', /events\/e1$/, 204],
  ]);
  const h = createHandler(g.fetchImpl);
  assert.deepEqual((await call(h, { method: 'POST', query: { action: 'create-event' }, body: { summary: 'a' } })).body, { id: 'new' });
  assert.deepEqual(g.calls[0].body, { summary: 'a' });
  assert.equal((await call(h, { method: 'PUT', query: { action: 'update-event', eventId: 'e1' }, body: { summary: 'b' } })).body.summary, 'b');
  assert.deepEqual((await call(h, { method: 'DELETE', query: { action: 'delete-event', eventId: 'e1' } })).body, { success: true });
  assert.equal((await call(h, { method: 'DELETE', query: { action: 'delete-event' } })).code, 400);
});

test('tasks from every list, tagged with their list; failures mean no tasks rather than an error', async () => {
  const g = fakeGoogle([
    ['GET', /users\/@me\/lists\?/, 200, { items: [{ id: 'L1', title: 'Home' }, { id: 'L2', title: 'Broken' }] }],
    ['GET', /lists\/L1\/tasks/, 200, { items: [{ id: 't1' }] }],
    ['GET', /lists\/L2\/tasks/, 500, {}],
  ]);
  const r = await call(createHandler(g.fetchImpl), { query: { action: 'list-tasks' } });
  assert.deepEqual(r.body, [{ id: 't1', taskListId: 'L1', taskListTitle: 'Home' }]);
  const none = await call(createHandler(fakeGoogle([['GET', /lists/, 403, {}]]).fetchImpl), { query: { action: 'list-tasks' } });
  assert.deepEqual(none.body, []);
});

test('a new task goes to the first list, creating one when there is none', async () => {
  const g = fakeGoogle([
    ['GET', /users\/@me\/lists\?/, 200, { items: [] }],
    ['POST', /users\/@me\/lists$/, 200, { id: 'made' }],
    ['POST', /lists\/made\/tasks$/, 200, { id: 't9' }],
  ]);
  const r = await call(createHandler(g.fetchImpl), { method: 'POST', query: { action: 'create-task' }, body: { title: 'x' } });
  assert.deepEqual(r.body, { id: 't9' });
});

test('Google errors map to clear statuses', async () => {
  for (const [status, expected] of [[401, 401], [403, 403], [404, 404], [500, 502]]) {
    const h = createHandler(fakeGoogle([['GET', /calendarList/, status, { error: { message: 'x' } }]]).fetchImpl);
    assert.equal((await call(h, { query: { action: 'list-calendars' } })).code, expected, String(status));
  }
});

// ---- The connection kept on the account ----------------------------------

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    find: async (id) => rows.get(String(id)) || null,
    save: async (id, refreshToken, scope) => { rows.set(String(id), { refreshToken, scope }); },
    remove: async (id) => { rows.delete(String(id)); },
  };
}

// Google's token, revoke and calendar endpoints; `refresh` decides what the refresh grant answers
function fakeOAuth({ codeGrant = { refresh_token: 'r1', access_token: 'a1', expires_in: 3600, scope: 'cal' }, refresh = { status: 200, data: { access_token: 'a2', expires_in: 3600 } } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const form = init.headers['Content-Type']?.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    calls.push({ url, method: init.method, auth: init.headers.Authorization, form });
    const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
    if (url.endsWith('/token') && form.grant_type === 'authorization_code') return reply(200, codeGrant);
    if (url.endsWith('/token')) return reply(refresh.status, refresh.data);
    if (url.endsWith('/revoke')) return reply(200, {});
    if (/calendarList$/.test(url)) return reply(200, { items: [{ id: 'primary', token: init.headers.Authorization }] });
    return reply(404, {});
  };
  return { calls, fetchImpl };
}

let nextUser = 0;
function serverSetup(opts) {
  const user = { _id: `u${(nextUser += 1)}` };
  const store = memoryStore();
  const g = fakeOAuth(opts);
  const h = createHandler(g.fetchImpl, { authenticate: async () => user, store, client: () => ({ id: 'cid', secret: 'sec' }) });
  return { user, store, g, h };
}

test('connecting keeps an encrypted refresh token on the account, and the calendar works without a browser token', async () => {
  const { store, g, h } = serverSetup();
  assert.deepEqual((await call(h, { query: { action: 'status' }, token: null })).body, { available: true, connected: false });
  const r = await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c0de' }, token: null });
  assert.deepEqual(r.body, { connected: true });
  const exchange = g.calls.find((c) => c.form?.grant_type === 'authorization_code');
  assert.deepEqual(exchange.form, { code: 'c0de', client_id: 'cid', client_secret: 'sec', redirect_uri: 'postmessage', grant_type: 'authorization_code' });
  const [row] = store.rows.values();
  assert.ok(row.refreshToken && !row.refreshToken.includes('r1'), 'stored sealed, never in plain text');

  assert.deepEqual((await call(h, { query: { action: 'status' }, token: null })).body, { available: true, connected: true });
  const list = await call(h, { query: { action: 'list-calendars' }, token: null });
  assert.equal(list.body[0].token, 'Bearer a1', 'the access token from connecting is reused while it lasts');
});

test('a new sign-in on another instance gets a fresh access token from the stored refresh token', async () => {
  const { user, store, g, h } = serverSetup();
  await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c' }, token: null });
  forgetAccess(user._id);
  const list = await call(h, { query: { action: 'list-calendars' }, token: null });
  assert.equal(list.body[0].token, 'Bearer a2');
  const grant = g.calls.find((c) => c.form?.grant_type === 'refresh_token');
  assert.equal(grant.form.refresh_token, 'r1');
  assert.equal(store.rows.size, 1);
});

test('without a connection, or once access was taken back in Google, the app is told to connect', async () => {
  const fresh = serverSetup();
  const none = await call(fresh.h, { query: { action: 'list-calendars' }, token: null });
  assert.equal(none.code, 401);
  assert.equal(none.body.code, 'CALENDAR_NOT_CONNECTED');

  const { user, store, h } = serverSetup({ refresh: { status: 400, data: { error: 'invalid_grant' } } });
  await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c' }, token: null });
  forgetAccess(user._id);
  const gone = await call(h, { query: { action: 'list-calendars' }, token: null });
  assert.equal(gone.body.code, 'CALENDAR_NOT_CONNECTED');
  assert.equal(store.rows.size, 0);
});

test('disconnecting removes the connection and revokes it with Google', async () => {
  const { store, g, h } = serverSetup();
  await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c' }, token: null });
  const r = await call(h, { method: 'POST', query: { action: 'disconnect' }, token: null });
  assert.deepEqual(r.body, { connected: false });
  assert.equal(store.rows.size, 0);
  assert.equal(g.calls.find((c) => c.url.endsWith('/revoke')).form.token, 'r1');
});

test('a grant without a refresh token is dropped so the next try gets one', async () => {
  const { store, g, h } = serverSetup({ codeGrant: { access_token: 'a1', expires_in: 3600 } });
  const r = await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c' }, token: null });
  assert.equal(r.code, 409);
  assert.equal(r.body.code, 'try_again');
  assert.equal(g.calls.find((c) => c.url.endsWith('/revoke')).form.token, 'a1');
  assert.equal(store.rows.size, 0);
});

test('a deployment without a client secret says the account connection is unavailable', async () => {
  const h = createHandler(fakeOAuth().fetchImpl, { authenticate: async () => ({ _id: 'x' }), store: memoryStore(), client: () => null });
  assert.deepEqual((await call(h, { query: { action: 'status' }, token: null })).body, { available: false, connected: false });
  assert.equal((await call(h, { method: 'POST', query: { action: 'connect' }, body: { code: 'c' }, token: null })).code, 501);
});

test('refresh tokens are sealed with the server secret', () => {
  const env = { JWT_SECRET: 'one' };
  const sealed = seal('refresh-me', env);
  assert.equal(unseal(sealed, env), 'refresh-me');
  assert.equal(unseal(sealed, { JWT_SECRET: 'two' }), null);
  assert.equal(unseal(`${sealed.slice(0, -2)}xx`, env), null);
});
