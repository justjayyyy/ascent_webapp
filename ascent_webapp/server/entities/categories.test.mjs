// The categories handler: permissions, workspace scope, and seeding the defaults exactly once.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const ID = '66f0000000000000000000ab';

let ctx;
let db;
mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      if (ctx.workspace) req.workspace = ctx.workspace;
      if (ctx.member) req.member = ctx.member;
      return { _id: 'u1' };
    },
  },
});
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });

const chain = (v) => ({ sort() { return this; }, lean: async () => v });
const Category = {
  find: (q) => chain(db.rows.filter((r) => r.workspaceId === q.workspaceId)),
  async bulkWrite(ops) {
    db.bulkWrites += 1;
    for (const { updateOne: { filter, update } } of ops) {
      const exists = db.rows.some((r) => r.workspaceId === filter.workspaceId && r.nameKey === filter.nameKey && r.isDefault);
      if (!exists) db.rows.push({ _id: `c${db.rows.length}`, ...update.$setOnInsert });
    }
  },
  async create(doc) { db.created.push(doc); return { toJSON: () => ({ ...doc, id: 'new' }) }; },
  findOneAndUpdate: (q, b) => { db.updates.push({ q, b }); return chain(db.rows.find((r) => r._id === q._id && r.workspaceId === q.workspaceId) || null); },
  findOneAndDelete: (q) => chain(db.rows.find((r) => r._id === q._id && r.workspaceId === q.workspaceId) || null),
};
mock.module(at('../models/Category.js'), { exports: { default: Category } });

const { default: handler, DEFAULT_CATEGORIES, ensureDefaultCategories } = await import('./categories.js');

const OWNER = { role: 'owner', status: 'accepted' };
const VIEWER = { role: 'viewer', status: 'accepted', permissions: { viewExpenses: true, editExpenses: false } };

async function call(method, query = {}, body) {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, headers: {}, query, body }, res);
  return res;
}

beforeEach(() => {
  ctx = { workspace: { _id: 'ws1', ownerId: 'u1' }, member: OWNER };
  db = { rows: [], created: [], updates: [], bulkWrites: 0 };
});

test('first load of an empty workspace seeds every default once', async () => {
  const r = await call('GET');
  assert.equal(r.code, 200);
  assert.equal(r.body.data.length, DEFAULT_CATEGORIES.length);
  assert.ok(r.body.data.every((c) => c.isDefault && c.workspaceId === 'ws1'));
  await call('GET');
  assert.equal(db.bulkWrites, 1, 'a workspace with categories is not seeded again');
});

test('two seeds racing still leave one copy of each default', async () => {
  await Promise.all([ensureDefaultCategories('ws1', 'u1'), ensureDefaultCategories('ws1', 'u1')]);
  assert.equal(db.rows.length, DEFAULT_CATEGORIES.length);
});

test('a duplicate-key error from a concurrent seed is not a failure', async () => {
  const original = Category.bulkWrite;
  Category.bulkWrite = async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); };
  try {
    await ensureDefaultCategories('ws1', 'u1');
  } finally {
    Category.bulkWrite = original;
  }
});

test('a viewer can list but not change categories', async () => {
  ctx = { workspace: { _id: 'ws1', ownerId: 'someone-else' }, member: VIEWER };
  assert.equal((await call('GET')).code, 200);
  assert.equal((await call('POST', {}, { name: 'x' })).code, 403);
  assert.equal((await call('DELETE', { id: ID })).code, 403);
  assert.equal(db.created.length, 0);
});

test('no workspace, no access', async () => {
  ctx = {};
  assert.equal((await call('GET')).code, 400);
});

test('new categories are never defaults and cannot move workspace', async () => {
  await call('POST', {}, { name: 'Pets', isDefault: true, workspaceId: 'ws2', $set: { x: 1 } });
  assert.deepEqual(db.created[0], { name: 'Pets', isDefault: false, workspaceId: 'ws1', createdBy: 'u1' });
});

test('updates and deletes stay inside the workspace; bad ids are refused', async () => {
  db.rows.push({ _id: ID, workspaceId: 'ws2', name: 'theirs' });
  assert.equal((await call('PUT', { id: ID }, { name: 'mine now' })).code, 404);
  assert.deepEqual(db.updates[0].q, { _id: ID, workspaceId: 'ws1' });
  assert.equal((await call('DELETE', { id: ID })).code, 404);
  assert.equal((await call('DELETE', { id: 'nope' })).code, 400);
  assert.equal((await call('PUT', { id: { $ne: 1 } }, { name: 'x' })).code, 400);
});
