// The sign-in session lives in an HttpOnly cookie: page scripts cannot read it, so a script injected into
// the page could not copy it out. SameSite=Strict keeps other sites from sending it, and the auth
// middleware also refuses changes made with it from an origin that is not ours.
import jwt from 'jsonwebtoken';
import { getTokenFromHeader } from './jwt.js';

export const SESSION_COOKIE = 'ascent_session';
const PATH = '/api';
const FALLBACK_SECONDS = 7 * 24 * 60 * 60;

// Secure everywhere but plain-http local development
const isSecure = (req, env = process.env) =>
  env.NODE_ENV === 'production' || env.VERCEL === '1' || req?.secure === true || req?.headers?.['x-forwarded-proto'] === 'https';

function serialize(value, maxAge, secure) {
  return [`${SESSION_COOKIE}=${value}`, `Path=${PATH}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])].join('; ');
}

function append(res, cookie) {
  const prev = res.getHeader?.('Set-Cookie');
  res.setHeader?.('Set-Cookie', [...[].concat(prev || []), cookie]);
}

/** Stores the session token on this device for as long as the token itself is valid. */
export function setSessionCookie(req, res, token, { env = process.env, now = Date.now() } = {}) {
  const exp = jwt.decode(token)?.exp;
  const maxAge = exp ? Math.max(0, Math.floor(exp - now / 1000)) : FALLBACK_SECONDS;
  append(res, serialize(token, maxAge, isSecure(req, env)));
}

/** Removes the session from this device. */
export function clearSessionCookie(req, res, { env = process.env } = {}) {
  append(res, serialize('', 0, isSecure(req, env)));
}

/** The session token from the request's cookies, or null. */
export function getTokenFromCookie(req) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === SESSION_COOKIE) return part.slice(at + 1).trim() || null;
  }
  return null;
}

/**
 * The request's session token: the cookie the app has had since sign-in, or an Authorization header
 * (app builds from before the cookie, and tests). `fromCookie` says which.
 */
export function sessionToken(req) {
  const cookie = getTokenFromCookie(req);
  if (cookie) return { token: cookie, fromCookie: true };
  return { token: getTokenFromHeader(req), fromCookie: false };
}
