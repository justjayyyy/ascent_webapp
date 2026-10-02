// The session cookie: what it is set with, how it is read, and how the auth middleware uses it.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
process.env.JWT_SECRET = 'test-secret';

const user = { _id: 'u1', email: 'dana@x.test', sessions: [{ id: 'live' }] };
mock.module(at('./mongodb.js'), { exports: { default: async () => {} } });
mock.module(at('../models/User.js'), { exports: { default: { findById: () => ({ lean: async () => ({ ...user }) }) } } });
mock.module(at('../models/Workspace.js'), { exports: { default: { findOne: () => ({ lean: async () => null }) } } });

const { setSessionCookie, clearSessionCookie, getTokenFromCookie, sessionToken } = await import('./sessionCookie.js');
const { authMiddleware } = await import('../middleware/auth.js');
const { signToken } = await import('./jwt.js');

const fakeRes = () => ({
  code: 200, headers: {},
  setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; },
  status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; },
});
const cookiesOf = (res) => [].concat(res.headers['Set-Cookie'] || []);

test('the cookie is HttpOnly, Strict, scoped to the API and lasts as long as the token', () => {
  const res = fakeRes();
  const token = signToken({ userId: 'u1', sid: 'live' });
  setSessionCookie({ headers: {} }, res, token, { env: { VERCEL: '1' } });
  const [cookie] = cookiesOf(res);
  assert.ok(cookie.startsWith(`ascent_session=${token}; Path=/api; `));
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Secure']) assert.ok(cookie.includes(part), part);
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)[1]);
  assert.ok(maxAge > 6.9 * 86400 && maxAge <= 7 * 86400);
});

test('plain-http local development gets a cookie it can keep (no Secure)', () => {
  const res = fakeRes();
  setSessionCookie({ headers: {} }, res, 'not-a-jwt', { env: {} });
  assert.ok(!cookiesOf(res)[0].includes('Secure'));
  assert.ok(cookiesOf(res)[0].includes('Max-Age=604800'));
});

test('clearing expires it, and keeps any cookie set before in the same answer', () => {
  const res = fakeRes();
  res.setHeader('Set-Cookie', 'other=1');
  clearSessionCookie({ headers: {} }, res, { env: {} });
  assert.deepEqual(cookiesOf(res).map((c) => c.split(';')[0]), ['other=1', 'ascent_session=']);
  assert.ok(cookiesOf(res)[1].includes('Max-Age=0'));
});

test('the token is read from among other cookies; the cookie wins over a header', () => {
  const req = { headers: { cookie: 'a=1; ascent_session=tok; b=2', authorization: 'Bearer old' } };
  assert.equal(getTokenFromCookie(req), 'tok');
  assert.deepEqual(sessionToken(req), { token: 'tok', fromCookie: true });
  assert.deepEqual(sessionToken({ headers: { authorization: 'Bearer old' } }), { token: 'old', fromCookie: false });
  assert.equal(getTokenFromCookie({ headers: { cookie: 'ascent_sessionX=1' } }), null);
  assert.equal(getTokenFromCookie({ headers: {} }), null);
});

test('the middleware accepts the cookie', async () => {
  const res = fakeRes();
  const req = { method: 'GET', headers: { cookie: `ascent_session=${signToken({ userId: 'u1', sid: 'live' })}` } };
  assert.equal((await authMiddleware(req, res))?._id, 'u1');
  assert.equal(req.sessionId, 'live');
  assert.deepEqual(cookiesOf(res), [], 'nothing to move');
});

test('a device on the old header is moved to the cookie', async () => {
  const res = fakeRes();
  const token = signToken({ userId: 'u1', sid: 'live' });
  assert.ok(await authMiddleware({ method: 'GET', headers: { authorization: `Bearer ${token}` } }, res));
  assert.ok(cookiesOf(res)[0].startsWith(`ascent_session=${token};`));
});

test('a change sent with the cookie from another site is refused', async () => {
  const cookie = `ascent_session=${signToken({ userId: 'u1', sid: 'live' })}`;
  const res = fakeRes();
  assert.equal(await authMiddleware({ method: 'POST', headers: { cookie, origin: 'https://evil.example', host: 'ascentwebapp.vercel.app' } }, res), null);
  assert.equal(res.code, 403);
  // Our own page, and a read from anywhere, still work
  assert.ok(await authMiddleware({ method: 'POST', headers: { cookie, origin: 'https://ascentwebapp.vercel.app', host: 'ascentwebapp.vercel.app' } }, fakeRes()));
  assert.ok(await authMiddleware({ method: 'GET', headers: { cookie, origin: 'https://evil.example', host: 'ascentwebapp.vercel.app' } }, fakeRes()));
});

test('an ended session removes the cookie', async () => {
  const res = fakeRes();
  const req = { method: 'GET', headers: { cookie: `ascent_session=${signToken({ userId: 'u1', sid: 'gone' })}` } };
  assert.equal(await authMiddleware(req, res), null);
  assert.equal(res.code, 401);
  assert.ok(cookiesOf(res)[0].startsWith('ascent_session=;'));
});
