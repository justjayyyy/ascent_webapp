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
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (!response.ok) {
          return error(res, 'Failed to verify Google token', 401);
        }
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
      } catch (fetchError) {
        console.error('[Google Auth] Token verification error:', fetchError);
        return error(res, 'Failed to verify Google token', 401);
      }
    } else {
      return error(res, 'Google credential or access token is required', 400);
    }
    
    if (!email) {
      return error(res, 'Email is required', 400);
    }
    
    // Connect to MongoDB with error handling
    try {
      await connectDB();
    } catch (dbError) {
      console.error('[Google Auth] MongoDB connection failed:', dbError);
      
      // Provide specific error messages
      if (dbError.code === 'MONGODB_URI_MISSING') {
        return error(res, 'Database configuration error. Please contact support.', 503);
      }
      
      // Return user-friendly error
      const errorMessage = dbError.message || 'Database connection failed. Please try again later.';
      return error(res, errorMessage, 503);
    }
    
    // Find or create user
    let user;
    try {
      user = await User.findOne({ email: email.toLowerCase() });
      
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
    } catch (userError) {
      console.error('[Google Auth] User creation/update error:', userError);
      return serverError(res, userError);
    }
    
    // Generate token
    let token;
    try {
      token = signToken({ userId: user._id, email: user.email });
    } catch (tokenError) {
      console.error('[Google Auth] Token generation error:', tokenError);
      return error(res, 'Failed to generate authentication token', 500);
    }
    
    return success(res, {
      user: user.toJSON(),
      token
    });
    
  } catch (err) {
    console.error('[Google Auth] Unexpected error:', err);
    console.error('[Google Auth] Error stack:', err.stack);
    return serverError(res, err);
  }
}

