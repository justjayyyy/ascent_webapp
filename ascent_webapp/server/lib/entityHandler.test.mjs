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
const ID = '66f0000000000000000000ab'; // a well-formed row id
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
  await call(M, 'GET', `status=pending&isActive=true&created_by=u%40example.com&id=${ID}`);
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1', status: 'pending', isActive: 'true', _id: ID });
});

test('update and delete stay in the workspace and cannot move rows or use operators', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  await call(M, 'PUT', `id=${ID}`, { amount: 5, workspaceId: 'ws2', createdBy: 'x', _id: 'z', $set: { amount: 9 } });
  assert.deepEqual(M.calls.update[0].q, { _id: ID, workspaceId: 'ws1' });
  assert.deepEqual(M.calls.update[0].b, { amount: 5 });
  await call(M, 'DELETE', `id=${ID}`);
  assert.deepEqual(M.calls.del[0], { _id: ID, workspaceId: 'ws1' });
  const N = model();
  await call(N, 'DELETE', 'id[$ne]=1');
  assert.equal(N.calls.del.length, 0);
});

test('a view-only member can read but not write', async () => {
  ctx = { workspace: WS, member: VIEWER };
  const M = model();
  assert.equal((await call(M, 'GET', '', undefined, { permission: PERM })).code, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await call(M, method, `id=${ID}`, { amount: 1 }, { permission: PERM })).code, 403, method);
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

// A model with a unique (workspaceId, dedupeKey) index, like ExpenseTransaction
function keyedModel() {
  const rows = [];
  const dup = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  const lean = (v) => ({ lean: async () => v });
  return {
    rows, modelName: 'Tx', schema: { path: (k) => PATHS.has(k) || k === 'dedupeKey' },
    async create(d) {
      if (d.dedupeKey && rows.some((r) => r.dedupeKey === d.dedupeKey)) throw dup();
      const row = { ...d, _id: `id${rows.length}` };
      rows.push(row);
      return { toJSON: () => ({ ...row }) };
    },
    async insertMany(list) {
      const out = [];
      for (const d of list) {
        if (d.dedupeKey && rows.some((r) => r.dedupeKey === d.dedupeKey)) throw dup();
        const row = { ...d, _id: `id${rows.length}` };
        rows.push(row);
        out.push({ toJSON: () => ({ ...row }) });
      }
      return out;
    },
    findOne: (q) => lean(rows.find((r) => r.dedupeKey === q.dedupeKey && r.workspaceId === q.workspaceId) || null),
    find: (q) => lean(rows.filter((r) => q.dedupeKey.$in.includes(r.dedupeKey) && r.workspaceId === q.workspaceId)),
  };
}

test('a retried offline upload returns the stored row instead of adding a second one', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = keyedModel();
  const body = { amount: 18, category: 'food', dedupeKey: 'app:4f1c2a9e-0000-4000-8000-000000000001' };
  const first = await call(M, 'POST', '', body);
  const retry = await call(M, 'POST', '', body);
  assert.equal(first.code, 201);
  assert.equal(retry.code, 200);
  assert.equal(M.rows.length, 1);
  assert.equal(retry.body.data.id, first.body.data._id);
});

test('a retried offline batch fills in only the rows that are missing', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = keyedModel();
  const key = (i) => `app:4f1c2a9e-0000-4000-8000-00000000000${i}:${i}`;
  await call(M, 'POST', '', [{ amount: 1, dedupeKey: key(1) }]);
  const r = await call(M, 'POST', '', [1, 2, 3].map((i) => ({ amount: i, dedupeKey: key(i) })));
  assert.equal(r.code, 200);
  assert.equal(M.rows.length, 3);
  assert.deepEqual(r.body.data.map((d) => d.amount), [1, 2, 3]);
});

test('clients cannot set automation dedupe keys', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = keyedModel();
  await call(M, 'POST', '', { amount: 1, dedupeKey: 'wallet:abc123' });
  assert.equal(M.rows[0].dedupeKey, undefined);
});

test('a malformed id is refused before the database sees it', async () => {
  ctx = { workspace: WS, member: OWNER };
  for (const [method, q] of [['GET', 'id=abc&_single=true'], ['PUT', 'id=abc'], ['DELETE', 'id=1'], ['GET', 'id[$ne]=1']]) {
    const M = model();
    const r = await call(M, method, q, { amount: 1 });
    assert.equal(r.code, 400, `${method} ${q}`);
    assert.deepEqual([M.calls.find.length, M.calls.update.length, M.calls.del.length], [0, 0, 0]);
  }
});

test('a row that is missing or in another workspace is simply not found (no existence probe)', async () => {
  ctx = { workspace: WS, member: OWNER };
  const chain = (v) => ({ lean: async () => v });
  let probed = false;
  const M = {
    modelName: 'Tx', schema: { path: () => true },
    findOneAndUpdate: () => chain(null),
    findOneAndDelete: () => chain(null),
    findOne: () => chain(null),
    findById: () => { probed = true; return chain({ _id: ID }); },
  };
  assert.equal((await call(M, 'PUT', `id=${ID}`, { amount: 1 })).code, 404);
  assert.equal((await call(M, 'DELETE', `id=${ID}`)).code, 404);
  assert.equal((await call(M, 'GET', `id=${ID}&_single=true`)).code, 404);
  assert.equal(probed, false);
});

test('an update cannot set an automation dedupe key, and an empty update is refused', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  M.schema = { path: (k) => PATHS.has(k) || k === 'dedupeKey' };
  await call(M, 'PUT', `id=${ID}`, { amount: 2, dedupeKey: 'wallet:abc' });
  assert.deepEqual(M.calls.update[0].b, { amount: 2 });
  const r = await call(M, 'PUT', `id=${ID}`, { workspaceId: 'ws2', _id: 'z' });
  assert.equal(r.code, 400);
  assert.equal(M.calls.update.length, 1);
});

test('validation and cast errors are the caller\'s fault (400), anything else is a 500 without details', async () => {
  ctx = { workspace: WS, member: OWNER };
  const failing = (err) => ({ ...model(), async create() { throw err; } });
  const invalid = Object.assign(new Error('bad'), { name: 'ValidationError', errors: { amount: { message: 'amount is required' } } });
  let r = await call(failing(invalid), 'POST', '', { category: 'x' });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /amount is required/);
  r = await call(failing(Object.assign(new Error('cast'), { name: 'CastError', path: 'amount' })), 'POST', '', { amount: 'lots' });
  assert.equal(r.code, 400);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  r = await call(failing(new Error('connection string mongodb://secret@host')), 'POST', '', { amount: 1 });
  process.env.NODE_ENV = prev;
  assert.equal(r.code, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /secret/);
});

test('an empty body or empty batch is refused', async () => {
  ctx = { workspace: WS, member: OWNER };
  for (const body of [undefined, {}, []]) {
    const M = model();
    assert.equal((await call(M, 'POST', '', body)).code, 400, JSON.stringify(body));
    assert.equal(M.calls.create.length, 0);
  }
});

test('the list limit is bounded and the sort field cannot be an expression', async () => {
  ctx = { workspace: WS, member: OWNER };
  const seen = [];
  const M = {
    ...model(),
    find() { return { sort(s) { seen.push(['sort', s]); return this; }, limit(l) { seen.push(['limit', l]); return this; }, lean: async () => [{ _id: { toString: () => 'r1' } }] }; },
  };
  const r = await call(M, 'GET', 'limit=999999&sort=$where');
  assert.deepEqual(seen, [['sort', '-created_date'], ['limit', 10000]]);
  assert.equal(r.body.data[0].id, 'r1');
  seen.length = 0;
  await call(M, 'GET', 'limit=-5&sort=-date');
  assert.deepEqual(seen, [['sort', '-date'], ['limit', 1]]);
});

test('shared-only entities: members see their own rows and shared ones, the owner sees all', async () => {
  ctx = { workspace: WS, member: { role: 'editor', permissions: { viewBudgets: true } } };
  const M = model();
  await call(M, 'GET', '', undefined, { checkSharing: true });
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1', $or: [{ createdBy: 'u1' }, { isShared: true }] });
  ctx = { workspace: { _id: 'ws1', ownerId: 'u1' }, member: OWNER };
  const N = model();
  await call(N, 'GET', '', undefined, { checkSharing: true });
  assert.deepEqual(N.calls.find[0], { workspaceId: 'ws1' });
});

test('date ranges apply to the entity date field, inclusive, and only well-formed dates', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  await call(M, 'GET', 'from=2025-08-01&to=2025-09-30', undefined, { dateField: 'date' });
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1', date: { $gte: '2025-08-01', $lte: '2025-09-30￿' } });
  await call(M, 'GET', 'from=2025-08-01', undefined, { dateField: 'date' });
  assert.deepEqual(M.calls.find[1], { workspaceId: 'ws1', date: { $gte: '2025-08-01' } });
  for (const q of ['from=yesterday', 'to=2025-13', 'from[$gt]=', 'from=2025-08-01T00:00']) {
    assert.equal((await call(model(), 'GET', q, undefined, { dateField: 'date' })).code, 400, q);
  }
  assert.equal((await call(model(), 'GET', 'from=2025-08-01')).code, 400, 'entities without a date field refuse ranges');
});

test('has=<field> lists rows where a real field is set, regardless of date', async () => {
  ctx = { workspace: WS, member: OWNER };
  const M = model();
  M.schema = { path: (k) => (PATHS.has(k) || k === 'split' ? { instance: k === 'split' ? 'Embedded' : 'String' } : undefined) };
  await call(M, 'GET', 'has=category');
  assert.deepEqual(M.calls.find[0], { workspaceId: 'ws1', category: { $exists: true, $nin: [null, ''] } });
  await call(M, 'GET', 'has=split'); // a sub-document cannot be compared with ''
  assert.deepEqual(M.calls.find[1], { workspaceId: 'ws1', split: { $exists: true, $ne: null } });
  for (const q of ['has=workspaceId', 'has=nope', 'has=$where', 'has=a.b', 'has[$ne]=1']) {
    assert.equal((await call(model(), 'GET', q)).code, 400, q);
  }
});
