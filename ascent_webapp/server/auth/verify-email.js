// Email confirmation. POST ?action=send emails the signed-in person a fresh link;
// POST ?action=confirm { token } confirms the address (no sign-in needed: the link may open on another device).
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { VERIFY_TTL_MS, hashToken, isTokenShape, newAccountToken } from '../lib/accountTokens.js';
import { sendAccountEmail } from '../lib/accountEmails.js';
import { linkOrigin } from '../lib/links.js';

/** Stores a fresh confirmation token for `user` and emails it. Never throws. */
export async function sendVerification(req, user) {
  try {
    const { token, hash, expiresAt } = newAccountToken(VERIFY_TTL_MS);
    await User.updateOne({ _id: user._id }, { $set: { verifyTokenHash: hash, verifyExpiresAt: expiresAt } });
    return await sendAccountEmail({ kind: 'verify', user, origin: linkOrigin(req), token });
  } catch (err) {
    console.error('[Verify] sending failed:', err?.message);
    return { sent: false, error: 'send failed' };
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (authRateLimit(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const { action } = req.query;

    if (action === 'send') {
      const user = await authMiddleware(req, res);
      if (!user) return;
      if (user.emailVerified !== false) return success(res, { sent: false, verified: true });
      const sent = await sendVerification(req, user);
      if (!sent.sent) return error(res, 'The email could not be sent. Try again later.', 503);
      return success(res, { sent: true });
    }

    if (action === 'confirm') {
      const { token } = req.body || {};
      if (!isTokenShape(token)) return error(res, 'This link is invalid or has expired', 400);
      await connectDB();
      const user = await User.findOneAndUpdate(
        { verifyTokenHash: hashToken(token), verifyExpiresAt: { $gt: new Date() } },
        { $set: { emailVerified: true }, $unset: { verifyTokenHash: 1, verifyExpiresAt: 1 } },
        { new: true }
      ).select('email').lean();
      if (!user) return error(res, 'This link is invalid or has expired', 400);
      return success(res, { verified: true, email: user.email });
    }

    return error(res, 'Unknown action', 400);
  } catch (err) {
    return serverError(res, err);
  }
}
