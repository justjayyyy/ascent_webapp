// Google Calendar on the server: the browser connects once (an authorization code from Google's popup), the
// API swaps it for a refresh token and keeps it encrypted, and every calendar call gets a fresh access token
// from it. So the calendar stays connected after signing out and in, and on every device.
import crypto from 'node:crypto';
import { jwtSecret } from './jwt.js';
import { googleClientIds } from './googleAuth.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export class CalendarAuthError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Client id and secret, or null when this deployment can only use the browser's short-lived tokens. */
export function calendarClient(env = process.env) {
  const id = googleClientIds(env)[0];
  return id && env.GOOGLE_CLIENT_SECRET ? { id, secret: env.GOOGLE_CLIENT_SECRET } : null;
}

const key = (env) => crypto.createHash('sha256').update(`calendar-refresh-token:${env.CALENDAR_TOKEN_SECRET || jwtSecret(env)}`).digest();

export function seal(plain, env = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(env), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

/** The refresh token, or null when it cannot be read (tampered with, or the secret changed). */
export function unseal(sealed, env = process.env) {
  try {
    const [iv, tag, data] = String(sealed).split('.').map((s) => Buffer.from(s, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(env), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function tokenRequest(params, fetchImpl) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  // invalid_grant: the person removed access in their Google account, or the token expired unused
  if (!res.ok) throw new CalendarAuthError(data.error === 'invalid_grant' ? 401 : 502, data.error || 'token_error');
  return data;
}

/** Swaps the popup's authorization code for { refreshToken, accessToken, expiresIn, scope }. */
export async function exchangeCode(code, { client = calendarClient(), fetchImpl = fetch } = {}) {
  if (!client) throw new CalendarAuthError(501, 'calendar_not_configured');
  if (typeof code !== 'string' || !code || code.length > 2048) throw new CalendarAuthError(400, 'code_required');
  const data = await tokenRequest({
    code,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: 'postmessage', // the popup flow of Google Identity Services
    grant_type: 'authorization_code',
  }, fetchImpl);
  if (!data.refresh_token) {
    // Google only hands out a refresh token the first time someone grants access. Dropping this grant
    // means the next try is a first time again.
    await revokeToken(data.access_token, fetchImpl);
    throw new CalendarAuthError(409, 'try_again');
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token, expiresIn: data.expires_in, scope: data.scope || '' };
}

// Access tokens last an hour; a warm instance reuses them instead of asking Google on every call
const cache = new Map();
const MARGIN = 60_000;

export function rememberAccess(userId, accessToken, expiresIn, now = Date.now()) {
  if (accessToken) cache.set(String(userId), { accessToken, until: now + (Number(expiresIn) || 3600) * 1000 - MARGIN });
}

export function forgetAccess(userId) {
  cache.delete(String(userId));
}

/** A valid access token for this person's stored connection. */
export async function accessTokenFor(userId, sealedRefreshToken, { client = calendarClient(), fetchImpl = fetch, now = Date.now() } = {}) {
  const hit = cache.get(String(userId));
  if (hit && hit.until > now) return hit.accessToken;
  if (!client) throw new CalendarAuthError(501, 'calendar_not_configured');
  const refreshToken = unseal(sealedRefreshToken);
  if (!refreshToken) throw new CalendarAuthError(401, 'unreadable_token');
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: client.id,
    client_secret: client.secret,
    grant_type: 'refresh_token',
  }, fetchImpl);
  rememberAccess(userId, data.access_token, data.expires_in, now);
  return data.access_token;
}

async function revokeToken(token, fetchImpl) {
  if (!token) return;
  try {
    await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch { /* already gone, or Google unreachable */ }
}

/** Tells Google to drop the grant. Best effort: disconnecting here never waits on it succeeding. */
export function revoke(sealedRefreshToken, { fetchImpl = fetch } = {}) {
  return revokeToken(unseal(sealedRefreshToken), fetchImpl);
}
