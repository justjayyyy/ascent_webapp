// /api/push: the signed-in user's push subscriptions.
//   GET     -> { enabled, publicKey }   (is push set up on the server, and the key the browser needs)
//   POST    -> { subscription }         save this device's subscription;  { test: true } sends a test notification
//   DELETE  -> ?endpoint=...            forget this device
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { notifyUser, pushConfigured } from '../lib/push.js';
import PushSubscription from '../models/PushSubscription.js';

const isText = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;
    await connectDB();

    if (req.method === 'GET') {
      return success(res, { enabled: pushConfigured(), publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
    }

    if (req.method === 'POST') {
      if (!pushConfigured()) return error(res, 'push_not_configured', 503);

      if (req.body?.test === true) {
        const { sent } = await notifyUser(user._id, { title: 'Ascent', body: 'Notifications are on.', url: '/Expenses', tag: 'test' });
        return success(res, { sent });
      }

      const sub = req.body?.subscription;
      const endpoint = sub?.endpoint;
      const p256dh = sub?.keys?.p256dh;
      const auth = sub?.keys?.auth;
      if (!isText(endpoint, 1000) || !endpoint.startsWith('https://') || !isText(p256dh, 200) || !isText(auth, 100)) {
        return error(res, 'invalid_subscription', 400);
      }
      // The same device signing in as someone else moves the subscription to the new user.
      await PushSubscription.findOneAndUpdate(
        { endpoint },
        { $set: { userId: user._id, p256dh, auth, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) } },
        { upsert: true, new: true }
      );
      return success(res, { subscribed: true }, 201);
    }

    if (req.method === 'DELETE') {
      const endpoint = req.query.endpoint;
      if (!isText(endpoint, 1000)) return error(res, 'invalid_endpoint', 400);
      await PushSubscription.deleteOne({ endpoint, userId: user._id });
      return success(res, { removed: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (err) {
    console.error('[Push API] failed:', err?.message);
    return serverError(res, err);
  }
}
