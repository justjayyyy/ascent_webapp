import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/User.js';
import { LANGUAGES, THEMES } from '../lib/accounts.js';
import { deleteAccount } from '../lib/deleteAccount.js';

const isBool = (v) => typeof v === 'boolean';

// What a person may change about their own account, and what a valid value looks like.
// An invalid currency would break every money figure in the app (Intl.NumberFormat throws on it).
const EDITABLE = {
  full_name: (v) => typeof v === 'string' && v.length <= 100,
  language: (v) => LANGUAGES.includes(v),
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  theme: (v) => THEMES.includes(v),
  blurValues: isBool,
  priceAlerts: isBool,
  dailySummary: isBool,
  weeklyReports: isBool,
  emailNotifications: isBool,
};

/** The valid changes in `body`, or { invalid: field } for the first bad one. */
export function profileChanges(body = {}) {
  const updates = {};
  for (const [key, valid] of Object.entries(EDITABLE)) {
    if (body[key] === undefined) continue;
    const value = key === 'full_name' && typeof body[key] === 'string' ? body[key].trim() : body[key];
    if (!valid(value)) return { invalid: key };
    updates[key] = value;
  }
  return { updates };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      // user is a lean document, so toJSON() never ran: drop the secrets here
      const { password, shortcutTokenHash, passkeys, verifyTokenHash, verifyExpiresAt, resetTokenHash, resetExpiresAt, ...safe } = user;
      return success(res, { ...safe, passkeyCount: Array.isArray(passkeys) ? passkeys.length : 0 });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { updates, invalid } = profileChanges(req.body || {});
      if (invalid) return error(res, `Invalid value for ${invalid}`, 400);
      const updated = await User.findByIdAndUpdate(user._id, updates, { new: true, runValidators: true });
      return success(res, updated.toJSON());
    }

    if (req.method === 'DELETE') {
      // The person types their email to confirm; a stray request cannot delete an account
      const confirm = String(req.body?.confirm || '').trim().toLowerCase();
      if (!confirm || confirm !== String(user.email).toLowerCase()) return error(res, 'Type your email to confirm', 400);
      await deleteAccount(user);
      return success(res, { deleted: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (err) {
    return serverError(res, err);
  }
}
