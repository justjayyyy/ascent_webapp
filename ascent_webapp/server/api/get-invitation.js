import { connectDB } from '../lib/mongodb.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound, serverError } from '../lib/response.js';
import { findInvitation } from '../lib/invitations.js';

// Public endpoint to get invitation details by token (no auth required)
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    await connectDB();
    const found = await findInvitation(Workspace, req.params?.token || req.query?.token, { lean: true });
    if (!found) return notFound(res, 'Invitation not found');
    const { workspace, member: invitation } = found;

    // Check if invitation is already accepted or rejected
    if (invitation.status !== 'pending') {
      return error(res, `Invitation has already been ${invitation.status}`, 400);
    }

    // Return invitation details (without sensitive info)
    const inviter = await User.findById(invitation.invitedBy || workspace.ownerId).select('full_name email').lean();

    const isLink = invitation.inviteKind === 'link';
    const expired = isLink && (!invitation.expiresAt || new Date(invitation.expiresAt) <= new Date());

    const invitationData = {
      kind: isLink ? 'link' : 'email',
      expired,
      expiresAt: invitation.expiresAt || null,
      workspaceId: workspace._id.toString(),
      workspaceName: workspace.name,
      invitedEmail: invitation.email,
      role: invitation.role,
      permissions: invitation.permissions,
      invitedByName: inviter?.full_name || inviter?.email || '',
      hasAccount: !!invitation.userId,
      created_date: invitation.invitedAt || workspace.created_date
    };

    return success(res, invitationData);
  } catch (err) {
    return serverError(res, err);
  }
}
