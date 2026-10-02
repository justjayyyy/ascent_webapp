// Passkey handler: origin checks, single-use challenges, and "unlock keeps the session" (no database,
// no real authenticator: the WebAuthn library and the models are stubbed).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/never';
const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

let challenges; // what AuthChallenge holds
let users; // what User holds
let verifyResult;
let issued;

const clientData = (challenge) => Buffer.from(JSON.stringify({ challenge, type: 'webauthn.get' })).toString('base64url');

mock.module('@simplewebauthn/server', {
  exports: {
    generateRegistrationOptions: async () => ({ challenge: 'reg-ch' }),
    verifyRegistrationResponse: async () => ({ verified: true, registrationInfo: { credential: { id: 'cred-new', publicKey: new Uint8Array([1, 2]), counter: 0 }, credentialDeviceType: 'multiDevice', credentialBackedUp: true } }),
    generateAuthenticationOptions: async () => ({ challenge: 'auth-ch' }),
    verifyAuthenticationResponse: async () => verifyResult,
  },
});
mock.module(at('../lib/authLimit.js'), { exports: { limitAuth: async () => false } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
mock.module(at('../middleware/auth.js'), { exports: { authMiddleware: async (req, res) => { res.status(401).json({ success: false }); return null; } } });
mock.module(at('../lib/session.js'), { exports: {
  issueSession: async (u) => { issued += 1; u.sessionId = 'fresh'; return 'new-token'; },
  isLiveSession: (u, sid) => !!sid && (u.sessionId === sid || (u.sessions || []).some((s) => s.id === sid)),
} });
mock.module(at('../models/AuthChallenge.js'), {
  exports: {
    default: {
      create: async (doc) => { challenges.push(doc); return doc; },
      findOneAndDelete: (q) => ({
        lean: async () => {
          const i = challenges.findIndex((c) => c.challenge === q.challenge && c.purpose === q.purpose && c.rpID === q.rpID && c.origin === q.origin);
          return i === -1 ? null : challenges.splice(i, 1)[0];
        },
      }),
    },
  },
});
mock.module(at('../models/User.js'), {
  exports: {
    default: {
      findOne: async (q) => users.find((u) => u.passkeys.some((p) => p.credentialID === q['passkeys.credentialID'])) || null,
    },
  },
});

const { default: handler } = await import('./passkey.js');
const { signToken } = await import('../lib/jwt.js');

function makeUser() {
  return {
    _id: 'u1',
    sessionId: 'live',
    isFirstLogin: false,
    passkeys: [{ credentialID: 'cred-1', publicKey: Buffer.from([9]).toString('base64url'), counter: 3 }],
    saved: 0,
    async save() { this.saved += 1; },
    toJSON() { return { id: this._id }; },
  };
}

async function call(action, { body, origin = 'https://ascentwebapp.vercel.app', token } = {}) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  const headers = { origin, 'x-forwarded-for': `t-${Math.random()}` };
  if (token) headers.authorization = `Bearer ${token}`;
  await handler({ method: 'POST', query: { action }, headers, body }, res);
  return res;
}

beforeEach(() => {
  challenges = [];
  users = [makeUser()];
  issued = 0;
  verifyResult = { verified: true, authenticationInfo: { newCounter: 4, credentialBackedUp: true } };
});

// The session token the response stores in the cookie (the last Set-Cookie wins)
const sessionCookieOf = (r) => /ascent_session=([^;]*)/.exec([].concat(r.headers['Set-Cookie'] || []).at(-1) || '')?.[1];

test('a page we do not serve cannot ask for a challenge', async () => {
  const r = await call('login-options', { origin: 'https://evil.example' });
  assert.equal(r.code, 403);
  assert.equal(challenges.length, 0);
});

test('a challenge answers exactly one sign-in', async () => {
  await call('login-options');
  const response = { id: 'cred-1', response: { clientDataJSON: clientData('auth-ch') } };
  const first = await call('login-verify', { body: { response } });
  assert.equal(first.code, 200);
  const replay = await call('login-verify', { body: { response } });
  assert.equal(replay.code, 400);
  assert.equal(replay.body.error, 'challenge_expired');
});

test('a challenge issued to another origin is not accepted here', async () => {
  await call('login-options', { origin: 'http://localhost:5173' });
  const response = { id: 'cred-1', response: { clientDataJSON: clientData('auth-ch') } };
  const r = await call('login-verify', { body: { response } });
  assert.equal(r.code, 400);
});

test('unlocking the device that holds the live session keeps it', async () => {
  await call('login-options');
  const token = signToken({ userId: 'u1', sid: 'live' });
  const r = await call('login-verify', { token, body: { response: { id: 'cred-1', response: { clientDataJSON: clientData('auth-ch') } } } });
  assert.equal(r.code, 200);
  assert.equal(r.body.data.unlocked, true);
  assert.equal(sessionCookieOf(r), token);
  assert.equal(r.body.data.token, undefined, 'the token never reaches page scripts');
  assert.equal(issued, 0);
  assert.equal(users[0].passkeys[0].counter, 4);
});

test('signing in without the live session starts a new one', async () => {
  await call('login-options');
  const stale = signToken({ userId: 'u1', sid: 'old' });
  const r = await call('login-verify', { token: stale, body: { response: { id: 'cred-1', response: { clientDataJSON: clientData('auth-ch') } } } });
  assert.equal(r.code, 200);
  assert.equal(r.body.data.unlocked, false);
  assert.equal(sessionCookieOf(r), 'new-token');
  assert.equal(r.body.data.token, undefined, 'the token never reaches page scripts');
  assert.equal(issued, 1);
});

test('an unknown passkey or a bad signature is refused', async () => {
  await call('login-options');
  const unknown = await call('login-verify', { body: { response: { id: 'nope', response: { clientDataJSON: clientData('auth-ch') } } } });
  assert.equal(unknown.code, 401);

  await call('login-options');
  verifyResult = { verified: false, authenticationInfo: {} };
  const bad = await call('login-verify', { body: { response: { id: 'cred-1', response: { clientDataJSON: clientData('auth-ch') } } } });
  assert.equal(bad.code, 401);
  assert.equal(users[0].saved, 0);
});

test('managing passkeys needs a normal sign-in', async () => {
  const r = await call('register-options');
  assert.equal(r.code, 401);
});
