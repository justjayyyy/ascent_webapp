import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { findInvitation, inviteKeyOf, newInviteToken } from './invitations.js';

const oid = () => new mongoose.Types.ObjectId();
const token = newInviteToken();
const legacyEmail = { _id: oid(), inviteKind: 'email', email: 'a@x.test', inviteToken: null };
const legacyLink = { _id: oid(), inviteKind: 'link', inviteToken: null };
const withToken = { _id: oid(), inviteKind: 'link', inviteToken: token };
const workspace = { _id: oid(), members: [legacyEmail, legacyLink, withToken] };

// Answers like Workspace.findOne for the two queries findInvitation makes
const Workspace = {
  findOne(q) {
    const [[key, value]] = Object.entries(q);
    const hit = workspace.members.some((m) => String(key === 'members._id' ? m._id : m.inviteToken) === String(value));
    const result = hit ? workspace : null;
    return { lean: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  },
};

test('tokens are 32 url-safe characters and never repeat', () => {
  const many = new Set(Array.from({ length: 200 }, newInviteToken));
  assert.equal(many.size, 200);
  for (const t of many) assert.match(t, /^[A-Za-z0-9_-]{32}$/);
});

test('the link uses the token, or the member id for invitations made before tokens', () => {
  assert.equal(inviteKeyOf(withToken), token);
  assert.equal(inviteKeyOf(legacyEmail), String(legacyEmail._id));
});

test('findInvitation finds by token, and by id only for old email invitations', async () => {
  assert.equal((await findInvitation(Workspace, token)).member, withToken);
  assert.equal((await findInvitation(Workspace, token, { lean: true })).member, withToken);
  assert.equal((await findInvitation(Workspace, String(legacyEmail._id))).member, legacyEmail);
  assert.equal(await findInvitation(Workspace, String(legacyLink._id)), null);
  assert.equal(await findInvitation(Workspace, String(withToken._id)), null);
  assert.equal(await findInvitation(Workspace, newInviteToken()), null);
  for (const bad of ['', null, undefined, 'abc', { $ne: null }]) assert.equal(await findInvitation(Workspace, bad), null);
});
