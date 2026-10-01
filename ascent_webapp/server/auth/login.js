import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { issueSession } from '../lib/session.js';
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
    const { email, password } = req.body || {};
    const cleanEmail = typeof email === 'string' ? sanitize(email).toLowerCase() : '';

    if (!cleanEmail || typeof password !== 'string' || !password) {
      return error(res, 'Email and password are required', 400);
    }
    
    if (!isValidEmail(cleanEmail)) {
      return error(res, 'Invalid email format', 400);
    }
    
    await connectDB();

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
    
    const isFirstLogin = user.isFirstLogin === true;
    user.lastLogin = new Date();
    user.isFirstLogin = false;
    await user.save();

    const token = await issueSession(user);
    
    return success(res, {
      user: user.toJSON(),
      token,
      isFirstLogin
    });
    
  } catch (err) {
    return serverError(res, err);
  }
}
