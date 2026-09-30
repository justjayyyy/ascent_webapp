import crypto from 'node:crypto';

// Ingest tokens are 256 random bits behind a recognisable prefix (so secret scanners catch leaks).
// Only the SHA-256 of the token is stored: the secret is high-entropy, so a fast hash is enough and
// the database never holds anything that can be replayed.
// Phones wrap pasted values in odd ways (trailing spaces, direction marks, quotes), so the token is picked out of the header.
const TOKEN_IN_TEXT = /(asc_[A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/;

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function newToken() {
  const token = `asc_${crypto.randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, 8) };
}

/** Shape check only: input without a well-formed token is rejected without touching the database. */
export function tokenFromHeader(headers) {
  const match = TOKEN_IN_TEXT.exec(String(headers?.authorization ?? ''));
  return match ? match[1] : null;
}
