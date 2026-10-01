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
      // user is a lean document, so toJSON() never ran: drop the secrets here
      const { password, shortcutTokenHash, passkeys, ...safe } = user;
      return success(res, { ...safe, passkeyCount: Array.isArray(passkeys) ? passkeys.length : 0 });
    }
    
    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        await connectDB();
      } catch (dbError) {
        if (dbError.code === 'MONGODB_URI_MISSING' || dbError.code === 'MONGODB_AUTH_FAILED') {
          return error(res, 'Database connection failed', 503);
        }
        return error(res, 'Database connection failed', 503);
      }
      
      const allowedUpdates = [
        'full_name', 'language', 'currency', 'theme',
        'blurValues', 'priceAlerts', 'dailySummary', 'weeklyReports', 'emailNotifications'
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
    return serverError(res, err);
  }
}

