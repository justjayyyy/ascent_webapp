// The browser tests' back door into the throwaway API: create accounts and households without going through
// sign-up (which is rate limited per address), read the emails the API sent, and set third-party scenarios.
// It is its own server on 127.0.0.1, started only by e2e/serve-api.mjs; the app's Express server never has
// these routes.
import http from 'node:http';
import crypto from 'node:crypto';
import connectDB from '../../server/lib/mongodb.js';
import User from '../../server/models/User.js';
import Workspace from '../../server/models/Workspace.js';
import { createAccount, startingPrefs } from '../../server/lib/accounts.js';
import { issueSession } from '../../server/lib/session.js';
import { ASSIGNABLE_ROLES, buildPermissions } from '../../shared/workspaceAccess.js';
import { clearMail, mailTo } from './mailSink.mjs';
import { clearScenario, setScenario, unexpectedCalls } from './outbound.mjs';

// The password every seeded account has; generated for tests, never a real one
export const SEED_PASSWORD = 'e2e-pass-123';

const uniqueEmail = (label = 'user') => `${label}-${crypto.randomUUID().slice(0, 12)}@e2e.test`;

async function newAccount({ email, name = 'Dana Test', language = 'en', theme = 'dark', emailVerified = false } = {}) {
  const user = await createAccount({
    email: String(email || uniqueEmail()).toLowerCase(),
    password: SEED_PASSWORD,
    full_name: name,
    emailVerified,
    ...startingPrefs({ language, theme }),
  });
  return user;
}

const sessionFor = (user) => issueSession(user, { userAgent: 'Playwright e2e' });

const personOf = async (user, workspaceId) => ({
  userId: String(user._id),
  email: user.email,
  name: user.full_name,
  password: SEED_PASSWORD,
  workspaceId: String(workspaceId || user.defaultWorkspace),
  token: await sessionFor(user),
});

const routes = {
  'GET /health': () => ({ ok: true }),

  // A new account with its own workspace, signed in once. Body: { email?, name?, language?, theme?, emailVerified? }
  'POST /seed/user': async (body) => personOf(await newAccount(body)),

  // A new account that has accepted a place in `workspaceId` with `role` (and optional custom permissions)
  'POST /seed/member': async ({ workspaceId, role = 'editor', permissions, ...account }) => {
    if (!ASSIGNABLE_ROLES.includes(role)) throw Object.assign(new Error(`role must be one of ${ASSIGNABLE_ROLES}`), { status: 400 });
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) throw Object.assign(new Error('workspace not found'), { status: 404 });
    const user = await newAccount(account);
    workspace.members.push({
      userId: user._id, email: user.email, role, status: 'accepted', joinedAt: new Date(),
      invitedBy: workspace.ownerId, permissions: buildPermissions(role, permissions),
    });
    await workspace.save();
    return personOf(user, workspace._id);
  },

  // Another signed-in device for an existing account. Body: { userId }
  'POST /seed/session': async ({ userId }) => {
    const user = await User.findById(userId);
    if (!user) throw Object.assign(new Error('user not found'), { status: 404 });
    return { token: await sessionFor(user) };
  },

  'GET /mail': (body, query) => mailTo(query.get('to')),
  'DELETE /mail': (body, query) => { clearMail(query.get('to')); return { ok: true }; },

  'PUT /stubs': ({ test, ...scenario }) => { setScenario(test, scenario); return { ok: true }; },
  'DELETE /stubs': (body, query) => { clearScenario(query.get('test')); return { ok: true }; },
  'GET /outbound': (body, query) => unexpectedCalls(query.get('test')),
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (err) { reject(err); } });
  req.on('error', reject);
});

export function startControl(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const handler = routes[`${req.method} ${url.pathname}`];
    // A fresh connection per call: a kept-alive one can be closed by this server just as a test reuses it (ECONNRESET)
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', connection: 'close' }); res.end(JSON.stringify(body)); };
    if (!handler) return send(404, { error: 'unknown control route' });
    try {
      await connectDB();
      send(200, await handler(await readBody(req), url.searchParams));
    } catch (err) {
      send(err.status || 500, { error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
