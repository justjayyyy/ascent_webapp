import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  try {
    const user = await authMiddleware(req, res);
    if (!user) return; // Response already sent by middleware
    
    if (req.method === 'GET') {
      // user is already a lean document (plain object), no need for toJSON()
      return success(res, user);
    }
    
    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        await connectDB();
      } catch (dbError) {
        console.error('[Auth/me] MongoDB connection failed:', dbError);
        
        // Provide specific error messages
        if (dbError.code === 'MONGODB_URI_MISSING') {
          return error(res, 'Database configuration error. Please contact support.', 503);
        }
        
        if (dbError.code === 'MONGODB_AUTH_FAILED') {
          console.error('[Auth/me] MongoDB authentication failed. Check MONGODB_URI credentials in Vercel.');
          return error(res, 'Database authentication failed. Please check server configuration.', 503);
        }
        
        // Return user-friendly error
        const errorMessage = dbError.message || 'Database connection failed. Please try again later.';
        return error(res, errorMessage, 503);
      }
      
      const allowedUpdates = [
        'full_name', 'language', 'currency', 'theme',
        'blurValues', 'priceAlerts', 'weeklyReports', 'emailNotifications'
      ];
      
      const updates = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }
      
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        updates,
        { new: true, runValidators: true }
      );
      
      return success(res, updatedUser.toJSON());
    }
    
    return error(res, 'Method not allowed', 405);
    
  } catch (err) {
    console.error('[Auth/me] Error:', err);
    return serverError(res, err);
  }
}

