// Origins, tokens and rate limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, configuredOrigins, handleCors } from './cors.js';
import { jwtSecret, signToken, verifyToken, getTokenFromHeader } from './jwt.js';
import { rateLimit, authRateLimit, clientIdOf } from './rateLimit.js';
import jwt from 'jsonwebtoken';

test('our own origins are allowed: production, previews, localhost, configured, same host', () => {
  for (const o of ['https://ascentwebapp.vercel.app', 'https://ascentwebapp-git-feat-x-team.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:3000']) {
    assert.equal(isAllowedOrigin(o, { env: {} }), true, o);
  }
  assert.equal(isAllowedOrigin('https://money.example', { env: { FRONTEND_URL: 'https://money.example/' } }), true);
  assert.equal(isAllowedOrigin('https://custom.example', { host: 'custom.example', env: {} }), true);
});

test('lookalikes are refused: no substring or suffix tricks', () => {
  for (const o of [
    'https://evil.example', 'https://someone-else.vercel.app', 'https://evil-localhost.com', 'http://localhost.evil.com',
    'https://ascentwebapp.vercel.app.evil.com', 'https://notascentwebapp.vercel.app', 'http://ascentwebapp.vercel.app', 'null', '',
  ]) {
    assert.equal(isAllowedOrigin(o, { host: 'ascentwebapp.vercel.app', env: {} }), false, o);
  }
  assert.equal(isAllowedOrigin(undefined, { env: {} }), false);
});

test('Vercel provides deployment URLs without a scheme', () => {
  assert.deepEqual(configuredOrigins({ VERCEL_URL: 'x-1.vercel.app', VERCEL_BRANCH_URL: 'x-git-b.vercel.app' }), ['https://x-1.vercel.app', 'https://x-git-b.vercel.app']);
});

test('a stray preflight reaching a handler is answered without running it', () => {
  const res = { status(c) { this.code = c; return this; }, end() { this.ended = true; return this; } };
  assert.equal(handleCors({ method: 'OPTIONS' }, res), true);
  assert.equal(res.code, 204);
  assert.equal(handleCors({ method: 'GET' }, res), false);
});

test('production never signs with a secret from the source code', () => {
  assert.throws(() => jwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => jwtSecret({ VERCEL: '1' }), /JWT_SECRET/);
  assert.equal(jwtSecret({ JWT_SECRET: 's' }), 's');
  assert.ok(jwtSecret({ NODE_ENV: 'development' }));
});

test('tokens round-trip; tampered, foreign and unsigned tokens do not', () => {
  const token = signToken({ userId: 'u1', sid: 's1' });
  assert.equal(verifyToken(token).userId, 'u1');
  assert.equal(verifyToken(token.slice(0, -2) + 'xx'), null);
  assert.equal(verifyToken(jwt.sign({ userId: 'u1' }, 'someone-elses-secret')), null);
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"userId":"u1"}').toString('base64url')}.`;
  assert.equal(verifyToken(unsigned), null);
  assert.equal(verifyToken('garbage'), null);
});

test('only Bearer tokens are read from the header', () => {
  assert.equal(getTokenFromHeader({ headers: { authorization: 'Bearer abc ' } }), 'abc');
  assert.equal(getTokenFromHeader({ headers: { authorization: 'Basic abc' } }), null);
  assert.equal(getTokenFromHeader({ headers: { authorization: 'Bearer ' } }), null);
  assert.equal(getTokenFromHeader({ headers: {} }), null);
});

const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

test('the caller is identified by req.ip, not a header they can set', () => {
  assert.equal(clientIdOf({ ip: '1.2.3.4', headers: { 'x-forwarded-for': 'spoofed' } }), '1.2.3.4');
});

test('sign-in attempts are limited per caller', () => {
  const req = { ip: `auth-${Math.random()}`, headers: {} };
  let limited = 0;
  for (let i = 0; i < 55; i += 1) if (authRateLimit(req, res())) limited += 1;
  assert.equal(limited, 5);
  assert.equal(authRateLimit({ ip: `other-${Math.random()}`, headers: {} }, res()), false, 'another caller is not affected');
});

test('API calls are limited per caller, with the remaining count in the headers', () => {
  const req = { ip: `api-${Math.random()}`, headers: {} };
  const first = res();
  assert.equal(rateLimit(req, first), false);
  assert.equal(first.headers['X-RateLimit-Remaining'], 499);
  for (let i = 0; i < 499; i += 1) rateLimit(req, res());
  const over = res();
  assert.equal(rateLimit(req, over), true);
  assert.equal(over.code, 429);
});
