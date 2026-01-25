import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { signToken } from '../lib/jwt.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { sanitize, isValidEmail } from '../lib/validate.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  // Auth-specific rate limiting (stricter)
  if (authRateLimit(req, res)) return;
  
  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }
  
  try {
    const { email, password } = req.body;
    
    // Validate inputs
    const cleanEmail = sanitize(email)?.toLowerCase();
    
    if (!cleanEmail || !password) {
      return error(res, 'Email and password are required', 400);
    }
    
    if (!isValidEmail(cleanEmail)) {
      return error(res, 'Invalid email format', 400);
    }
    
    // Connect to MongoDB
    try {
      await connectDB();
    } catch (dbError) {
      if (dbError.code === 'MONGODB_AUTH_FAILED' || dbError.code === 'MONGODB_CONNECTION_FAILED') {
        return error(res, 'Database connection failed', 503);
      }
      return serverError(res, dbError);
    }
    
    // Find user
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      // Use same error message to prevent email enumeration
      return error(res, 'Invalid email or password', 401);
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return error(res, 'Invalid email or password', 401);
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = signToken({ userId: user._id, email: user.email });
    
    return success(res, {
      user: user.toJSON(),
      token
    });
    
  } catch (err) {
    return serverError(res, err);
  }
}
