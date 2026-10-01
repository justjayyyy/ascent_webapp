import crypto from 'crypto';

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a secret, scheduled jobs only run
 * outside production (local testing).
 */
export function cronAuthorized(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return env.NODE_ENV !== 'production' && env.VERCEL !== '1';
  const given = Buffer.from(String(req.headers?.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
