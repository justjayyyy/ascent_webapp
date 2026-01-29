import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
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
        return error(res, 'Failed to verify Google token', 401);
      }
    } else {
      return error(res, 'Google credential or access token is required', 400);
    }
    
    if (!email) {
      return error(res, 'Email is required', 400);
    }
    
    // Connect to MongoDB
    try {
      await connectDB();
    } catch (dbError) {
      if (dbError.code === 'MONGODB_URI_MISSING' || dbError.code === 'MONGODB_AUTH_FAILED') {
        return error(res, 'Database connection failed', 503);
      }
      return error(res, 'Database connection failed', 503);
    }
    
    // Find or create user
    let user;
    let isFirstLogin = false;
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
          authProvider: 'google',
          isFirstLogin: true
        });
        isFirstLogin = true;

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
      } else {
        // Check if first login before updating
        isFirstLogin = user.isFirstLogin === true;
        
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
        }
        
        // Mark first login as complete
        if (isFirstLogin) {
          user.isFirstLogin = false;
        }
        
        await user.save();
      }
    } catch (userError) {
      return serverError(res, userError);
    }
    
    // Check for pending invitations and auto-accept if email matches
    try {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Find workspaces where this user is a pending member
      const workspacesWithPendingInvite = await Workspace.find({
        'members.email': normalizedEmail,
        'members.status': 'pending'
      });
      
      if (workspacesWithPendingInvite.length > 0) {
        console.log(`[Google Auth] Found ${workspacesWithPendingInvite.length} pending invitation(s) for ${normalizedEmail}`);
      }
      
      for (const workspace of workspacesWithPendingInvite) {
        // Update member status to accepted and link userId
        const memberIndex = workspace.members.findIndex(m => m.email === normalizedEmail);
        if (memberIndex !== -1) {
          workspace.members[memberIndex].status = 'accepted';
          workspace.members[memberIndex].userId = user._id;
          await workspace.save();
          console.log(`[Google Auth] Auto-accepted invitation for ${normalizedEmail} to workspace ${workspace.name}`);
        }
      }
    } catch (invitationError) {
      // Don't fail login if invitation acceptance fails
      console.error('Error accepting invitations:', invitationError);
    }
    
    // Generate token
    const token = signToken({ userId: user._id, email: user.email });
    
    return success(res, {
      user: user.toJSON(),
      token,
      isFirstLogin
    });
    
  } catch (err) {
    return serverError(res, err);
  }
}

