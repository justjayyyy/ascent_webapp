// In-memory rate limits per caller. On Vercel each warm instance keeps its own counts, so these are a
// brake on bursts rather than a global quota.
const rateLimitStore = new Map();

// Express resolves req.ip from X-Forwarded-For using 'trust proxy' (set in server.js); never read the
// header directly, a caller can put anything in it.
export const clientIdOf = (req) => req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 500;    // 500 requests per window (generous for development)

export function rateLimit(req, res) {
  // Get client identifier (IP or auth token)
  const clientId = clientIdOf(req);
  
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  
  // Get or create client record
  let record = rateLimitStore.get(clientId);
  
  if (!record || record.windowStart < windowStart) {
    record = { windowStart: now, count: 0 };
  }
  
  record.count++;
  rateLimitStore.set(clientId, record);
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    cleanupOldEntries(windowStart);
  }
  
  // Check if rate limited
  if (record.count > MAX_REQUESTS) {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((record.windowStart + WINDOW_MS - now) / 1000)
    });
    return true; // Rate limited
  }
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil((record.windowStart + WINDOW_MS) / 1000));
  
  return false; // Not rate limited
}

function cleanupOldEntries(windowStart) {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.windowStart < windowStart) {
      rateLimitStore.delete(key);
    }
  }
}

// Auth-specific rate limiter (stricter for login/register)
const authRateLimitStore = new Map();
const AUTH_WINDOW_MS = 5 * 60 * 1000;  // 5 minute window
const AUTH_MAX_REQUESTS = 50;           // 50 attempts per window (generous for development)

export function authRateLimit(req, res) {
  const clientId = clientIdOf(req);
  
  const now = Date.now();
  const windowStart = now - AUTH_WINDOW_MS;
  
  let record = authRateLimitStore.get(clientId);
  
  if (!record || record.windowStart < windowStart) {
    record = { windowStart: now, count: 0 };
  }
  
  record.count++;
  authRateLimitStore.set(clientId, record);
  
  if (record.count > AUTH_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.windowStart + AUTH_WINDOW_MS - now) / 1000);
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again later.',
      retryAfter
    });
    return true;
  }
  
  return false;
}

export default rateLimit;

