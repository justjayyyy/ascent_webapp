// Invitation tokens: a random secret per invitation, so a link cannot be guessed from the member id.
// Invitations made before tokens existed are still found by member id, except QR invitations,
// which anyone holding the link can use and so must have a secret.
import { randomBytes } from 'node:crypto';
import { isValidObjectId } from './validate.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export const newInviteToken = () => randomBytes(24).toString('base64url');

/** The value that goes in the invitation link. */
export const inviteKeyOf = (member) => member.inviteToken || String(member._id);

/** Finds { workspace, member } for an invitation token, or null. */
export async function findInvitation(Workspace, token, { lean = false } = {}) {
  const value = String(token || '');
  let query;
  let pick;
  if (TOKEN_RE.test(value)) {
    query = { 'members.inviteToken': value };
    pick = (m) => m.inviteToken === value;
  } else if (isValidObjectId(value)) {
    query = { 'members._id': value };
    pick = (m) => String(m._id) === value && !m.inviteToken && m.inviteKind !== 'link';
  } else {
    return null;
  }
  const found = Workspace.findOne(query);
  const workspace = await (lean ? found.lean() : found);
  const member = workspace?.members.find(pick);
  return member ? { workspace, member } : null;
}
