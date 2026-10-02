import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { issueSession } from '../lib/session.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { accountLocked, clearFailedPasswords, limitAuth, recordFailedPassword } from '../lib/authLimit.js';
import { sanitize, isValidEmail } from '../lib/validate.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Per address, across server instances
  if (await limitAuth(req, res, 'login')) return;

  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    const { email, password } = req.body || {};
    const cleanEmail = typeof email === 'string' ? sanitize(email).toLowerCase() : '';

    if (!cleanEmail || typeof password !== 'string' || !password) {
      return error(res, 'Email and password are required', 400);
    }

    if (!isValidEmail(cleanEmail)) {
      return error(res, 'Invalid email format', 400);
    }

    await connectDB();

    // Too many wrong passwords for this account lately: refuse passwords for a while, whoever is asking
    if (await accountLocked(cleanEmail, res)) return;

    // Find user
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      // Counted like a wrong password, and the same message, so this cannot be used to find accounts
      await recordFailedPassword(cleanEmail);
      return error(res, 'Invalid email or password', 401);
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordFailedPassword(cleanEmail);
      return error(res, 'Invalid email or password', 401);
    }

    await clearFailedPasswords(cleanEmail);
    const isFirstLogin = user.isFirstLogin === true;
    user.lastLogin = new Date();
    user.isFirstLogin = false;
    await user.save();

    const token = await issueSession(user, { userAgent: req.headers?.['user-agent'] });

    return success(res, {
      user: user.toJSON(),
      token,
      isFirstLogin
    });

  } catch (err) {
    return serverError(res, err);
  }
}
