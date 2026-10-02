// Several signed-in devices per account: which tokens stay valid, and what each way out ends.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
process.env.JWT_SECRET = 'test-secret';

// A one-user stand-in that applies the update operators the session code uses
let doc;
const matches = (q) => Object.entries(q).every(([k, v]) => {
  if (k === '_id') return v === doc._id;
  if (v && typeof v === 'object' && '$ne' in v) return doc[k] !== v.$ne;
  return doc[k] === v;
});
mock.module(at('../models/User.js'), {
  exports: {
    default: {
      async updateOne(q, u) {
        if (!matches(q)) return;
        Object.assign(doc, u.$set || {});
        for (const k of Object.keys(u.$unset || {})) delete doc[k];
        for (const [k, v] of Object.entries(u.$push || {})) doc[k] = [...(doc[k] || []), ...v.$each].slice(v.$slice);
        for (const [k, cond] of Object.entries(u.$pull || {})) {
          doc[k] = (doc[k] || []).filter((s) => !(typeof cond.id === 'object' ? s.id !== cond.id.$ne : s.id === cond.id));
        }
      },
    },
  },
});

const { issueSession, isLiveSession, endSession, endOtherSessions, deviceLabel, MAX_SESSIONS } = await import('./session.js');
const { verifyToken } = await import('./jwt.js');
const sidOf = (token) => verifyToken(token).sid;
const user = () => ({ _id: 'u1', email: 'dana@x.test' });

beforeEach(() => { doc = { _id: 'u1', sessions: [] }; });

test('signing in on a phone keeps the computer signed in', async () => {
  const computer = sidOf(await issueSession(user(), { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' }));
  const phone = sidOf(await issueSession(user(), { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1' }));
  assert.ok(isLiveSession(doc, computer));
  assert.ok(isLiveSession(doc, phone));
  assert.deepEqual(doc.sessions.map((s) => s.device), ['Chrome on Windows', 'Safari on iPhone']);
});

test('signing out ends only this device; "sign out other devices" ends the rest', async () => {
  const [a, b, c] = [await issueSession(user()), await issueSession(user()), await issueSession(user())].map(sidOf);
  await endSession('u1', a);
  assert.deepEqual([a, b, c].map((s) => isLiveSession(doc, s)), [false, true, true]);
  await endOtherSessions('u1', b);
  assert.deepEqual([a, b, c].map((s) => isLiveSession(doc, s)), [false, true, false]);
});

test('a password reset leaves only the new session', async () => {
  const old = sidOf(await issueSession(user()));
  doc.sessionId = 'legacy';
  const fresh = sidOf(await issueSession(user(), { only: true }));
  assert.equal(isLiveSession(doc, old), false);
  assert.equal(isLiveSession(doc, 'legacy'), false);
  assert.ok(isLiveSession(doc, fresh));
});

test('the oldest sessions drop off past the limit', async () => {
  const sids = [];
  for (let i = 0; i < MAX_SESSIONS + 2; i += 1) sids.push(sidOf(await issueSession(user())));
  assert.equal(doc.sessions.length, MAX_SESSIONS);
  assert.equal(isLiveSession(doc, sids[0]), false);
  assert.ok(isLiveSession(doc, sids.at(-1)));
});

test('a session from before several devices were allowed keeps working until it is ended', async () => {
  doc.sessionId = 'legacy';
  assert.ok(isLiveSession(doc, 'legacy'));
  await issueSession(user());
  assert.ok(isLiveSession(doc, 'legacy'), 'a new sign-in elsewhere no longer ends it');
  await endSession('u1', 'legacy');
  assert.equal(isLiveSession(doc, 'legacy'), false);
});

test('tokens without a session, or for none of the live ones, are refused', () => {
  assert.equal(isLiveSession({ sessions: [{ id: 'a' }] }, undefined), false);
  assert.equal(isLiveSession({ sessions: [{ id: 'a' }] }, 'b'), false);
  assert.equal(isLiveSession(null, 'a'), false);
  assert.equal(deviceLabel(''), 'Unknown device');
});
