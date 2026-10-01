// Which browser origins may call the API. The app itself is served from the same origin as /api, so
// this only matters for previews, local development and anything configured explicitly.

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// The production app and its Vercel previews (ascentwebapp-git-<branch>-<team>.vercel.app and the like)
const OURS = /^https:\/\/ascentwebapp(-[a-z0-9-]+)?\.vercel\.app$/;

const trim = (o) => String(o).replace(/\/+$/, '');

/** Origins named by the environment: FRONTEND_URL, PASSKEY_ORIGIN and the URLs Vercel provides. */
export function configuredOrigins(env = process.env) {
  return [
    env.FRONTEND_URL,
    env.PASSKEY_ORIGIN,
    env.VERCEL_URL && `https://${env.VERCEL_URL}`,
    env.VERCEL_BRANCH_URL && `https://${env.VERCEL_BRANCH_URL}`,
    env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ].filter(Boolean).map(trim);
}

/**
 * Whether `origin` is one we serve. `host` is the request's Host header: a page on the same host as the
 * API (a custom domain, say) is always allowed. Exact matches only; no substring tricks.
 */
export function isAllowedOrigin(origin, { host, env = process.env } = {}) {
  if (!origin || typeof origin !== 'string') return false;
  const o = trim(origin);
  if (LOCAL.test(o) || OURS.test(o) || configuredOrigins(env).includes(o)) return true;
  try {
    const url = new URL(o);
    return !!host && url.protocol === 'https:' && url.host === host;
  } catch {
    return false;
  }
}

// Handlers are written in the serverless style and start with `if (handleCors(req, res)) return;`.
// The Express app sets the CORS headers; this only answers a stray preflight that reaches a handler.
export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
