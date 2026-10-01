// The change counter that lets other members' open apps refresh live.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const at = (p) => new URL(p, import.meta.url).href;
const bumps = [];
mock.module(at('../models/Workspace.js'), {
  exports: { default: { updateOne: async (filter, update) => { bumps.push({ filter, update }); } } },
});
const { trackChanges } = await import('./live.js');

function fakeRes() {
  const sent = [];
  return { sent, statusCode: 200, json(body) { sent.push(body); return this; } };
}

const run = async (req, res, respond) => {
  const settled = trackChanges(req, res);
  respond(res);
  await settled();
};

test('a successful write bumps the workspace and still answers', async () => {
  bumps.length = 0;
  const res = fakeRes();
  await run({ method: 'POST', workspace: { _id: 'w1' } }, res, (r) => r.json({ ok: true }));
  assert.deepEqual(bumps, [{ filter: { _id: 'w1' }, update: { $inc: { dataRev: 1 } } }]);
  assert.deepEqual(res.sent, [{ ok: true }]);
});

test('reads, failures and writes without a workspace leave the counter alone', async () => {
  bumps.length = 0;
  const read = fakeRes();
  await run({ method: 'GET', workspace: { _id: 'w1' } }, read, (r) => r.json([]));
  const failed = fakeRes();
  failed.statusCode = 403;
  await run({ method: 'DELETE', workspace: { _id: 'w1' } }, failed, (r) => r.json({ error: 'no' }));
  const none = fakeRes();
  await run({ method: 'PUT' }, none, (r) => r.json({ ok: true }));
  assert.equal(bumps.length, 0);
  assert.equal(read.sent.length + failed.sent.length + none.sent.length, 3);
});

test('token-authenticated automation names its workspace explicitly', async () => {
  bumps.length = 0;
  const res = fakeRes();
  await run({ method: 'POST', liveWorkspaceId: 'w2' }, res, (r) => r.json({ outcome: 'created' }));
  assert.equal(bumps[0].filter._id, 'w2');
});
