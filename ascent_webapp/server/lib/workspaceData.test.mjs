import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import { WORKSPACE_MODELS, deleteWorkspaceData } from './workspaceData.js';

test('every model stored per workspace is deleted with the workspace', async () => {
  const dir = new URL('../models/', import.meta.url);
  // Model files only (Name.js), not the tests and helpers next to them
  for (const file of await readdir(dir)) if (/^[A-Z]\w+\.js$/.test(file)) await import(new URL(file, dir).href);
  const scoped = mongoose.modelNames()
    .map((name) => mongoose.model(name))
    .filter((Model) => Model.schema.path('workspaceId'));
  const missing = scoped.filter((Model) => !WORKSPACE_MODELS.includes(Model)).map((Model) => Model.modelName);
  assert.deepEqual(missing, []);
});

test('deleteWorkspaceData removes rows by workspace and clears user pointers', async () => {
  const calls = [];
  const restore = [];
  const stub = (target, name, fn) => { restore.push([target, name, target[name]]); target[name] = fn; };
  for (const Model of WORKSPACE_MODELS) stub(Model, 'deleteMany', async (q) => { calls.push([Model.modelName, 'deleteMany', q]); });
  const User = mongoose.model('User');
  stub(User, 'updateMany', async (q, u) => { calls.push(['User', 'updateMany', q, u]); });
  try {
    await deleteWorkspaceData('w1');
  } finally {
    for (const [target, name, fn] of restore) target[name] = fn;
  }
  assert.equal(calls.filter((c) => c[1] === 'deleteMany').length, WORKSPACE_MODELS.length);
  assert.ok(calls.every((c) => c[1] !== 'deleteMany' || c[2].workspaceId === 'w1'));
  assert.ok(calls.some((c) => c[0] === 'User' && c[2].defaultWorkspace === 'w1'));
  assert.ok(calls.some((c) => c[0] === 'User' && c[2].shortcutWorkspaceId === 'w1'));
});
