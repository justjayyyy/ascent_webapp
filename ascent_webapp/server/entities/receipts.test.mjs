// The receipts vault handler against a throwaway in-memory MongoDB: what the list carries, fetching
// a file, editing, and who may delete.
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const oid = () => new mongoose.Types.ObjectId();

const WS = oid();
const OTHER_WS = oid();
const ALICE = { _id: oid(), email: 'alice@example.com' };
const BOB = { _id: oid(), email: 'bob@example.com' };
let caller; // { user, member, workspaceId }

mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      req.workspace = { _id: caller.workspaceId || WS };
      req.member = caller.member;
      return caller.user;
    },
  },
});
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });

let mongo;
let handler;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('receipts_test'));
  handler = (await import('./receipts.js')).default;
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const as = (user, role = 'member', workspaceId) => { caller = { user, member: { userId: user._id, role, status: 'accepted' }, workspaceId }; };
async function call(method, { query = {}, body } = {}) {
  const res = {
    statusCode: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; },
  };
  await handler({ method, query, body, headers: {} }, res);
  return { code: res.statusCode, data: res.body?.data, error: res.body?.error };
}

const PHOTO = Buffer.from('fake jpeg bytes').toString('base64');
const THUMB = Buffer.from('tiny').toString('base64');

test('a photo is kept with its details; the list leaves the bytes out', async () => {
  as(ALICE);
  const made = await call('POST', { body: { type: 'image/jpeg', data: PHOTO, thumb: THUMB, store: '  Shufersal ', date: '2026-10-01', total: '123.456', currency: 'ILS' } });
  assert.equal(made.code, 201);
  assert.equal(made.data.store, 'Shufersal');
  assert.equal(made.data.total, 123.46);
  assert.equal(made.data.hasThumb, true);
  assert.equal(made.data.addedBy, 'alice@example.com');
  assert.equal(made.data.data, undefined);

  const list = await call('GET');
  const row = list.data.find((r) => r.id === made.data.id);
  assert.ok(row);
  assert.equal(row.data, undefined);
  assert.equal(row.thumb, undefined);
  assert.equal(row.hasThumb, true);

  const file = await call('GET', { query: { id: made.data.id, part: 'file' } });
  assert.equal(Buffer.from(file.data.data, 'base64').toString(), 'fake jpeg bytes');
  const thumb = await call('GET', { query: { id: made.data.id, part: 'thumb' } });
  assert.equal(Buffer.from(thumb.data.data, 'base64').toString(), 'tiny');
});

test('only photos and PDFs, and nothing over the size limit', async () => {
  as(ALICE);
  assert.equal((await call('POST', { body: { type: 'text/html', data: PHOTO } })).code, 400);
  assert.equal((await call('POST', { body: { type: 'image/jpeg', data: 'not base64!' } })).code, 400);
  const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
  assert.equal((await call('POST', { body: { type: 'application/pdf', data: big } })).code, 413);
  const pdf = await call('POST', { body: { type: 'application/pdf', data: PHOTO, thumb: THUMB } });
  assert.equal(pdf.code, 201);
  assert.equal(pdf.data.hasThumb, false); // a PDF gets no photo preview
});

test('anyone in the household can edit; bad values are dropped, not stored', async () => {
  as(ALICE);
  const { data: r } = await call('POST', { body: { type: 'image/jpeg', data: PHOTO, thumb: THUMB } });
  as(BOB);
  const edited = await call('PATCH', { query: { id: r.id }, body: { store: 'Rami Levy', total: -5, date: 'yesterday', currency: 'ils', note: 'warranty 1y' } });
  assert.equal(edited.code, 200);
  assert.deepEqual([edited.data.store, edited.data.total, edited.data.date, edited.data.currency, edited.data.note], ['Rami Levy', null, '', null, 'warranty 1y']);
  assert.equal(edited.data.hasThumb, true);
});

test('another household cannot see or touch a receipt', async () => {
  as(ALICE);
  const { data: r } = await call('POST', { body: { type: 'image/jpeg', data: PHOTO } });
  as(BOB, 'owner', OTHER_WS);
  assert.equal((await call('GET', { query: { id: r.id, part: 'file' } })).code, 404);
  assert.equal((await call('PATCH', { query: { id: r.id }, body: { store: 'x' } })).code, 404);
  assert.equal((await call('DELETE', { query: { id: r.id } })).code, 404);
  assert.ok(!(await call('GET')).data.some((x) => x.id === r.id));
});

test('whoever added it, or an admin, may delete it', async () => {
  as(ALICE);
  const { data: r } = await call('POST', { body: { type: 'image/jpeg', data: PHOTO } });
  as(BOB);
  assert.equal((await call('DELETE', { query: { id: r.id } })).code, 403);
  as(BOB, 'admin');
  assert.equal((await call('DELETE', { query: { id: r.id } })).code, 200);
  as(ALICE);
  const { data: mine } = await call('POST', { body: { type: 'image/jpeg', data: PHOTO } });
  assert.equal((await call('DELETE', { query: { id: mine.id } })).code, 200);
  assert.equal((await call('GET', { query: { id: mine.id, part: 'file' } })).code, 404);
});
