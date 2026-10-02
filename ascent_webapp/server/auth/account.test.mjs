// Forgotten passwords, email confirmation, deleting an account, and where emailed links point.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

let users;
let sent;
let signedIn; // the user authMiddleware answers with
let deleted;
const matches = (u, q) => Object.entries(q).every(([k, v]) => (v && v.$gt ? u[k] > v.$gt : u[k] === v));
const lean = (v) => ({ select: () => ({ lean: async () => v }), lean: async () => v, then: (r, j) => Promise.resolve(v).then(r, j) });
class FakeUser {
  constructor(fields) { Object.assign(this, { language: 'en', ...fields }); }
  static findOne(q) { return lean(users.find((u) => matches(u, q)) || null); }
  static async updateOne(q, u) { const user = users.find((x) => x._id === q._id); if (user) Object.assign(user, u.$set); }
  static findOneAndUpdate(q, u) {
    const user = users.find((x) => matches(x, q));
    if (user) { Object.assign(user, u.$set); for (const k of Object.keys(u.$unset || {})) delete user[k]; }
    return lean(user || null);
  }
  async save() { return this; }
  toJSON() { const { password, ...rest } = this; return { ...rest }; }
}
mock.module(at('../models/User.js'), { exports: { default: FakeUser } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
mock.module(at('../lib/session.js'), { exports: { issueSession: async (u) => `token-for-${u._id}`, isLiveSession: () => true } });
mock.module(at('../lib/authLimit.js'), { exports: { limitAuth: async () => false, accountLocked: async () => false, recordFailedPassword: async () => {}, clearFailedPasswords: async () => {}, mayEmailReset: async () => true } });
mock.module(at('../lib/rateLimit.js'), { exports: { authRateLimit: () => false, rateLimit: () => false } });
mock.module(at('../lib/email-helper.js'), { exports: { sendEmail: async (m) => { sent.push(m); return { sent: true }; } } });
mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req, res) => {
      if (!signedIn) { res.status(401).json({ success: false }); return null; }
      return signedIn;
    },
  },
});
mock.module(at('../lib/deleteAccount.js'), { exports: { deleteAccount: async (u) => { deleted.push(u.email); } } });

const { default: password } = await import('./password.js');
const { default: verifyEmail } = await import('./verify-email.js');
const { default: me } = await import('./me.js');
const { hashToken, isTokenShape, newAccountToken } = await import('../lib/accountTokens.js');
const { linkOrigin } = await import('../lib/links.js');
const { renderAccountEmail } = await import('../lib/accountEmails.js');

const call = async (handler, { method = 'POST', query = {}, body = {}, headers = {} } = {}) => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, body, headers, query }, res);
  return res;
};
const linkIn = (mail, page) => mail.body.match(new RegExp(`https?://[^\\s]+/${page}/([A-Za-z0-9_-]{43})`));

beforeEach(() => {
  users = [new FakeUser({ _id: 'u1', email: 'dana@x.test', password: 'old-pass', language: 'he', emailVerified: false })];
  sent = [];
  signedIn = null;
  deleted = [];
});

// The session token the response stores in the cookie (the last Set-Cookie wins)
const sessionCookieOf = (r) => /ascent_session=([^;]*)/.exec([].concat(r.headers['Set-Cookie'] || []).at(-1) || '')?.[1];

test('tokens are long, random and stored only as a hash', () => {
  const a = newAccountToken(1000, 0);
  const b = newAccountToken(1000, 0);
  assert.ok(isTokenShape(a.token));
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.equal(a.expiresAt.getTime(), 1000);
  for (const bad of ['', 'short', null, { $ne: 1 }, 'x'.repeat(44)]) assert.equal(isTokenShape(bad), false);
});

test('forgot password emails a one-hour link in the person\'s language, and answers the same for unknown emails', async () => {
  const known = await call(password, { query: { action: 'forgot' }, body: { email: ' Dana@x.test ' } });
  const unknown = await call(password, { query: { action: 'forgot' }, body: { email: 'nobody@x.test' } });
  assert.deepEqual(known.body, unknown.body);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'dana@x.test');
  assert.match(sent[0].subject, /Ascent/);
  assert.match(sent[0].html, /dir="rtl"/);
  const token = linkIn(sent[0], 'reset-password')[1];
  assert.equal(users[0].resetTokenHash, hashToken(token));
  const ttl = users[0].resetExpiresAt - Date.now();
  assert.ok(ttl > 59 * 60 * 1000 && ttl <= 60 * 60 * 1000);
  assert.equal((await call(password, { query: { action: 'forgot' }, body: { email: { $ne: '' } } })).code, 400);
});

test('a reset link sets the new password once, confirms the email and signs in', async () => {
  await call(password, { query: { action: 'forgot' }, body: { email: 'dana@x.test' } });
  const token = linkIn(sent[0], 'reset-password')[1];
  assert.equal((await call(password, { query: { action: 'reset' }, body: { token, password: '123' } })).code, 400);
  const r = await call(password, { query: { action: 'reset' }, body: { token, password: 'new-pass' } });
  assert.equal(r.code, 200);
  assert.equal(sessionCookieOf(r), 'token-for-u1');
  assert.equal(r.body.data.token, undefined, 'the token never reaches page scripts');
  assert.equal(r.body.data.user.password, undefined);
  assert.equal(users[0].password, 'new-pass');
  assert.equal(users[0].emailVerified, true);
  assert.equal(users[0].resetTokenHash, undefined);
  assert.equal((await call(password, { query: { action: 'reset' }, body: { token, password: 'again-pass' } })).code, 400);
  assert.equal(users[0].password, 'new-pass');
});

test('an expired, made-up or malformed reset token changes nothing', async () => {
  const { token, hash } = newAccountToken(1000);
  Object.assign(users[0], { resetTokenHash: hash, resetExpiresAt: new Date(Date.now() - 1) });
  assert.equal((await call(password, { query: { action: 'reset' }, body: { token, password: 'new-pass' } })).code, 400);
  assert.equal((await call(password, { query: { action: 'reset' }, body: { token: newAccountToken(1).token, password: 'new-pass' } })).code, 400);
  assert.equal((await call(password, { query: { action: 'reset' }, body: { token: { $ne: null }, password: 'new-pass' } })).code, 400);
  assert.equal(users[0].password, 'old-pass');
  assert.equal((await call(password, { query: { action: 'nope' } })).code, 400);
  assert.equal((await call(password, { method: 'GET', query: { action: 'forgot' } })).code, 405);
});

test('the signed-in person can ask for a new confirmation link, which confirms the address once', async () => {
  assert.equal((await call(verifyEmail, { query: { action: 'send' } })).code, 401);
  signedIn = users[0];
  assert.equal((await call(verifyEmail, { query: { action: 'send' } })).body.data.sent, true);
  const token = linkIn(sent[0], 'verify-email')[1];
  signedIn = null; // the link may open on another device
  const r = await call(verifyEmail, { query: { action: 'confirm' }, body: { token } });
  assert.equal(r.code, 200);
  assert.equal(users[0].emailVerified, true);
  assert.equal(users[0].verifyTokenHash, undefined);
  assert.equal((await call(verifyEmail, { query: { action: 'confirm' }, body: { token } })).code, 400);
  signedIn = users[0];
  assert.equal((await call(verifyEmail, { query: { action: 'send' } })).body.data.verified, true);
  assert.equal(sent.length, 1);
});

test('deleting an account needs the person to type their email', async () => {
  signedIn = users[0];
  assert.equal((await call(me, { method: 'DELETE', body: {} })).code, 400);
  assert.equal((await call(me, { method: 'DELETE', body: { confirm: 'someone@x.test' } })).code, 400);
  assert.deepEqual(deleted, []);
  const r = await call(me, { method: 'DELETE', body: { confirm: ' DANA@x.test ' } });
  assert.equal(r.code, 200);
  assert.deepEqual(deleted, ['dana@x.test']);
});

test('emailed links use the app URL in production, whatever Origin the request claims', () => {
  const prod = { VERCEL_ENV: 'production', FRONTEND_URL: 'https://app.example.com/' };
  assert.equal(linkOrigin({ headers: { origin: 'https://evil.test' } }, prod), 'https://app.example.com');
  assert.equal(linkOrigin({ headers: { origin: 'http://localhost:5173' } }, prod), 'https://app.example.com');
  const preview = { VERCEL_ENV: 'preview', FRONTEND_URL: 'https://app.example.com' };
  assert.equal(linkOrigin({ headers: { origin: 'https://ascentwebapp-git-x-team.vercel.app' } }, preview), 'https://ascentwebapp-git-x-team.vercel.app');
  assert.equal(linkOrigin({ headers: { origin: 'https://evil.test' } }, preview), 'https://app.example.com');
  assert.equal(linkOrigin({ headers: {} }, {}), 'https://ascentwebapp.vercel.app');
});

test('account emails exist in every language and escape nothing they should not', () => {
  for (const kind of ['reset', 'verify']) {
    const subjects = new Set(['en', 'he', 'ru'].map((language) => renderAccountEmail({ kind, language, origin: 'https://a.test', token: 'T' }).subject));
    assert.equal(subjects.size, 3, kind);
    const mail = renderAccountEmail({ kind, language: 'xx', origin: 'https://a.test', token: 'T' });
    assert.match(mail.html, /href="https:\/\/a\.test\/(reset-password|verify-email)\/T"/);
  }
});
