// POST /api/auth/logout ends this device's session; ?scope=others ends every other one instead.
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { endOtherSessions, endSession } from '../lib/session.js';
import { clearSessionCookie } from '../lib/sessionCookie.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
  try {
    // Signing out leaves no session on this device, even when the server no longer knows it
    const signingOut = req.query?.scope !== 'others';
    if (signingOut) clearSessionCookie(req, res);
    const user = await authMiddleware(req, res);
    if (!user) return;
    if (req.query?.scope === 'others') {
      await endOtherSessions(user._id, req.sessionId);
      return success(res, { signedOutOthers: true });
    }
    await endSession(user._id, req.sessionId);
    clearSessionCookie(req, res);
    return success(res, { signedOut: true });
  } catch (err) {
    return serverError(res, err);
  }
}
