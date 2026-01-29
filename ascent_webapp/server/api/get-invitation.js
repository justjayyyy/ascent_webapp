import 'dotenv/config';
import { connectDB } from '../lib/mongodb.js';
import Workspace from '../models/Workspace.js';
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

    // Find workspace containing the member invitation
    const workspace = await Workspace.findOne({ 'members._id': token }).lean();

    if (!workspace) {
      return notFound(res, 'Invitation not found');
    }

    // Find the specific member invitation
    // Note: workspace.members is an array of objects since we used lean()
    const invitation = workspace.members.find(m => m._id.toString() === token);

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
      workspaceId: workspace._id.toString(),
      workspaceName: workspace.name,
      invitedEmail: invitation.email,
      permissions: invitation.permissions,
      created_by: workspace.ownerId, // For compatibility, or show workspace owner
      created_date: workspace.createdAt
    };

    return success(res, invitationData);
  } catch (err) {
    console.error('[Get Invitation] Error:', err);
    return error(res, err.message || 'Failed to fetch invitation', 500);
  }
}
