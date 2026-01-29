import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { signToken } from '../lib/jwt.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { sanitize, isValidEmail, isValidPassword } from '../lib/validate.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  // Auth-specific rate limiting (stricter)
  if (authRateLimit(req, res)) return;
  
  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }
  
  try {
    const { email, password, full_name } = req.body;
    
    // Sanitize and validate inputs
    const cleanEmail = sanitize(email)?.toLowerCase();
    const cleanName = sanitize(full_name);
    
    if (!cleanEmail || !password) {
      return error(res, 'Email and password are required', 400);
    }
    
    if (!isValidEmail(cleanEmail)) {
      return error(res, 'Invalid email format', 400);
    }
    
    if (!isValidPassword(password)) {
      return error(res, 'Password must be at least 6 characters', 400);
    }
    
    await connectDB();
    
    // Check if user exists
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return error(res, 'Email already registered', 409);
    }
    
    // Create user
    const user = await User.create({
      email: cleanEmail,
      password,
      full_name: cleanName || '',
      isFirstLogin: true
    });

    // Create default workspace
    const workspaceName = 'My Workspace';

    const workspace = await Workspace.create({
      name: workspaceName,
      ownerId: user._id,
      members: [{
        userId: user._id,
        email: user.email,
        role: 'owner',
        status: 'accepted',
        permissions: {
          viewPortfolio: true,
          editPortfolio: true,
          viewExpenses: true,
          editExpenses: true,
          viewNotes: true,
          editNotes: true,
          viewGoals: true,
          editGoals: true,
          viewBudgets: true,
          editBudgets: true,
          viewSettings: true,
          manageUsers: true
        }
      }]
    });

    user.defaultWorkspace = workspace._id;
    await user.save();
    
    // Generate token
    const token = signToken({ userId: user._id, email: user.email });
    
    return success(res, {
      user: user.toJSON(),
      token,
      isFirstLogin: true
    }, 201);
    
  } catch (err) {
    return serverError(res, err);
  }
}
