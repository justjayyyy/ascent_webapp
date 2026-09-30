import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

// Web Push needs a VAPID key pair (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Without them everything here is a no-op.
let configured;
export function pushConfigured() {
  if (configured !== undefined) return configured;
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey) {
    configured = false;
  } else {
    webpush.setVapidDetails(subject || 'https://ascentwebapp.vercel.app', publicKey, privateKey);
    configured = true;
  }
  return configured;
}

/**
 * Sends a notification to every device a user has subscribed. Never throws and never waits longer than `timeoutMs`,
 * so a slow push service cannot hold up the request that triggered it. Dead subscriptions are removed.
 * payload: { title, body, url, tag }
 */
export async function notifyUser(userId, payload, { timeoutMs = 3000 } = {}) {
  try {
    if (!pushConfigured()) return { sent: 0 };
    const subs = await PushSubscription.find({ userId }).lean();
    if (!subs.length) return { sent: 0 };

    const body = JSON.stringify(payload);
    const work = Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
          return true;
        } catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          }
          return false;
        }
      })
    );
    const results = await Promise.race([work, new Promise((resolve) => setTimeout(() => resolve([]), timeoutMs))]);
    return { sent: results.filter((r) => r.status === 'fulfilled' && r.value).length };
  } catch (err) {
    console.error('[Push] failed:', err?.message);
    return { sent: 0 };
  }
}
