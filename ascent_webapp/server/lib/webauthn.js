// Relying-party details for passkeys. The RP ID is the host the app runs on, so a passkey made on
// ascentwebapp.vercel.app works there and nowhere else; the origin must be one we serve ourselves.
import { isAllowedOrigin } from './cors.js';

/**
 * The origin and RP ID for this request, or null when the request comes from somewhere we do not serve.
 * Browsers always send Origin on these POSTs; the Referer fallback covers the odd proxy that strips it.
 */
export function relyingParty(req, env = process.env) {
  let origin = req.headers?.origin;
  if (!origin && req.headers?.referer) {
    try { origin = new URL(req.headers.referer).origin; } catch { origin = null; }
  }
  if (!origin) return null;
  origin = origin.replace(/\/+$/, '');
  if (!isAllowedOrigin(origin, { env })) return null;
  return { origin, rpID: new URL(origin).hostname, rpName: 'Ascent' };
}

/** A friendly default name for a new passkey, from the device that made it. */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Passkey';
}

export const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');
export const fromBase64Url = (text) => new Uint8Array(Buffer.from(text, 'base64url'));
