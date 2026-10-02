// Limits on signing in that hold across server instances. On Vercel every warm instance has its own
// memory, so the in-memory limiter (rateLimit.js) only brakes bursts; these counters live in MongoDB.
//   - per IP address, on every sign-in, sign-up and reset route
//   - per account: after MAX_FAILS wrong passwords the account refuses passwords for LOCK_MS, which stops
//     guessing spread across many addresses (Google, passkeys and password reset still work)
// If the database cannot be reached the limits let requests through: a broken counter must not lock
// everyone out.
import connectDB from './mongodb.js';
import RateLimit from '../models/RateLimit.js';
import { authRateLimit, clientIdOf } from './rateLimit.js';

const MINUTE = 60 * 1000;
const DB_TIMEOUT_MS = 2000; // a slow database must not hold up signing in

const withinTime = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('counter timed out')), DB_TIMEOUT_MS).unref?.()),
]);

export const IP_LIMIT = { max: 40, windowMs: 10 * MINUTE };
export const MAX_FAILS = 10;
export const LOCK_MS = 15 * MINUTE;
export const RESET_EMAILS = { max: 5, windowMs: 60 * MINUTE };

/** Adds one to the counter `key` (a new window starts when the last one has ended). { count, resetAt } */
export async function countAttempt(key, windowMs, now = new Date()) {
  try {
    await withinTime(connectDB());
    const fresh = new Date(now.getTime() + windowMs);
    const live = { $gt: ['$expiresAt', now] };
    const doc = await withinTime(RateLimit.collection.findOneAndUpdate(
      { _id: key },
      [{ $set: {
        count: { $cond: [live, { $add: ['$count', 1] }, 1] },
        expiresAt: { $cond: [live, '$expiresAt', fresh] },
      } }],
      { upsert: true, returnDocument: 'after' }
    ));
    const row = doc?.value !== undefined && doc?.ok !== undefined ? doc.value : doc; // driver result shapes
    return { count: row?.count ?? 0, resetAt: row?.expiresAt ?? fresh };
  } catch (err) {
    console.warn('[authLimit] counter unavailable:', err?.message);
    return { count: 0, resetAt: now };
  }
}

/** The counter's value without adding to it (0 once its window has ended). */
export async function peekAttempts(key, now = new Date()) {
  try {
    await withinTime(connectDB());
    const row = await withinTime(RateLimit.findOne({ _id: key, expiresAt: { $gt: now } }).lean());
    return { count: row?.count ?? 0, resetAt: row?.expiresAt ?? now };
  } catch (err) {
    console.warn('[authLimit] counter unavailable:', err?.message);
    return { count: 0, resetAt: now };
  }
}

export async function clearAttempts(key) {
  try {
    await withinTime(connectDB());
    await withinTime(RateLimit.deleteOne({ _id: key }));
  } catch { /* the window ends on its own */ }
}

const tooMany = (res, resetAt, message = 'Too many attempts. Please try again later.') => {
  const retryAfter = Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000));
  res.setHeader?.('Retry-After', String(retryAfter));
  res.status(429).json({ success: false, error: message, retryAfter });
  return true;
};

/** For sign-in, sign-up and reset routes: answers 429 and returns true when this address has done too many. */
export async function limitAuth(req, res, route = 'auth') {
  if (authRateLimit(req, res)) return true;
  const { count, resetAt } = await countAttempt(`ip:${route}:${clientIdOf(req)}`, IP_LIMIT.windowMs);
  return count > IP_LIMIT.max ? tooMany(res, resetAt) : false;
}

const failKey = (email) => `fail:${String(email).toLowerCase()}`;

/** Answers 429 and returns true while the account refuses passwords after too many wrong ones. */
export async function accountLocked(email, res) {
  const { count, resetAt } = await peekAttempts(failKey(email));
  return count >= MAX_FAILS
    ? tooMany(res, resetAt, 'Too many wrong passwords. Try again later, or reset your password.')
    : false;
}

export const recordFailedPassword = (email) => countAttempt(failKey(email), LOCK_MS);
export const clearFailedPasswords = (email) => clearAttempts(failKey(email));

/** Whether another password-reset email may go to `email` this hour. */
export async function mayEmailReset(email) {
  const { count } = await countAttempt(`reset:${String(email).toLowerCase()}`, RESET_EMAILS.windowMs);
  return count <= RESET_EMAILS.max;
}
