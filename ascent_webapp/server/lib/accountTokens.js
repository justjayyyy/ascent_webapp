// One-time tokens sent by email (password reset, email confirmation). Only a hash is stored, so a
// database leak does not hand out working links.
import { createHash, randomBytes } from 'node:crypto';

export const RESET_TTL_MS = 60 * 60 * 1000; // an hour
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** A fresh token, its hash and when it expires. */
export function newAccountToken(ttlMs, now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), expiresAt: new Date(now + ttlMs) };
}

export const isTokenShape = (token) => typeof token === 'string' && TOKEN.test(token);
