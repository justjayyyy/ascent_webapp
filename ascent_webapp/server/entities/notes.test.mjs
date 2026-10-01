// The notes handler: who may see, edit, share, pin and delete a note, against an in-memory collection.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const oid = () => new mongoose.Types.ObjectId().toString();

const OWNER = oid();
const EDITOR = oid();
const VIEWER = oid();
const OUTSIDER = oid();
const WS = oid();

let caller; // { user, member }
mock.module(at('../middleware/auth.js'), {
  exports: {
    authMiddleware: async (req) => {
      req.workspace = workspace;
      req.member = caller.member;
      return caller.user;
    },
  },
});
mock.module(at('../lib/mongodb.js'), { exports: { default: async () => {}, connectDB: async () => {} } });

// ---- a tiny in-memory collection with the bits of Mongo the handler uses ----
let rows = [];
let files = [];
const same = (a, b) => String(a) === String(b);
// Store ids as strings (structuredClone would turn ObjectIds into plain objects)
const norm = (v) => (v instanceof mongoose.Types.ObjectId ? v.toString()
  : Array.isArray(v) ? v.map(norm)
  : v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]))
  : v);
function matches(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((sub) => matches(doc, sub));
    if (k === 'collaborators.userId') return (doc.collaborators || []).some((c) => same(c.userId, v));
    if (v && typeof v === 'object' && !(v instanceof Date) && !mongoose.isValidObjectId(v)) {
      if ('$in' in v) return v.$in.some((x) => same(x, doc[k]));
      if ('$ne' in v && '$lt' in v) return doc[k] != null && doc[k] < v.$lt;
      if ('$ne' in v) return doc[k] !== v.$ne;
    }
    return same(doc[k], v) || doc[k] === v;
  });
}
function apply(doc, raw) {
  const update = norm(raw);
  Object.assign(doc, update.$set || {});
  for (const [f, v] of Object.entries(update.$addToSet || {})) if (!(doc[f] ||= []).some((x) => same(x, v))) doc[f].push(v);
  for (const [f, v] of Object.entries(update.$pull || {})) {
    doc[f] = (doc[f] || []).filter((x) => (typeof v === 'object' && v.userId ? !same(x.userId, v.userId) : !same(x, v)));
  }
  for (const [f, v] of Object.entries(update.$push || {})) (doc[f] ||= []).push(v);
}
const lean = (v) => ({ lean: async () => (v ? structuredClone(v) : v) });
const chain = (list) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => structuredClone(list) });
const Note = {
  find: (q) => chain(rows.filter((d) => matches(d, q))),
  findOne: (q) => lean(rows.find((d) => matches(d, q))),
  findById: (id) => lean(rows.find((d) => same(d._id, id))),
  async create(doc) {
    const row = norm({ _id: doc._id || oid(), items: [], tags: [], collaborators: [], reminders: [], attachments: [], trashedAt: null, ...doc });
    rows.push(row);
    return { toObject: () => structuredClone(row) };
  },
  findOneAndUpdate: (q, update) => {
    const doc = rows.find((d) => matches(d, q));
    if (doc) apply(doc, update);
    return lean(doc);
  },
  async updateOne(q, update) { const doc = rows.find((d) => matches(d, q)); if (doc) apply(doc, update); },
  async deleteOne(q) { rows = rows.filter((d) => !matches(d, q)); },
  async deleteMany(q) { const before = rows.length; rows = rows.filter((d) => !matches(d, q)); return { deletedCount: before - rows.length }; },
};
const NoteFile = {
  async create(doc) { const f = { _id: oid(), ...norm(doc), data: doc.data }; files.push(f); return f; },
  findOne: (q) => lean(files.find((f) => same(f._id, q._id) && same(f.noteId, q.noteId))),
  async deleteOne(q) { files = files.filter((f) => !same(f._id, q._id)); },
  async deleteMany(q) { files = files.filter((f) => !(q.noteId.$in || [q.noteId]).some((id) => same(id, f.noteId))); },
};
mock.module(at('../models/Note.js'), { exports: { default: Note } });
mock.module(at('../models/NoteFile.js'), { exports: { default: NoteFile } });

const { default: handler, fileBytes } = await import('./notes.js');

const workspace = {
  _id: WS,
  members: [
    { userId: OWNER, email: 'owner@x.test', status: 'accepted', role: 'owner' },
    { userId: EDITOR, email: 'ed@x.test', status: 'accepted', role: 'editor', permissions: { viewNotes: true, editNotes: true } },
    { userId: VIEWER, email: 'vi@x.test', status: 'accepted', role: 'viewer', permissions: { viewNotes: true } },
    { userId: OUTSIDER, email: 'out@x.test', status: 'accepted', role: 'viewer', permissions: {} },
  ],
};
const as = (id) => {
  const member = workspace.members.find((m) => m.userId === id);
  caller = { user: { _id: new mongoose.Types.ObjectId(id), email: member.email }, member };
};

async function call(method, query = {}, body) {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, query, body, headers: {} }, res);
  return res;
}

let shared;
let privateNote;
beforeEach(async () => {
  rows = [];
  files = [];
  as(OWNER);
  shared = (await call('POST', {}, { title: 'Groceries', type: 'checklist', items: [{ text: 'milk' }] })).body.data;
  privateNote = (await call('POST', {}, { title: 'Diary', isShared: false })).body.data;
});

test('members see shared notes and their own; private notes stay private', async () => {
  as(VIEWER);
  const list = (await call('GET')).body.data;
  assert.deepEqual(list.map((n) => n.title), ['Groceries']);
  assert.equal(list[0].myAccess, 'view');
  as(OUTSIDER); // a member without notes permission
  assert.deepEqual((await call('GET')).body.data, []);
  assert.equal((await call('GET', { id: privateNote.id, _single: 'true' })).code, 404);
});

test('editing follows the notes permission; viewers can read but not change', async () => {
  as(EDITOR);
  assert.equal((await call('PUT', { id: shared.id }, { title: 'Food' })).code, 200);
  as(VIEWER);
  const r = await call('PUT', { id: shared.id }, { title: 'Nope' });
  assert.equal(r.code, 403);
  assert.equal(rows.find((n) => n.title === 'Food') !== undefined, true);
});

test('only people with edit permission create notes', async () => {
  as(VIEWER);
  assert.equal((await call('POST', {}, { title: 'x' })).code, 403);
  as(EDITOR);
  assert.equal((await call('POST', {}, { title: 'x' })).code, 201);
});

test('pinning and archiving are personal, even for view-only readers', async () => {
  as(VIEWER);
  const r = await call('PUT', { id: shared.id }, { isPinned: true, isArchived: true });
  assert.equal(r.code, 200);
  assert.equal(r.body.data.isPinned, true);
  as(OWNER);
  const mine = (await call('GET', { id: shared.id, _single: 'true' })).body.data;
  assert.equal(mine.isPinned, false);
  assert.equal(mine.isArchived, false);
});

test('a refused update changes nothing, not even the caller\'s reminder', async () => {
  as(EDITOR);
  await call('PUT', { id: shared.id }, { reminder: '2026-12-01T09:00:00Z' });
  const r = await call('PUT', { id: shared.id }, { reminder: '2026-12-02T09:00:00Z', isShared: false });
  assert.equal(r.code, 403);
  const note = rows.find((n) => n._id === shared.id || String(n._id) === shared.id);
  assert.equal(note.reminders.length, 1);
  assert.equal(new Date(note.reminders[0].at).toISOString(), '2026-12-01T09:00:00.000Z');
  assert.equal(note.isShared, true);
});

test('an invalid reminder time is refused before anything is written', async () => {
  as(OWNER);
  await call('PUT', { id: shared.id }, { reminder: '2026-12-01T09:00:00Z' });
  assert.equal((await call('PUT', { id: shared.id }, { reminder: 'tomorrow-ish' })).code, 400);
  assert.equal(rows.find((n) => String(n._id) === shared.id).reminders.length, 1);
});

test('sharing and trash belong to the owner; collaborators must be accepted members', async () => {
  as(OWNER);
  const r = await call('PUT', { id: privateNote.id }, { collaborators: [{ userId: VIEWER, role: 'editor' }, { userId: oid(), role: 'editor' }, { userId: OWNER }] });
  assert.deepEqual(r.body.data.collaborators.map((c) => [c.userId, c.role]), [[VIEWER, 'editor']]);
  as(VIEWER); // now an editor of this one note, despite view-only notes permission
  assert.equal((await call('PUT', { id: privateNote.id }, { content: 'hello' })).code, 200);
  assert.equal((await call('PUT', { id: privateNote.id }, { trashed: true })).code, 403);
});

test('a collaborator can leave a note; only the owner deletes it, with its files', async () => {
  as(OWNER);
  await call('PUT', { id: privateNote.id }, { collaborators: [{ userId: VIEWER, role: 'viewer' }] });
  await call('POST', { action: 'file', id: privateNote.id }, { name: 'a.txt', type: 'text/plain', data: Buffer.from('hi').toString('base64') });
  as(VIEWER);
  assert.deepEqual((await call('DELETE', { id: privateNote.id })).body.data, { left: true, id: privateNote.id });
  assert.equal((await call('GET', { id: privateNote.id, _single: 'true' })).code, 404);
  as(EDITOR); // can edit shared notes, but this one is private
  assert.equal((await call('DELETE', { id: privateNote.id })).code, 404);
  as(OWNER);
  assert.equal((await call('DELETE', { id: privateNote.id })).body.data.deleted, true);
  assert.equal(files.length, 0);
});

test('files: size and count limits, view-only readers cannot attach', async () => {
  as(OWNER);
  const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
  assert.equal((await call('POST', { action: 'file', id: shared.id }, { data: big })).code, 413);
  assert.equal((await call('POST', { action: 'file', id: shared.id }, { data: '' })).code, 400);
  const ok = await call('POST', { action: 'file', id: shared.id }, { name: 'n.txt', data: Buffer.from('x').toString('base64') });
  assert.equal(ok.code, 201);
  const fileId = ok.body.data.attachments[0].id;
  as(VIEWER);
  assert.equal((await call('GET', { action: 'file', id: shared.id, fileId })).body.data.data, Buffer.from('x').toString('base64'));
  assert.equal((await call('POST', { action: 'file', id: shared.id }, { data: 'eA==' })).code, 403);
  assert.equal((await call('GET', { action: 'file', id: 'nope' })).code, 400);
});

test('an offline-created note keeps its id, and a retried create returns it instead of a copy', async () => {
  as(OWNER);
  const id = oid();
  const first = await call('POST', {}, { id, title: 'Offline' });
  const again = await call('POST', {}, { id, title: 'Offline' });
  assert.equal(first.code, 201);
  assert.equal(again.code, 200);
  assert.equal(rows.filter((n) => String(n._id) === id).length, 1);
  as(EDITOR);
  assert.equal((await call('POST', {}, { id, title: 'Hijack' })).code, 409);
});

test('notes in the trash past the grace period are purged with their files', async () => {
  as(OWNER);
  const note = rows.find((n) => String(n._id) === privateNote.id);
  note.trashedAt = new Date(Date.now() - 8 * 86400000);
  files.push({ _id: oid(), noteId: privateNote.id });
  await call('GET');
  assert.equal(rows.some((n) => String(n._id) === privateNote.id), false);
  assert.equal(files.length, 0);
});

test('input is cleaned: lengths, tags, colours, list items', async () => {
  as(OWNER);
  const r = await call('POST', {}, {
    title: 'x'.repeat(900), tags: ['a', 'A', ' b ', '', ...Array.from({ length: 40 }, (_, i) => `t${i}`)],
    color: 'url(javascript:1)', items: [{ text: 'one', done: 'yes', evil: 1 }],
  });
  const n = r.body.data;
  assert.equal(n.title.length, 500);
  assert.deepEqual(n.tags.slice(0, 2), ['a', 'b']);
  assert.equal(n.tags.length, 30);
  assert.equal(n.color, undefined);
  assert.deepEqual(Object.keys(n.items[0]).sort(), ['done', 'id', 'text']);
  assert.equal(n.items[0].done, true);
});

test('file bytes come back exactly, never the memory around them', () => {
  const small = Buffer.from('aGk=', 'base64'); // a slice of Node's shared pool
  assert.equal(fileBytes(small).toString(), 'hi');
  const binary = { buffer: new Uint8Array([104, 105]) }; // what a lean read returns
  assert.equal(fileBytes(binary).toString(), 'hi');
  const sliced = new Uint8Array([0, 104, 105, 0]).subarray(1, 3);
  assert.equal(fileBytes({ buffer: sliced }).toString(), 'hi');
  assert.equal(fileBytes(sliced).toString(), 'hi');
  assert.equal(fileBytes(structuredClone(small)).toString(), 'hi'); // a copy that kept the pool around it
});
