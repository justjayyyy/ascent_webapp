import { verifyToken } from '../lib/jwt.js';
import { clearSessionCookie, sessionToken, setSessionCookie } from '../lib/sessionCookie.js';
import { isAllowedOrigin } from '../lib/cors.js';
import { unauthorized } from '../lib/response.js';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { isLiveSession } from '../lib/session.js';
import Workspace from '../models/Workspace.js';

// `signedInElsewhere` = the token was valid but has been superseded by a newer sign-in; the client
// uses the code to tell the user why they were signed out. Tokens from before this check existed
// (no sid) just get a plain expiry.
function replaced(req, res, signedInElsewhere) {
  clearSessionCookie(req, res);
  return res.status(401).json({
    success: false,
    error: signedInElsewhere ? 'Signed in on another device' : 'Session expired',
    code: signedInElsewhere ? 'SESSION_REPLACED' : 'SESSION_INVALID'
  });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A change sent with the cookie from a page that is not ours (cross-site request forgery). */
export function isForeignChange(req) {
  const origin = req.headers?.origin;
  return !SAFE_METHODS.has(req.method) && !!origin && !isAllowedOrigin(origin, { host: req.headers?.host });
}

export async function authMiddleware(req, res) {
  try {
    const { token, fromCookie } = sessionToken(req);
    if (fromCookie && isForeignChange(req)) {
      res.status(403).json({ success: false, error: 'Request from another site' });
      return null;
    }
    
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
      replaced(req, res, !!decoded.sid);
      return null;
    }
    req.sessionId = decoded.sid;
    // A device still on the old header-based session moves to the cookie
    if (!fromCookie) setSessionCookie(req, res, token);
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
          // Which revision of the household's data a read starts from: the app's first change check compares
          // against it, so a change made between loading a page and that check is not missed (useWorkspaceSync)
          if (req.method === 'GET' && typeof res?.setHeader === 'function' && !res.headersSent) res.setHeader('X-Data-Rev', String(workspace.dataRev || 0));
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
  const { token } = sessionToken(req);
  
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

