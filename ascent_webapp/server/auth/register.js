import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import { issueSession } from '../lib/session.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { sanitize, isValidEmail, isValidPassword } from '../lib/validate.js';
import { createAccount, startingPrefs } from '../lib/accounts.js';
import { sendVerification } from './verify-email.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (authRateLimit(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const { email, password, full_name, language, theme } = req.body || {};
    const cleanEmail = typeof email === 'string' ? sanitize(email).toLowerCase() : '';

    if (!cleanEmail || !password) return error(res, 'Email and password are required', 400);
    if (!isValidEmail(cleanEmail)) return error(res, 'Invalid email format', 400);
    if (!isValidPassword(password)) return error(res, 'Password must be 6 to 128 characters', 400);

    await connectDB();
    if (await User.exists({ email: cleanEmail })) return error(res, 'Email already registered', 409);

    let user;
    try {
      user = await createAccount({
        email: cleanEmail,
        password,
        emailVerified: false,
        full_name: typeof full_name === 'string' ? sanitize(full_name).slice(0, 100) : '',
        ...startingPrefs({ language, theme }),
      });
    } catch (err) {
      if (err?.code === 11000) return error(res, 'Email already registered', 409); // a double-submitted form
      throw err;
    }

    await sendVerification(req, user);
    const token = await issueSession(user, { userAgent: req.headers?.['user-agent'] });
    return success(res, { user: user.toJSON(), token, isFirstLogin: true }, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
