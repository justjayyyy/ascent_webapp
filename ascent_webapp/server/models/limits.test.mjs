import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import { LIMITS } from './limits.js';
import ExpenseTransaction from './ExpenseTransaction.js';
import Note from './Note.js';
import Plan from './Plan.js';
import DashboardWidget from './DashboardWidget.js';

const row = (extra) => new ExpenseTransaction({ type: 'Expense', amount: 5, category: 'food', date: '2026-10-01', workspaceId: new mongoose.Types.ObjectId(), ...extra });
const errorsOf = async (doc) => Object.keys((await doc.validate().catch((e) => e))?.errors || {});

test('every model loads the limits first', async () => {
  const dir = new URL('./', import.meta.url);
  for (const file of await readdir(dir)) {
    if (!/^[A-Z]\w+\.js$/.test(file)) continue;
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL(file, dir), 'utf8');
    assert.match(source, /^import '\.\/limits\.js';/, file);
  }
});

test('a normal row passes', async () => {
  assert.deepEqual(await errorsOf(row({ description: 'Bakery', tags: ['x'] })), []);
});

test('text, numbers, lists and free-form fields have upper bounds', async () => {
  assert.deepEqual(await errorsOf(row({ description: 'x'.repeat(LIMITS.string + 1) })), ['description']);
  assert.deepEqual(await errorsOf(row({ amount: Infinity })), ['amount']);
  assert.deepEqual(await errorsOf(row({ amount: 1e16 })), ['amount']);
  assert.deepEqual(await errorsOf(row({ tags: ['x'.repeat(LIMITS.string + 1)] })), ['tags']);
  assert.deepEqual(await errorsOf(row({ tags: Array(LIMITS.array + 1).fill('x') })), ['tags']);
  const widget = new DashboardWidget({ settings: { blob: 'x'.repeat(LIMITS.mixed) } });
  assert.ok((await errorsOf(widget)).includes('settings'));
});

test('fields with their own limit keep it; long notes still fit', async () => {
  const plan = new Plan({ name: 'x'.repeat(201), workspaceId: new mongoose.Types.ObjectId() });
  assert.ok((await errorsOf(plan)).includes('name'));
  const note = new Note({ content: 'x'.repeat(50_000), workspaceId: new mongoose.Types.ObjectId() });
  assert.ok(!(await errorsOf(note)).includes('content'));
});

test('limits apply inside sub-documents and on updates', async () => {
  const plan = new Plan({ name: 'Rome', workspaceId: new mongoose.Types.ObjectId(), items: [{ id: 'a', amount: Infinity }] });
  assert.ok((await errorsOf(plan)).some((k) => k.startsWith('items')));
  const q = ExpenseTransaction.findOneAndUpdate({}, { $set: { description: 'x'.repeat(LIMITS.string + 1) } }, { runValidators: true });
  const err = await q.exec().catch((e) => e); // validation runs before the database is asked
  assert.equal(err?.name, 'ValidationError');
});
