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
      return success(res, user.toJSON());
    }
    
    if (req.method === 'PUT' || req.method === 'PATCH') {
      await connectDB();
      
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
      
      console.log('[Auth/me] Updating user settings:', updates);
      
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        updates,
        { new: true, runValidators: true }
      );
      
      console.log('[Auth/me] Updated user:', {
        language: updatedUser.language,
        theme: updatedUser.theme,
        currency: updatedUser.currency,
        blurValues: updatedUser.blurValues
      });
      
      return success(res, updatedUser.toJSON());
    }
    
    return error(res, 'Method not allowed', 405);
    
  } catch (err) {
    return serverError(res, err);
  }
}

