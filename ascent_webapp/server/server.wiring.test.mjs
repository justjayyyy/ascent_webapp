// Drives the real Express app over HTTP to check the route wiring for automation ingest.
// Every request here is answered before any database query, so no database is needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.VERCEL = '1'; // importing the app must not start listening
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/ascent-wiring-test'; // never connected

const { default: app } = await import('./server.js');

let server;
let base;
before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const send = async (path, { method = 'POST', body, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body });
  return { code: res.status, json: await res.json() };
};

test('malformed JSON gets a JSON error, not an HTML stack page', async () => {
  const r = await send('/api/ingest/wallet', { body: '{"merchant": ' });
  assert.equal(r.code, 400);
  assert.deepEqual(r.json, { success: false, error: 'invalid_json' });
});

test('the ingest route has its own small body limit', async () => {
  const r = await send('/api/ingest/wallet', { body: JSON.stringify({ merchant: 'x'.repeat(9000) }) });
  assert.equal(r.code, 413);
  assert.deepEqual(r.json, { success: false, error: 'payload_too_large' });
});

test('a valid body without credentials is refused', async () => {
  const r = await send('/api/ingest/wallet', { body: JSON.stringify({ v: 1, amount: '₪18.00' }) });
  assert.equal(r.code, 401);
  assert.deepEqual(r.json, { success: false, error: 'unauthorized' });
});

test('a login JWT is not accepted where an ingest token is expected', async () => {
  const r = await send('/api/ingest/wallet', {
    body: JSON.stringify({ v: 1, amount: '₪18.00' }),
    headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc' },
  });
  assert.equal(r.code, 401);
});

test('unknown sources are 404 and other methods are 405', async () => {
  assert.equal((await send('/api/ingest/carrier-pigeon', { body: '{}' })).code, 404);
  const get = await send('/api/ingest/wallet', { method: 'GET' });
  assert.equal(get.code, 405);
  assert.equal(get.json.error, 'method_not_allowed');
});

test('token management requires a normal login', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const r = await send('/api/ingest-tokens', { method, body: method === 'POST' ? '{}' : undefined });
    assert.equal(r.code, 401, method);
  }
});

test('existing routes still work behind the new ones', async () => {
  const r = await send('/api/health', { method: 'GET' });
  assert.equal(r.code, 200);
  assert.equal(r.json.status, 'ok');
});
