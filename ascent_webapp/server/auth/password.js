// Forgotten passwords. POST ?action=forgot { email } emails a one-hour link; POST ?action=reset { token, password }
// sets the new password and signs in, which also signs out every other device.
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { issueSession } from '../lib/session.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { sanitize, isValidEmail, isValidPassword } from '../lib/validate.js';
import { RESET_TTL_MS, hashToken, isTokenShape, newAccountToken } from '../lib/accountTokens.js';
import { sendAccountEmail } from '../lib/accountEmails.js';
import { linkOrigin } from '../lib/links.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (authRateLimit(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const { action } = req.query;
    const body = req.body || {};

    if (action === 'forgot') {
      const email = typeof body.email === 'string' ? sanitize(body.email).toLowerCase() : '';
      if (!isValidEmail(email)) return error(res, 'Invalid email format', 400);
      await connectDB();
      const user = await User.findOne({ email }).select('email language').lean();
      if (user) {
        const { token, hash, expiresAt } = newAccountToken(RESET_TTL_MS);
        await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: hash, resetExpiresAt: expiresAt } });
        const sent = await sendAccountEmail({ kind: 'reset', user, origin: linkOrigin(req), token });
        if (!sent.sent) console.error('[Password] reset email failed:', sent.error);
      }
      // The same answer whether or not the account exists, so this cannot be used to find accounts
      return success(res, { sent: true });
    }

    if (action === 'reset') {
      const { token, password } = body;
      if (!isTokenShape(token)) return error(res, 'This link is invalid or has expired', 400);
      if (!isValidPassword(password)) return error(res, 'Password must be 6 to 128 characters', 400);
      await connectDB();
      const user = await User.findOne({ resetTokenHash: hashToken(token), resetExpiresAt: { $gt: new Date() } });
      if (!user) return error(res, 'This link is invalid or has expired', 400);
      user.password = password;
      user.resetTokenHash = undefined;
      user.resetExpiresAt = undefined;
      // The link reached their inbox, which is as good as confirming the address
      user.emailVerified = true;
      user.verifyTokenHash = undefined;
      user.verifyExpiresAt = undefined;
      user.isFirstLogin = false;
      await user.save();
      const session = await issueSession(user);
      return success(res, { user: user.toJSON(), token: session });
    }

    return error(res, 'Unknown action', 400);
  } catch (err) {
    return serverError(res, err);
  }
}
