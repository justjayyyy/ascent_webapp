// Runs the real /api/workspaces handler against an in-memory workspace store.
// Needs: node --test --experimental-test-module-mocks (see the test:server script).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const oid = () => new mongoose.Types.ObjectId();
const same = (a, b) => a != null && b != null && String(a) === String(b);

let store; // workspace documents
let users; // user documents
let sent; // emails "sent"
let currentUser;

const matchesElem = (member, cond) => Object.entries(cond).every(([k, v]) => same(member[k], v));
const matches = (ws, q) =>
  Object.entries(q).every(([k, v]) => {
    if (k === '_id') return same(ws._id, v);
    if (k === 'ownerId') return same(ws.ownerId, v);
    if (k === 'members') return ws.members.some((m) => matchesElem(m, v.$elemMatch));
    if (k === 'members._id') return ws.members.some((m) => same(m._id, v));
    throw new Error(`unsupported query key ${k}`);
  });

const hydrate = (data) => {
  const members = data.members;
  const push = members.push.bind(members);
  members.push = (m) => push({ _id: oid(), ...m }); // subdocuments get an _id, as in Mongoose
  const doc = {
    ...data,
    save: async () => doc,
    toObject: () => JSON.parse(JSON.stringify({ ...doc, save: undefined, toObject: undefined })),
  };
  return doc;
};
const chain = (v) => { const c = { select: () => c, sort: () => c, lean: async () => v, then: (r) => Promise.resolve(v).then(r) }; return c; };

mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      if (!currentUser) return null;
      return currentUser;
    },
  },
});
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
mock.module(at('../lib/email-helper.js'), { exports: { sendEmail: async (m) => { sent.push(m); return { sent: true }; } } });
mock.module(at('../lib/email-templates.js'), { exports: { getEmailTemplate: ({ body }) => `<html>${body}</html>` } });
mock.module(at('../models/User.js'), {
  exports: {
    default: {
      findOne: (q) => chain(users.find((u) => u.email === q.email) || null),
      findById: (id) => chain(users.find((u) => same(u._id, id)) || null),
      find: (q) => chain(users.filter((u) => q._id.$in.some((i) => same(i, u._id)))),
    },
  },
});
mock.module(at('../models/Workspace.js'), {
  exports: {
    default: {
      findOne: async (q) => store.find((w) => matches(w, q)) || null,
      find: (q) => chain(store.filter((w) => matches(w, q))),
      create: async (data) => {
        const doc = hydrate({ _id: oid(), ...data, members: data.members.map((m) => ({ _id: oid(), ...m })) });
        store.push(doc);
        return doc;
      },
      findOneAndDelete: async (q) => {
        const i = store.findIndex((w) => matches(w, q));
        return i === -1 ? null : store.splice(i, 1)[0];
      },
      updateOne: async () => ({}),
    },
  },
});

const { default: handler } = await import('./workspaces.js');

const makeRes = () => ({
  code: 200, body: undefined, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});
async function call(method, { query = {}, body } = {}) {
  const res = makeRes();
  await handler({ method, headers: {}, query, body }, res);
  return res;
}

/* ------------------------------------------------------------- fixtures */

const mk = (email, extra = {}) => ({ _id: oid(), email, full_name: email.split('@')[0], language: 'en', authProvider: 'email', ...extra });
let OWNER, ADMIN, EDITOR, VIEWER, OUTSIDER, ws;
const member = (u, role, status = 'accepted') => ({ _id: oid(), userId: u._id, email: u.email, role, status, permissions: {} });

beforeEach(() => {
  OWNER = mk('owner@x.com'); ADMIN = mk('admin@x.com'); EDITOR = mk('editor@x.com');
  VIEWER = mk('viewer@x.com'); OUTSIDER = mk('outsider@x.com');
  users = [OWNER, ADMIN, EDITOR, VIEWER, OUTSIDER];
  sent = [];
  ws = hydrate({
    _id: oid(), name: 'Home', ownerId: OWNER._id,
    members: [member(OWNER, 'owner'), member(ADMIN, 'admin'), member(EDITOR, 'editor'), member(VIEWER, 'viewer')],
  });
  store = [ws];
  currentUser = OWNER;
});

const idOf = (u) => String(ws.members.find((m) => same(m.userId, u._id))._id);
const q = (extra) => ({ id: String(ws._id), ...extra });

/* ---------------------------------------------------- authorization bugs */

test('a viewer cannot invite, promote themselves, or remove anyone', async () => {
  currentUser = VIEWER;
  const invite = await call('POST', { query: q({ action: 'invite' }), body: { email: 'new@x.com', role: 'admin' } });
  assert.equal(invite.code, 403);

  const promote = await call('PUT', { query: q({ action: 'updateMember', memberId: idOf(VIEWER) }), body: { role: 'admin' } });
  assert.equal(promote.code, 403);

  const remove = await call('DELETE', { query: q({ action: 'removeMember', memberId: idOf(EDITOR) }) });
  assert.equal(remove.code, 403);

  assert.equal(ws.members.length, 4);
  assert.equal(ws.members.find((m) => same(m.userId, VIEWER._id)).role, 'viewer');
});

test('a viewer cannot rename the workspace', async () => {
  currentUser = VIEWER;
  assert.equal((await call('PUT', { query: q(), body: { name: 'Mine now' } })).code, 403);
  assert.equal(ws.name, 'Home');
});

test('non-members cannot read a workspace', async () => {
  currentUser = OUTSIDER;
  assert.equal((await call('GET', { query: q() })).code, 404);
  assert.equal((await call('GET')).body.data.length, 0);
});

test('a pending invitee does not see the workspace until they accept', async () => {
  ws.members.push({ _id: oid(), userId: OUTSIDER._id, email: OUTSIDER.email, role: 'viewer', status: 'pending', permissions: {} });
  currentUser = OUTSIDER;
  assert.equal((await call('GET')).body.data.length, 0);
});

/* -------------------------------------------------------------- guardrails */

test('nobody can change or remove the owner', async () => {
  for (const actor of [OWNER, ADMIN]) {
    currentUser = actor;
    const upd = await call('PUT', { query: q({ action: 'updateMember', memberId: idOf(OWNER) }), body: { role: 'viewer' } });
    assert.equal(upd.code, 403);
    const del = await call('DELETE', { query: q({ action: 'removeMember', memberId: idOf(OWNER) }) });
    assert.equal(del.code, 403);
  }
  assert.equal(ws.members.find((m) => same(m.userId, OWNER._id)).role, 'owner');
});

test('an admin can manage editors but not other admins, and cannot mint admins', async () => {
  currentUser = ADMIN;
  const ok = await call('PUT', { query: q({ action: 'updateMember', memberId: idOf(EDITOR) }), body: { role: 'viewer' } });
  assert.equal(ok.code, 200);
  const mint = await call('PUT', { query: q({ action: 'updateMember', memberId: idOf(VIEWER) }), body: { role: 'admin' } });
  assert.equal(mint.code, 403);
  const other = mk('admin2@x.com');
  users.push(other);
  ws.members.push(member(other, 'admin'));
  const hit = await call('DELETE', { query: q({ action: 'removeMember', memberId: idOf(other) }) });
  assert.equal(hit.code, 403);
});

test('changing a role applies that role\'s preset unless permissions are sent', async () => {
  const r = await call('PUT', { query: q({ action: 'updateMember', memberId: idOf(VIEWER) }), body: { role: 'editor' } });
  assert.equal(r.code, 200);
  const m = ws.members.find((x) => same(x.userId, VIEWER._id));
  assert.equal(m.permissions.editExpenses, true);
  assert.equal(m.permissions.manageUsers, false);
});

test('custom permissions are sanitised: unknown keys dropped, manageUsers never granted, edit implies view', async () => {
  const r = await call('PUT', {
    query: q({ action: 'updateMember', memberId: idOf(VIEWER) }),
    body: { permissions: { editBudgets: true, manageUsers: true, superuser: true } },
  });
  assert.equal(r.code, 200);
  const p = ws.members.find((x) => same(x.userId, VIEWER._id)).permissions;
  assert.equal(p.editBudgets, true);
  assert.equal(p.viewBudgets, true);
  assert.equal(p.manageUsers, false);
  assert.equal('superuser' in p, false);
});

/* ------------------------------------------------------------------ invite */

test('inviting adds a pending member with the role preset and emails a link with escaped names', async () => {
  ws.name = '<b>Home</b>';
  const r = await call('POST', { query: q({ action: 'invite' }), body: { email: ' New@X.com ', role: 'editor' } });
  assert.equal(r.code, 200);
  const m = ws.members.find((x) => x.email === 'new@x.com');
  assert.equal(m.status, 'pending');
  assert.equal(m.role, 'editor');
  assert.equal(m.permissions.editExpenses, true);
  assert.ok(same(m.invitedBy, OWNER._id));
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].html.includes('<b>Home</b>'), 'workspace name is HTML-escaped');
  assert.ok(sent[0].html.includes('&lt;b&gt;Home&lt;/b&gt;'));
  assert.ok(r.body.data.inviteLink.endsWith(`/accept-invitation/${m._id}`));
});

test('duplicate, self and malformed invitations are rejected; declined ones can be re-invited', async () => {
  const dup = await call('POST', { query: q({ action: 'invite' }), body: { email: EDITOR.email } });
  assert.equal(dup.code, 409);
  assert.equal((await call('POST', { query: q({ action: 'invite' }), body: { email: OWNER.email } })).code, 400);
  assert.equal((await call('POST', { query: q({ action: 'invite' }), body: { email: 'nope' } })).code, 400);

  await call('POST', { query: q({ action: 'invite' }), body: { email: 'again@x.com' } });
  ws.members.find((m) => m.email === 'again@x.com').status = 'declined';
  const again = await call('POST', { query: q({ action: 'invite' }), body: { email: 'again@x.com', role: 'editor' } });
  assert.equal(again.code, 200);
  const rows = ws.members.filter((m) => m.email === 'again@x.com');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].role, 'editor');
});

test('only the owner can invite admins', async () => {
  currentUser = ADMIN;
  const r = await call('POST', { query: q({ action: 'invite' }), body: { email: 'boss@x.com', role: 'admin' } });
  assert.equal(r.code, 403);
});

/* ------------------------------------------------------ accept / decline */

const invite = async (email = OUTSIDER.email) => {
  await call('POST', { query: q({ action: 'invite' }), body: { email, role: 'viewer' } });
  return ws.members.find((m) => m.email === email);
};

test('the invited person accepts with the emailed token and becomes a member', async () => {
  const m = await invite();
  currentUser = OUTSIDER;
  const r = await call('POST', { query: { action: 'accept', token: String(m._id) } });
  assert.equal(r.code, 200);
  assert.equal(m.status, 'accepted');
  assert.ok(same(m.userId, OUTSIDER._id));
  assert.equal((await call('GET')).body.data.length, 1);
});

test('someone else cannot use an invitation token', async () => {
  const m = await invite();
  currentUser = VIEWER;
  assert.equal((await call('POST', { query: { action: 'accept', token: String(m._id) } })).code, 404);
  assert.equal(m.status, 'pending');
});

test('declining marks the invitation declined', async () => {
  const m = await invite();
  currentUser = OUTSIDER;
  assert.equal((await call('POST', { query: { action: 'decline', token: String(m._id) } })).code, 200);
  assert.equal(m.status, 'declined');
  assert.equal((await call('POST', { query: { action: 'accept', token: String(m._id) } })).code, 400);
});

test('in-app invitation list is only for email-verified (Google) accounts', async () => {
  await invite();
  currentUser = OUTSIDER;
  assert.deepEqual((await call('GET', { query: { action: 'invitations' } })).body.data, []);
  currentUser = { ...OUTSIDER, authProvider: 'google' };
  const list = (await call('GET', { query: { action: 'invitations' } })).body.data;
  assert.equal(list.length, 1);
  assert.equal(list[0].workspaceName, 'Home');
});

/* ------------------------------------------------------------ leave, resend */

test('members can leave; the owner cannot', async () => {
  currentUser = EDITOR;
  assert.equal((await call('POST', { query: q({ action: 'leave' }) })).code, 200);
  assert.ok(!ws.members.some((m) => same(m.userId, EDITOR._id)));
  currentUser = OWNER;
  assert.equal((await call('POST', { query: q({ action: 'leave' }) })).code, 400);
});

test('resend emails a pending invitation again, and only to managers', async () => {
  const m = await invite();
  sent.length = 0;
  assert.equal((await call('POST', { query: q({ action: 'resend', memberId: String(m._id) }) })).code, 200);
  assert.equal(sent.length, 1);
  currentUser = VIEWER;
  assert.equal((await call('POST', { query: q({ action: 'resend', memberId: String(m._id) }) })).code, 403);
});

test('only the owner can delete the workspace', async () => {
  currentUser = ADMIN;
  assert.equal((await call('DELETE', { query: q() })).code, 401);
  currentUser = OWNER;
  assert.equal((await call('DELETE', { query: q() })).code, 200);
  assert.equal(store.length, 0);
});
