// Signing up and in: Google token checks, the Google, register and login handlers, and profile edits.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
process.env.GOOGLE_CLIENT_ID = 'our-client.apps.googleusercontent.com';

// ---- stand-ins for the models ----
let users;
let workspaces;
let workspaceUpdates;
class FakeUser {
  constructor(fields) { Object.assign(this, { _id: `u${users.length + 1}`, isFirstLogin: true, ...fields }); }
  static async findOne(q) { return users.find((u) => u.email === q.email) || null; }
  static async exists(q) { return users.some((u) => u.email === q.email); }
  static async create(fields) {
    if (users.some((u) => u.email === fields.email)) throw Object.assign(new Error('dup'), { code: 11000 });
    const u = new FakeUser(fields);
    users.push(u);
    return u;
  }
  static async deleteOne(q) { users = users.filter((u) => u._id !== q._id); }
  static async updateOne(q, u) { const user = users.find((x) => x._id === q._id); if (user) Object.assign(user, u.$set); }
  async save() { return this; }
  async comparePassword(p) { return p === this.password; }
  toJSON() { const { password, ...rest } = this; return { ...rest }; }
}
mock.module(at('../models/User.js'), { exports: { default: FakeUser } });
mock.module(at('../models/Workspace.js'), {
  exports: {
    default: {
      async create(ws) { if (failWorkspace) throw new Error('database hiccup'); const w = { _id: `w${workspaces.length + 1}`, ...ws }; workspaces.push(w); return w; },
      async updateMany(filter, update, opts) { workspaceUpdates.push({ filter, update, opts }); return { modifiedCount: 0 }; },
    },
  },
});
let failWorkspace = false;
let sent; // emails "sent"
mock.module(at('../lib/email-helper.js'), { exports: { sendEmail: async (m) => { sent.push(m); return { sent: true }; } } });
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
mock.module(at('../lib/session.js'), { exports: { issueSession: async (u) => `token-for-${u._id}`, isLiveSession: () => true } });
mock.module(at('../lib/rateLimit.js'), { exports: { authRateLimit: () => false, rateLimit: () => false } });

let googleAnswer;
const { verifyGoogleIdToken, GoogleAuthError, googleClientIds } = await import('../lib/googleAuth.js');
mock.module(at('../lib/googleAuth.js'), {
  exports: {
    GoogleAuthError,
    verifyGoogleIdToken: async () => {
      if (googleAnswer instanceof Error) throw googleAnswer;
      return googleAnswer;
    },
  },
});
const { default: google } = await import('./google.js');
const { default: register } = await import('./register.js');
const { default: login } = await import('./login.js');
const { profileChanges } = await import('./me.js');

const call = async (handler, body, method = 'POST') => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, body, headers: {}, query: {} }, res);
  return res;
};

beforeEach(() => {
  users = [];
  workspaces = [];
  workspaceUpdates = [];
  sent = [];
  googleAnswer = { email: 'dana@gmail.com', name: 'Dana', picture: 'p.png', googleId: 'g-1' };
});

// ---- verifying Google's ID token ----
const NOW = Date.parse('2026-10-01T12:00:00Z');
const google200 = (payload) => async () => ({ ok: true, json: async () => payload });
const good = { aud: 'our-client.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: String(NOW / 1000 + 600), email: 'Dana@Gmail.com', email_verified: 'true', sub: 'g-1', name: 'Dana' };
const verify = (payload, opts = {}) => verifyGoogleIdToken('x'.repeat(40), { fetchImpl: google200(payload), now: NOW, clientIds: ['our-client.apps.googleusercontent.com'], ...opts });

test('a valid Google token gives the verified, normalised identity', async () => {
  assert.deepEqual(await verify(good), { email: 'dana@gmail.com', name: 'Dana', picture: null, googleId: 'g-1' });
});

test('tokens issued for another app, by another issuer, expired or with an unverified email are refused', async () => {
  for (const [patch, reason] of [
    [{ aud: 'someone-elses-app' }, 'wrong_audience'],
    [{ iss: 'https://evil.example' }, 'wrong_issuer'],
    [{ exp: String(NOW / 1000 - 1) }, 'expired'],
    [{ email_verified: 'false' }, 'email_not_verified'],
    [{ email: '' }, 'invalid_token'],
    [{ error: 'invalid_token' }, 'invalid_token'],
  ]) {
    await assert.rejects(verify({ ...good, ...patch }), (e) => e instanceof GoogleAuthError && e.reason === reason, reason);
  }
});

test('Google refusing the token, Google unreachable, or no client id configured', async () => {
  await assert.rejects(verify(good, { fetchImpl: async () => ({ ok: false }) }), { reason: 'invalid_token' });
  await assert.rejects(verify(good, { fetchImpl: async () => { throw new Error('ENOTFOUND'); } }), { reason: 'google_unreachable', status: 503 });
  await assert.rejects(verify(good, { clientIds: [] }), { reason: 'google_not_configured', status: 503 });
  await assert.rejects(verifyGoogleIdToken('short', { clientIds: ['x'] }), { reason: 'invalid_token' });
  assert.deepEqual(googleClientIds({ GOOGLE_CLIENT_ID: 'a', VITE_GOOGLE_CLIENT_ID: 'b' }), ['a', 'b']);
});

// ---- the Google handler ----
test('the identity comes from the verified token, never from the request body', async () => {
  const r = await call(google, { credential: 'tok', accessToken: 'x', userInfo: { email: 'victim@x.test' } });
  assert.equal(r.code, 200);
  assert.equal(users[0].email, 'dana@gmail.com');
  assert.equal(users.some((u) => u.email === 'victim@x.test'), false);
});

test('a request without a Google credential is refused', async () => {
  assert.equal((await call(google, { accessToken: 'x', userInfo: { email: 'victim@x.test' } })).code, 400);
  assert.equal(users.length, 0);
});

test('a refused token is answered with Google\'s reason and creates nothing', async () => {
  googleAnswer = new GoogleAuthError('wrong_audience');
  const r = await call(google, { credential: 'tok' });
  assert.equal(r.code, 401);
  assert.equal(r.body.error, 'wrong_audience');
  assert.equal(users.length, 0);
});

test('a first Google sign-in creates the account, its workspace and an unusable password', async () => {
  const r = await call(google, { credential: 'tok', language: 'ru', theme: 'nope' });
  assert.equal(r.body.data.isFirstLogin, true);
  assert.equal(r.body.data.token, 'token-for-u1');
  const [u] = users;
  assert.equal(u.language, 'ru');
  assert.equal(u.theme, undefined);
  assert.match(u.password, /^!google:[0-9a-f]{64}$/);
  assert.equal(u.defaultWorkspace, 'w1');
  assert.equal(workspaces[0].members[0].role, 'owner');
  assert.equal(workspaces[0].members[0].permissions.manageUsers, true);
});

test('Google sign-in accepts only pending email invitations for that exact address', async () => {
  await call(google, { credential: 'tok' });
  const { filter, update, opts } = workspaceUpdates[0];
  assert.deepEqual(filter.members.$elemMatch, { email: 'dana@gmail.com', status: 'pending', inviteKind: { $ne: 'link' } });
  assert.deepEqual(opts.arrayFilters, [{ 'm.email': 'dana@gmail.com', 'm.status': 'pending', 'm.inviteKind': { $ne: 'link' } }]);
  assert.equal(update.$set['members.$[m].status'], 'accepted');
});

test('an existing account signs in with Google and keeps its own name', async () => {
  users.push(new FakeUser({ email: 'dana@gmail.com', full_name: 'Dana K', isFirstLogin: false }));
  const r = await call(google, { credential: 'tok' });
  assert.equal(r.body.data.isFirstLogin, false);
  assert.equal(users[0].full_name, 'Dana K');
  assert.equal(users[0].googleId, 'g-1');
  assert.equal(workspaces.length, 0);
});

// ---- email sign-up and sign-in ----
test('sign-up validates, creates the account with its workspace, and signs in', async () => {
  assert.equal((await call(register, { email: 'bad', password: 'secret1' })).code, 400);
  assert.equal((await call(register, { email: 'a@b.test', password: '123' })).code, 400);
  assert.equal((await call(register, { email: 'a@b.test', password: 'x'.repeat(129) })).code, 400);
  assert.equal((await call(register, { email: { $gt: '' }, password: 'secret1' })).code, 400);
  const r = await call(register, { email: ' A@B.test ', password: 'secret1', full_name: '<b>Ann</b>', language: 'he' });
  assert.equal(r.code, 201);
  assert.equal(r.body.data.isFirstLogin, true);
  assert.equal(users[0].email, 'a@b.test');
  assert.equal(users[0].full_name, 'bAnn/b');
  assert.equal(users[0].isFirstLogin, false, 'the sign-up itself was the first sign-in');
  assert.equal(workspaces.length, 1);
  assert.equal((await call(register, { email: 'a@b.test', password: 'secret1' })).code, 409);
});

test('sign-in: one message for unknown email and wrong password; the first one is flagged once', async () => {
  users.push(new FakeUser({ email: 'a@b.test', password: 'secret1', isFirstLogin: true }));
  const unknown = await call(login, { email: 'x@b.test', password: 'secret1' });
  const wrong = await call(login, { email: 'a@b.test', password: 'nope' });
  assert.equal(unknown.code, 401);
  assert.equal(wrong.body.error, unknown.body.error);
  assert.equal((await call(login, { email: 'a@b.test', password: { $ne: '' } })).code, 400);
  const first = await call(login, { email: 'A@b.test', password: 'secret1' });
  assert.equal(first.body.data.isFirstLogin, true);
  assert.equal(first.body.data.user.password, undefined);
  assert.equal((await call(login, { email: 'a@b.test', password: 'secret1' })).body.data.isFirstLogin, false);
  assert.equal((await call(login, {}, 'GET')).code, 405);
});

// ---- profile edits ----
test('profile edits accept only known fields with valid values', () => {
  assert.deepEqual(profileChanges({ full_name: '  Dana ', language: 'he', currency: 'EUR', blurValues: true, role: 'admin', password: 'x' }).updates,
    { full_name: 'Dana', language: 'he', currency: 'EUR', blurValues: true });
  assert.equal(profileChanges({ currency: 'euro' }).invalid, 'currency');
  assert.equal(profileChanges({ currency: 'eur' }).invalid, 'currency');
  assert.equal(profileChanges({ language: 'fr' }).invalid, 'language');
  assert.equal(profileChanges({ theme: 'neon' }).invalid, 'theme');
  assert.equal(profileChanges({ weeklyReports: 'yes' }).invalid, 'weeklyReports');
  assert.equal(profileChanges({ full_name: 'x'.repeat(101) }).invalid, 'full_name');
  assert.deepEqual(profileChanges({}).updates, {});
});

// ---- email confirmation ----
test('an email sign-up starts unconfirmed and is sent a confirmation link; only the hash is stored', async () => {
  const { hashToken } = await import('../lib/accountTokens.js');
  await call(register, { email: 'a@b.test', password: 'secret1', language: 'ru' });
  assert.equal(users[0].emailVerified, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'a@b.test');
  const token = sent[0].body.match(/\/verify-email\/([A-Za-z0-9_-]{43})/)[1];
  assert.equal(users[0].verifyTokenHash, hashToken(token));
  assert.ok(users[0].verifyExpiresAt > new Date());
  assert.match(sent[0].subject, /email/i);
});

test('Google confirms the address; an unconfirmed password someone else set on it stops working', async () => {
  users.push(new FakeUser({ email: 'dana@gmail.com', password: 'squatter', emailVerified: false, isFirstLogin: false }));
  await call(google, { credential: 'tok' });
  assert.equal(users[0].emailVerified, true);
  assert.match(users[0].password, /^!google:/);
  assert.equal((await call(login, { email: 'dana@gmail.com', password: 'squatter' })).code, 401);
});

test('Google keeps the password of an account from before confirmation existed', async () => {
  users.push(new FakeUser({ email: 'dana@gmail.com', password: 'mine123', isFirstLogin: false }));
  await call(google, { credential: 'tok' });
  assert.equal(users[0].password, 'mine123');
  assert.equal(users[0].emailVerified, true);
});

test("if the new account's workspace cannot be made, no half-made account is left behind", async () => {
  failWorkspace = true;
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await call(register, { email: 'a@b.test', password: 'secret1' })).code, 500);
  } finally {
    failWorkspace = false;
    console.error = quiet;
  }
  assert.deepEqual(users, []);
  assert.equal((await call(register, { email: 'a@b.test', password: 'secret1' })).code, 201, 'signing up again works');
});
