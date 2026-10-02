import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, parseDsn, reportError, stackFrames, tunnelEnvelope, envelopeUrl } from './monitoring.js';

const DSN = 'https://abc123@o42.ingest.us.sentry.io/4507';
const recorder = () => {
  const sent = [];
  return { sent, fetchImpl: async (url, init) => { sent.push({ url, ...init }); return { ok: true }; } };
};

test('a DSN gives the project to send to; anything else is ignored', () => {
  const dsn = parseDsn(DSN);
  assert.deepEqual(dsn, { key: 'abc123', host: 'o42.ingest.us.sentry.io', projectId: '4507', origin: 'https://o42.ingest.us.sentry.io' });
  assert.equal(envelopeUrl(dsn), 'https://o42.ingest.us.sentry.io/api/4507/envelope/');
  for (const bad of ['', undefined, 'not a url', 'https://o42.ingest.sentry.io/4507', 'https://k@host/abc']) assert.equal(parseDsn(bad), null, String(bad));
});

test('without SENTRY_DSN nothing is sent', async () => {
  const r = recorder();
  assert.equal(await reportError(new Error('x'), { env: {}, fetchImpl: r.fetchImpl }), false);
  assert.equal(r.sent.length, 0);
});

test('an error is sent as one event, with the route but nothing personal', async () => {
  const r = recorder();
  const req = { method: 'POST', path: '/api/entities/transactions', query: { id: 'secret' }, body: { amount: 5 }, headers: { authorization: 'Bearer t' } };
  const err = new Error('boom');
  assert.equal(await reportError(err, { req, env: { SENTRY_DSN: DSN, VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abc' }, fetchImpl: r.fetchImpl }), true);
  const [call] = r.sent;
  assert.equal(call.url, 'https://o42.ingest.us.sentry.io/api/4507/envelope/');
  const [header, item, event] = call.body.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(header.dsn, DSN);
  assert.deepEqual(item, { type: 'event' });
  assert.equal(event.exception.values[0].value, 'boom');
  assert.equal(event.environment, 'production');
  assert.equal(event.release, 'abc');
  assert.deepEqual(event.request, { method: 'POST', url: '/api/entities/transactions' });
  assert.ok(!call.body.includes('secret') && !call.body.includes('Bearer') && !call.body.includes('"amount"'));
});

test('a failing Sentry never breaks the request that reported to it', async () => {
  const env = { SENTRY_DSN: DSN };
  assert.equal(await reportError(new Error('x'), { env, fetchImpl: async () => { throw new Error('down'); } }), false);
  assert.equal(await reportError('not an error', { env, fetchImpl: async () => ({ ok: true }) }), true);
});

test('stack frames come oldest first and mark library code', () => {
  const stack = 'Error: boom\n    at inner (file:///app/server/lib/a.js:10:5)\n    at outer (/app/node_modules/x/index.js:3:1)\n    at node:internal/process:1:1';
  const frames = stackFrames(stack);
  assert.deepEqual(frames.map((f) => [f.function, f.lineno, f.in_app]), [['<anonymous>', 1, false], ['outer', 3, false], ['inner', 10, true]]);
  assert.equal(buildEvent(new TypeError('t')).exception.values[0].type, 'TypeError');
});

test('the app\'s reports are passed on only to this app\'s own Sentry project', async () => {
  const env = { VITE_SENTRY_DSN: DSN };
  const envelope = (dsn) => `${JSON.stringify({ dsn })}\n{"type":"event"}\n{}\n`;
  const r = recorder();
  assert.equal(await tunnelEnvelope(envelope(DSN), { env, fetchImpl: r.fetchImpl }), true);
  assert.equal(r.sent[0].url, 'https://o42.ingest.us.sentry.io/api/4507/envelope/');
  for (const other of ['https://abc123@evil.example/4507', 'https://other@o42.ingest.us.sentry.io/4507', 'https://abc123@o42.ingest.us.sentry.io/1']) {
    assert.equal(await tunnelEnvelope(envelope(other), { env, fetchImpl: r.fetchImpl }), false, other);
  }
  assert.equal(await tunnelEnvelope('garbage', { env, fetchImpl: r.fetchImpl }), false);
  assert.equal(await tunnelEnvelope(envelope(DSN), { env: {}, fetchImpl: r.fetchImpl }), false);
  assert.equal(r.sent.length, 1);
});
