import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChecklist } from './checklistMerge.js';

const it = (id, text = id, done = false) => ({ id, text, done });
const ids = (list) => list.map((i) => i.id);
const BASE = [it('a', 'milk'), it('b', 'eggs'), it('c', 'bread')];

test('without a base the sent list replaces the stored one (older apps)', () => {
  const mine = [it('x')];
  assert.equal(mergeChecklist(undefined, mine, BASE), mine);
});

test('two people ticking different items both stick', () => {
  const dana = [it('a', 'milk', true), it('b', 'eggs'), it('c', 'bread')];
  const current = [it('a', 'milk'), it('b', 'eggs', true), it('c', 'bread')]; // Sam ticked eggs meanwhile
  assert.deepEqual(mergeChecklist(BASE, dana, current).map((i) => i.done), [true, true, false]);
});

test('a field one person changed wins; fields they did not touch keep the other change', () => {
  const dana = [it('a', 'oat milk'), it('b', 'eggs'), it('c', 'bread')];
  const current = [it('a', 'milk', true), it('b', 'eggs'), it('c', 'bread')];
  assert.deepEqual(mergeChecklist(BASE, dana, current)[0], { id: 'a', text: 'oat milk', done: true });
});

test('additions from both sides are kept, each next to where it was added', () => {
  const dana = [it('a'), it('d', 'butter'), it('b'), it('c')];
  const current = [it('a'), it('b'), it('c'), it('e', 'jam')];
  assert.deepEqual(ids(mergeChecklist(BASE.map((i) => it(i.id)), dana, current)), ['a', 'd', 'b', 'c', 'e']);
  const first = [it('z'), it('a'), it('b'), it('c')];
  assert.deepEqual(ids(mergeChecklist(BASE, first, BASE)), ['z', 'a', 'b', 'c']);
});

test('removals from both sides stand, and an edit does not bring back what someone removed', () => {
  const dana = [it('a', 'milk', true), it('c', 'bread')]; // removed eggs, ticked milk
  const current = [it('b', 'eggs'), it('c', 'bread')]; // Sam removed milk
  assert.deepEqual(mergeChecklist(BASE, dana, current), [it('c', 'bread')]);
});

test('a reorder keeps the new order and places items others added next to their neighbours', () => {
  const dana = [it('c', 'bread'), it('a', 'milk'), it('b', 'eggs')];
  const current = [it('a', 'milk'), it('e', 'jam'), it('b', 'eggs'), it('c', 'bread')];
  assert.deepEqual(ids(mergeChecklist(BASE, dana, current)), ['c', 'a', 'e', 'b']);
});

test('nothing changed on this side leaves the current list as it is', () => {
  const current = [it('a', 'milk', true), it('c', 'bread'), it('f', 'tea')];
  assert.deepEqual(mergeChecklist(BASE, BASE, current), current);
});
