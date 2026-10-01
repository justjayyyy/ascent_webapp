// The API: one Express app, served by api/index.js on Vercel and by `npm run dev:api` locally.
import express from 'express';
import cors from 'cors';
import { rateLimit } from './lib/rateLimit.js';
import { isAllowedOrigin } from './lib/cors.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Vercel sits in front of the app: req.ip is the caller, not the proxy
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use((req, res, next) =>
  cors({
    // Requests without an Origin (Shortcuts, curl, same-origin GETs) carry no browser risk
    origin: (origin, done) => done(null, !origin || isAllowedOrigin(origin, { host: req.headers.host })),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Workspace-Id', 'X-Api-Key'],
  })(req, res, next)
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/**
 * An Express route for a serverless-style handler module, loaded on first use. The import path must be a
 * literal at each call site so Vercel's bundler can see and include it.
 */
export function route(load) {
  let handler;
  return async (req, res) => {
    try {
      handler ??= (await load()).default;
      req.query = { ...req.query, ...req.params };
      await handler(req, res);
    } catch (err) {
      console.error(`[API] ${req.method} ${req.path}:`, err?.message);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };
}

const jsonError = (limit) => (req, res, next) =>
  express.json({ limit })(req, res, (err) => {
    if (!err) return next();
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({ success: false, error: tooLarge ? 'payload_too_large' : 'invalid_json' });
  });

// Automation ingest (phone Shortcuts). Registered ahead of the general parser so it gets its own small limit.
app.post('/api/ingest/:kind', jsonError('8kb'), route(() => import('./api/ingest.js')));
app.all('/api/ingest/:kind', (req, res) => res.status(405).json({ success: false, error: 'method_not_allowed' }));

// Note attachments travel as base64 inside JSON, so the general limit is generous
app.use('/api', jsonError('10mb'));

app.use('/api', (req, res, next) => {
  if (rateLimit(req, res)) return;
  next();
});

const any = (path, handler, methods = ['get', 'post', 'put', 'patch', 'delete']) => methods.forEach((m) => app[m](path, handler));

// Accounts and sessions
app.post('/api/auth/register', route(() => import('./auth/register.js')));
app.post('/api/auth/login', route(() => import('./auth/login.js')));
app.post('/api/auth/google', route(() => import('./auth/google.js')));
app.post('/api/auth/password', route(() => import('./auth/password.js')));
app.post('/api/auth/verify-email', route(() => import('./auth/verify-email.js')));
any('/api/auth/me', route(() => import('./auth/me.js')), ['get', 'put', 'patch', 'delete']);
any('/api/auth/passkey', route(() => import('./auth/passkey.js')), ['get', 'post', 'put', 'delete']);

any('/api/workspaces', route(() => import('./api/workspaces.js')), ['get', 'post', 'put', 'delete']);
app.get('/api/invitations/:token', route(() => import('./api/get-invitation.js')));
any('/api/ingest-tokens', route(() => import('./api/ingest-tokens.js')), ['get', 'post', 'delete']);
any('/api/push', route(() => import('./api/push.js')), ['get', 'post', 'delete']);
app.post('/api/import/statement', route(() => import('./api/import-statement.js')));
any('/api/assist', route(() => import('./api/assist.js')), ['get', 'post']);

// Workspace data
const ENTITIES = {
  accounts: () => import('./entities/accounts.js'),
  positions: () => import('./entities/positions.js'),
  'day-trades': () => import('./entities/day-trades.js'),
  transactions: () => import('./entities/transactions.js'),
  budgets: () => import('./entities/budgets.js'),
  categories: () => import('./entities/categories.js'),
  cards: () => import('./entities/cards.js'),
  goals: () => import('./entities/goals.js'),
  'dashboard-widgets': () => import('./entities/dashboard-widgets.js'),
  'page-layouts': () => import('./entities/page-layouts.js'),
  snapshots: () => import('./entities/snapshots.js'),
  notes: () => import('./entities/notes.js'),
  'portfolio-transactions': () => import('./entities/portfolio-transactions.js'),
  plans: () => import('./entities/plans.js'),
  settlements: () => import('./entities/settlements.js'),
  commitments: () => import('./entities/commitments.js'),
};
for (const [name, load] of Object.entries(ENTITIES)) any(`/api/entities/${name}`, route(load));

// Integrations
app.get('/api/integrations/stock-quote', route(() => import('./integrations/stock-quote.js')));
// Apple Pay via the older single-key Shortcut (new setups use /api/ingest with per-device tokens)
any('/api/integrations/quick-add', route(() => import('./integrations/quick-add.js')), ['get', 'post', 'delete']);
any('/api/integrations/google-calendar', route(() => import('./integrations/google-calendar.js')), ['get', 'post', 'put', 'patch', 'delete']);

// Scheduled emails (Vercel Cron)
any('/api/send-daily-summary', route(() => import('./api/send-daily-summary.js')), ['get', 'post']);
any('/api/send-weekly-summary', route(() => import('./api/send-weekly-summary.js')), ['get', 'post']);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Not found' }));

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
}

export default app;
