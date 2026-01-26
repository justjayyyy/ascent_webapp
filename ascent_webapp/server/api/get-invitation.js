import 'dotenv/config';
import { connectDB } from '../lib/mongodb.js';
import SharedUser from '../models/SharedUser.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound } from '../lib/response.js';

// Public endpoint to get invitation details by token (no auth required)
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    await connectDB();
    // Support both /api/invitations/:token and /api/invitations?token=...
    const token = req.params?.token || req.query?.token;

    if (!token) {
      return error(res, 'Invitation token is required', 400);
    }

    // Find invitation by _id (token)
    const invitation = await SharedUser.findById(token).lean();

    if (!invitation) {
      return notFound(res, 'Invitation not found');
    }

    // Check if invitation is already accepted or rejected
    if (invitation.status !== 'pending') {
      return error(res, `Invitation has already been ${invitation.status}`, 400);
    }

    // Return invitation details (without sensitive info)
    const invitationData = {
      id: invitation._id.toString(),
      invitedEmail: invitation.invitedEmail,
      displayName: invitation.displayName,
      permissions: invitation.permissions,
      created_by: invitation.created_by,
      created_date: invitation.created_date
    };

    return success(res, invitationData);
  } catch (err) {
    console.error('[Get Invitation] Error:', err);
    return error(res, err.message || 'Failed to fetch invitation', 500);
  }
}
