import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './google-calendar.js';

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
