import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPermissions, detectPreset, canManageMember, canAssignRole, levelOf, withLevel, escapeHtml, presetFor,
} from './workspaceAccess.js';

const ws = { ownerId: 'u-owner' };
const owner = { _id: 'm1', userId: 'u-owner', role: 'owner' };
const admin = { _id: 'm2', userId: 'u-admin', role: 'admin' };
const admin2 = { _id: 'm3', userId: 'u-admin2', role: 'admin' };
const editor = { _id: 'm4', userId: 'u-editor', role: 'editor' };
const viewer = { _id: 'm5', userId: 'u-viewer', role: 'viewer' };

test('viewers cannot manage anyone', () => {
  assert.equal(canManageMember(ws, viewer, editor), false);
  assert.equal(canManageMember(ws, editor, viewer), false);
});

test('owner manages everyone but themselves; the owner row is immutable', () => {
  assert.equal(canManageMember(ws, owner, admin), true);
  assert.equal(canManageMember(ws, owner, viewer), true);
  assert.equal(canManageMember(ws, owner, owner), false);
  assert.equal(canManageMember(ws, admin, owner), false);
});

test('admins manage editors and viewers, not owners, admins or themselves', () => {
  assert.equal(canManageMember(ws, admin, editor), true);
  assert.equal(canManageMember(ws, admin, viewer), true);
  assert.equal(canManageMember(ws, admin, admin2), false);
  assert.equal(canManageMember(ws, admin, admin), false);
});

test('only the owner can hand out admin; owner is never assignable', () => {
  assert.equal(canAssignRole(ws, owner, 'admin'), true);
  assert.equal(canAssignRole(ws, admin, 'admin'), false);
  assert.equal(canAssignRole(ws, admin, 'editor'), true);
  assert.equal(canAssignRole(ws, owner, 'owner'), false);
  assert.equal(canAssignRole(ws, owner, 'root'), false);
});

test('buildPermissions drops unknown keys, never grants manageUsers, and edit implies view', () => {
  const p = buildPermissions('editor', { editNotes: true, manageUsers: true, isAdmin: true, viewExpenses: 'yes' });
  assert.equal(p.editNotes, true);
  assert.equal(p.viewNotes, true);
  assert.equal(p.manageUsers, false);
  assert.equal(p.viewExpenses, false);
  assert.equal('isAdmin' in p, false);
});

test('buildPermissions without input falls back to the role preset; admins are always full access', () => {
  assert.deepEqual(buildPermissions('viewer'), presetFor('viewer'));
  assert.equal(buildPermissions('admin', { viewExpenses: false }).viewExpenses, true);
});

test('detectPreset recognises presets and flags anything else as custom', () => {
  assert.equal(detectPreset(presetFor('editor')), 'editor');
  assert.equal(detectPreset(presetFor('viewer')), 'viewer');
  assert.equal(detectPreset(withLevel(presetFor('viewer'), 'Notes', 'edit')), 'custom');
});

test('levelOf and withLevel round-trip', () => {
  const p = withLevel({}, 'Budgets', 'edit');
  assert.equal(levelOf(p, 'Budgets'), 'edit');
  assert.equal(levelOf(withLevel(p, 'Budgets', 'view'), 'Budgets'), 'view');
  assert.equal(levelOf(withLevel(p, 'Budgets', 'none'), 'Budgets'), 'none');
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});
