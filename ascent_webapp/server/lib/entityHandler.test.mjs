// Tenant isolation and permission checks of the generic entity handler, against a stub model (no database).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const qs = require('qs'); // what Express uses for req.query
const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

let ctx; // { workspace, member } the real authMiddleware would attach
mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      if (ctx.workspace) req.workspace = ctx.workspace;
      if (ctx.member) req.member = ctx.member;
      return { _id: 'u1', email: 'u@example.com' };
    },
  },
});
mock.module(at('./mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });
const { createEntityHandler } = await import('./entityHandler.js');

const PATHS = new Set(['amount', 'category', 'isActive', 'status', 'workspaceId', 'createdBy']);
function model() {
  const calls = { find: [], update: [], del: [], create: [] };
  const chain = (v) => ({ sort() { return this; }, limit() { return this; }, lean: async () => v });
  return {
    calls, modelName: 'Tx', schema: { path: (k) => PATHS.has(k) },
    find(q) { calls.find.push(structuredClone(q)); return chain([]); },
    findOneAndUpdate(q, b) { calls.update.push({ q: structuredClone(q), b }); return chain({ _id: 'x' }); },
    findOneAndDelete(q) { calls.del.push(structuredClone(q)); return chain({ _id: 'x' }); },
    findById: () => chain(null),
    async create(d) { calls.create.push(d); return { toJSON: () => ({ ...d, _id: 'n' }) }; },
  };
}
const WS = { _id: 'ws1', ownerId: 'someone' };
const OWNER = { role: 'owner', status: 'accepted' };
const VIEWER = { role: 'viewer', status: 'accepted', permissions: { viewExpenses: true, editExpenses: false } };
const PERM = { read: 'viewExpenses', write: 'editExpenses' };

async function call(M, method, query = '', body, opts) {
  const res = { code: 200, headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await createEntityHandler(M, opts)({ method, headers: ctx.headers ?? {}, query: qs.parse(query), body }, res);
  return res;
}

test('no workspace context: refused, model never touched', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'POST']) {
    ctx = { headers: {} };
    const M = model();
    const r = await call(M, method, 'id=abc', { amount: 1 });
    assert.equal(r.code, 400, method);
    assert.deepEqual(M.calls, { find: [], update: [], del: [], create: [] });
  }
  ctx = { headers: { 'x-workspace-id': 'other' } }; // header for a workspace the caller is not in
  const M = model();
  assert.equal((await call(M, 'GET')).code, 403);
  assert.equal(M.calls.find.length, 0);
});

test('list is always scoped to the caller workspace', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  await call(M, 'GET', 'sort=-date&limit=5');
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1' });
});

test('tenant fields and operators in the query string cannot change the scope', async () => {
  ctx = { workspace: WS, member: OWNER };
  for (const q of ['workspaceId=66f000000000000000000001', 'workspaceId[$ne]=0', 'createdBy=x', 'category[$regex]=.*', 'amount[$gt]=0', '$where=1', 'nope=1']) {
    const M = model();
    await call(M, 'GET', q);
    assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1' }, q);
  }
});

test('legitimate filters still work', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  await call(M, 'GET', 'status=pending&isActive=true&created_by=u%40example.com&id=abc');
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1', status: 'pending', isActive: 'true', _id: 'abc' });
});

test('update and delete stay in the workspace and cannot move rows or use operators', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  await call(M, 'PUT', 'id=abc', { amount: 5, workspaceId: 'ws2', createdBy: 'x', _id: 'z', $set: { amount: 9 } });
  assert.deepEqual(M.calls.update[0].q, { _id: 'abc', workspaceId: 'ws1' });
  assert.deepEqual(M.calls.update[0].b, { amount: 5 });
  await call(M, 'DELETE', 'id=abc');
  assert.deepEqual(M.calls.del[0], { _id: 'abc', workspaceId: 'ws1' });
  const N = model();
  await call(N, 'DELETE', 'id[$ne]=1');
  assert.equal(N.calls.del.length, 0);
});

test('a view-only member can read but not write', async () => {
  ctx = { workspace: WS, member: VIEWER };
  const M = model();
  assert.equal((await call(M, 'GET', '', undefined, { permission: PERM })).code, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await call(M, method, 'id=abc', { amount: 1 }, { permission: PERM })).code, 403, method);
  }
  assert.deepEqual([M.calls.update.length, M.calls.del.length, M.calls.create.length], [0, 0, 0]);
});

test('owners, admins and editors with the permission can write; members without view cannot read', async () => {
  for (const member of [OWNER, { role: 'admin', status: 'accepted' }, { role: 'editor', permissions: { editExpenses: true } }]) {
    ctx = { workspace: WS, member };
    assert.equal((await call(model(), 'POST', '', { amount: 1 }, { permission: PERM })).code, 201);
  }
  ctx = { workspace: WS, member: { role: 'viewer', permissions: { viewExpenses: false } } };
  assert.equal((await call(model(), 'GET', '', undefined, { permission: PERM })).code, 403);
});
