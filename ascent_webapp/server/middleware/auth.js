import { verifyToken, getTokenFromHeader } from '../lib/jwt.js';
import { unauthorized } from '../lib/response.js';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';

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

