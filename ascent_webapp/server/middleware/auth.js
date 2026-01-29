import { verifyToken, getTokenFromHeader } from '../lib/jwt.js';
import { unauthorized } from '../lib/response.js';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';

export async function authMiddleware(req, res) {
  try {
    const token = getTokenFromHeader(req);
    
    if (!token) {
      unauthorized(res, 'No token provided');
      return null;
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      unauthorized(res, 'Invalid or expired token');
      return null;
    }
    
    await connectDB();
    
    const user = await User.findById(decoded.userId).lean();
    
    if (!user) {
      unauthorized(res, 'User not found');
      return null;
    }
    
    // Ensure user has email field
    if (!user.email) {
      unauthorized(res, 'User email not found');
      return null;
    }

    // Handle Workspace Context
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId) {
      try {
        const workspace = await Workspace.findOne({
          _id: workspaceId,
          'members.userId': user._id
        }).lean();

        if (workspace) {
          req.workspace = workspace;
          // Attach the member details for this user (permissions, role)
          const member = workspace.members.find(m => m.userId.toString() === user._id.toString());
          req.member = member;
        }
      } catch (wsError) {
        console.error('[AuthMiddleware] Error fetching workspace:', wsError);
        // Continue without workspace context
      }
    }
    
    return user;
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error.message);
    unauthorized(res, 'Authentication failed');
    return null;
  }
}

export async function optionalAuth(req) {
  const token = getTokenFromHeader(req);
  
  if (!token) {
    return null;
  }
  
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return null;
  }
  
  await connectDB();
  
  const user = await User.findById(decoded.userId);
  
  return user || null;
}

