import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { signToken } from '../lib/jwt.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }
  
  try {
    const { credential, clientId, accessToken, userInfo } = req.body;
    
    let email, name, picture, googleId;
    
    if (accessToken && userInfo) {
      // OAuth2 access token flow (with calendar access)
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
      googleId = userInfo.sub;
      
      if (!email) {
        return error(res, 'Email not provided by Google');
      }
    } else if (credential) {
      // ID token flow (basic login)
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      const payload = await response.json();
      
      if (payload.error) {
        return error(res, 'Invalid Google token', 401);
      }
      
      // Verify the audience matches our client ID
      if (clientId && payload.aud !== clientId) {
        return error(res, 'Token was not issued for this application', 401);
      }
      
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
      googleId = payload.sub;
    } else {
      return error(res, 'Google credential or access token is required');
    }
    
    await connectDB();
    
    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Create new user with Google auth
      user = await User.create({
        email: email.toLowerCase(),
        password: `google_${googleId}_${Date.now()}`, // Random password for Google users
        full_name: name || '',
        googleId,
        avatar: picture,
        authProvider: 'google'
      });
    } else {
      // Update existing user with Google info if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = user.authProvider || 'google';
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
        if (name && !user.full_name) {
          user.full_name = name;
        }
        await user.save();
      }
    }
    
    // Generate token
    const token = signToken({ userId: user._id, email: user.email });
    
    console.log('[Google Auth] User logged in with settings:', {
      language: user.language,
      theme: user.theme,
      currency: user.currency,
      blurValues: user.blurValues
    });
    
    return success(res, {
      user: user.toJSON(),
      token
    });
    
  } catch (err) {
    console.error('Google auth error:', err);
    return serverError(res, err);
  }
}

