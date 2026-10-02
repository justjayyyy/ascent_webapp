import { verifyToken, getTokenFromHeader } from '../lib/jwt.js';
import { unauthorized } from '../lib/response.js';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { isLiveSession } from '../lib/session.js';
import Workspace from '../models/Workspace.js';

// `signedInElsewhere` = the token was valid but has been superseded by a newer sign-in; the client
// uses the code to tell the user why they were signed out. Tokens from before this check existed
// (no sid) just get a plain expiry.
function replaced(res, signedInElsewhere) {
  return res.status(401).json({
    success: false,
    error: signedInElsewhere ? 'Signed in on another device' : 'Session expired',
    code: signedInElsewhere ? 'SESSION_REPLACED' : 'SESSION_INVALID'
  });
}

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

    // The token's session must still be live (it ends on sign-out, "sign out other devices" or a password reset)
    if (!isLiveSession(user, decoded.sid)) {
      replaced(res, !!decoded.sid);
      return null;
    }
    req.sessionId = decoded.sid;
    delete user.sessionId;
    delete user.sessions;

    // Handle Workspace Context
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId) {
      try {
        // Pending and declined invitees have no access; only accepted members do.
        const workspace = await Workspace.findOne({
          _id: workspaceId,
          members: { $elemMatch: { userId: user._id, status: 'accepted' } }
        }).lean();

        if (workspace) {
          req.workspace = workspace;
          // Attach the member details for this user (permissions, role)
          req.member = workspace.members.find(
            m => m.status === 'accepted' && m.userId && m.userId.toString() === user._id.toString()
          );
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

  if (!user || !isLiveSession(user, decoded.sid)) return null;

  return user;
}

