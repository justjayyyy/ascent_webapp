// Error reports to Sentry. Off unless SENTRY_DSN is set.
//
// The server sends events itself in Sentry's envelope format instead of loading @sentry/node, which takes
// seconds to import: every serverless cold start would pay for it. The app's own reports come through
// /api/monitoring (tunnelEnvelope), so they pass the page's Content-Security-Policy and ad blockers.
// Nothing personal is sent: no request bodies, query strings, cookies, headers or emails.
import { randomUUID } from 'node:crypto';

const TIMEOUT_MS = 2000;

/** { key, host, projectId, origin } from a DSN like https://KEY@o1.ingest.sentry.io/123, or null. */
export function parseDsn(dsn) {
  try {
    const url = new URL(String(dsn || '').trim());
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!url.username || !/^\d+$/.test(projectId) || !/^https?:$/.test(url.protocol)) return null;
    return { key: url.username, host: url.host, projectId, origin: `${url.protocol}//${url.host}` };
  } catch {
    return null;
  }
}

export const envelopeUrl = (dsn) => `${dsn.origin}/api/${dsn.projectId}/envelope/`;

/** Stack frames in Sentry's order (oldest call first) from a V8 stack. */
export function stackFrames(stack = '') {
  const frames = [];
  for (const line of String(stack).split('\n').slice(1)) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    const filename = m[2].replace(/^file:\/\//, '');
    frames.push({
      function: m[1] || '<anonymous>',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    });
  }
  return frames.reverse();
}

/** The Sentry event for `err` thrown while handling `req` (method and path only). */
export function buildEvent(err, { req, env = process.env, now = new Date() } = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: now.getTime() / 1000,
    platform: 'node',
    level: 'error',
    logger: 'api',
    environment: env.VERCEL_ENV || env.NODE_ENV || 'development',
    ...(env.VERCEL_GIT_COMMIT_SHA ? { release: env.VERCEL_GIT_COMMIT_SHA } : {}),
    exception: { values: [{ type: error.name || 'Error', value: error.message, stacktrace: { frames: stackFrames(error.stack) } }] },
    ...(req ? { tags: { route: `${req.method} ${req.baseUrl || ''}${req.path || ''}`.trim() }, request: { method: req.method, url: req.path } } : {}),
  };
}

async function send(dsn, body, fetchImpl) {
  const res = await fetchImpl(envelopeUrl(dsn), {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok;
}

/** Reports a server error. Never throws; resolves to whether it was sent. */
export async function reportError(err, { req, env = process.env, fetchImpl = fetch } = {}) {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return false;
  try {
    const event = buildEvent(err, { req, env });
    const header = { event_id: event.event_id, sent_at: new Date().toISOString(), dsn: String(env.SENTRY_DSN).trim() };
    return await send(dsn, `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`, fetchImpl);
  } catch {
    return false;
  }
}

/**
 * Forwards an envelope the app sent to /api/monitoring, but only to this app's own Sentry project
 * (SENTRY_DSN or VITE_SENTRY_DSN), so the endpoint cannot be used to post anywhere else.
 */
export async function tunnelEnvelope(body, { env = process.env, fetchImpl = fetch } = {}) {
  const allowed = [env.SENTRY_DSN, env.VITE_SENTRY_DSN].map(parseDsn).filter(Boolean);
  if (!allowed.length || typeof body !== 'string' || !body) return false;
  let header;
  try { header = JSON.parse(body.slice(0, body.indexOf('\n'))); } catch { return false; }
  const dsn = parseDsn(header?.dsn);
  if (!dsn || !allowed.some((a) => a.host === dsn.host && a.projectId === dsn.projectId && a.key === dsn.key)) return false;
  try { return await send(dsn, body, fetchImpl); } catch { return false; }
}
