import jwt from 'jsonwebtoken';

const DEV_SECRET = 'ascent-local-development-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// A deployment without JWT_SECRET must not fall back to a secret that is in the source code: anyone
// could sign their own tokens. Local development and tests get a fixed one.
export function jwtSecret(env = process.env) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === 'production' || env.VERCEL === '1') throw new Error('JWT_SECRET is not set');
  return DEV_SECRET;
}

export function signToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export function getTokenFromHeader(req) {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim() || null;
  return null;
}
