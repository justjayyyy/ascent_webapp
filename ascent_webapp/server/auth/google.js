import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { issueSession } from '../lib/session.js';
import { setSessionCookie } from '../lib/sessionCookie.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { limitAuth } from '../lib/authLimit.js';
import { verifyGoogleIdToken, GoogleAuthError } from '../lib/googleAuth.js';
import { createAccount, startingPrefs, unusablePassword } from '../lib/accounts.js';

// Google has verified this address, so email invitations waiting for it are accepted on sign-in.
// QR (link) invitations are claimed by whoever opens them and are not touched here.
export async function acceptPendingInvitations(user) {
  return Workspace.updateMany(
    { members: { $elemMatch: { email: user.email, status: 'pending', inviteKind: { $ne: 'link' } } } },
    { $set: { 'members.$[m].status': 'accepted', 'members.$[m].userId': user._id, 'members.$[m].joinedAt': new Date() } },
    { arrayFilters: [{ 'm.email': user.email, 'm.status': 'pending', 'm.inviteKind': { $ne: 'link' } }] }
  );
}

// POST { credential } where credential is the ID token from Google Identity Services.
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (await limitAuth(req, res, 'google')) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const { credential, language, theme } = req.body || {};
    if (!credential) return error(res, 'Google credential is required', 400);

    let google;
    try {
      google = await verifyGoogleIdToken(credential);
    } catch (err) {
      if (err instanceof GoogleAuthError) return error(res, err.reason, err.status);
      throw err;
    }

    await connectDB();

    let user = await User.findOne({ email: google.email });
    let isFirstLogin;
    if (!user) {
      user = await createAccount({
        email: google.email,
        password: unusablePassword(),
        full_name: google.name,
        googleId: google.googleId,
        avatar: google.picture,
        authProvider: 'google',
        emailVerified: true,
        ...startingPrefs({ language, theme }),
      });
      isFirstLogin = true;
    } else {
      isFirstLogin = user.isFirstLogin === true;
      // Someone may have signed up with this address before its owner arrived and never confirmed it.
      // Google has just proven who owns it, so that unconfirmed password stops working.
      if (user.emailVerified === false) user.password = unusablePassword();
      user.emailVerified = true;
      if (!user.googleId) {
        user.googleId = google.googleId;
        if (google.picture && !user.avatar) user.avatar = google.picture;
        if (google.name && !user.full_name) user.full_name = google.name;
      }
      user.isFirstLogin = false;
    }
    user.lastLogin = new Date();
    await user.save();

    try {
      await acceptPendingInvitations(user);
    } catch (err) {
      console.error('[Google Auth] accepting invitations failed:', err?.message); // never blocks sign-in
    }

    setSessionCookie(req, res, await issueSession(user, { userAgent: req.headers?.['user-agent'] }));
    return success(res, { user: user.toJSON(), isFirstLogin });
  } catch (err) {
    return serverError(res, err);
  }
}
