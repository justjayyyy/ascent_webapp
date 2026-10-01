// Verifies a Google Sign-In ID token (the `credential` Google Identity Services hands the browser).
// Everything that identifies the person comes from Google's answer, never from the request body.

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export class GoogleAuthError extends Error {
  constructor(reason, status = 401) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

/** The OAuth client ids this deployment accepts tokens for. */
export function googleClientIds(env = process.env) {
  return [env.GOOGLE_CLIENT_ID, env.VITE_GOOGLE_CLIENT_ID].filter(Boolean);
}

/**
 * Checks the token with Google and returns { email, name, picture, googleId }.
 * Throws GoogleAuthError when the token is not valid for this app or the email is not verified.
 */
export async function verifyGoogleIdToken(idToken, { fetchImpl = fetch, now = Date.now(), clientIds = googleClientIds() } = {}) {
  if (!clientIds.length) throw new GoogleAuthError('google_not_configured', 503);
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) throw new GoogleAuthError('invalid_token');

  let payload;
  try {
    const response = await fetchImpl(`${TOKENINFO}?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) throw new GoogleAuthError('invalid_token');
    payload = await response.json();
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    throw new GoogleAuthError('google_unreachable', 503);
  }

  if (!payload || payload.error) throw new GoogleAuthError('invalid_token');
  if (!clientIds.includes(payload.aud)) throw new GoogleAuthError('wrong_audience');
  if (!ISSUERS.has(payload.iss)) throw new GoogleAuthError('wrong_issuer');
  if (!(Number(payload.exp) * 1000 > now)) throw new GoogleAuthError('expired');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new GoogleAuthError('email_not_verified');
  if (!payload.email || !payload.sub) throw new GoogleAuthError('invalid_token');

  return {
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name || '',
    picture: payload.picture || null,
    googleId: String(payload.sub),
  };
}
