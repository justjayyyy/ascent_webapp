// The real API for the browser tests, on a throwaway in-memory MongoDB that disappears when it stops.
// Nothing here can reach a real database, send real email or call a real third party:
//   - MONGODB_URI points at the in-memory server; SMTP goes to a local sink that keeps every email
//   - third-party fetches are answered by stubs (harness/outbound.mjs), anything else is refused and recorded
//   - a control server (harness/control.mjs) seeds accounts and reads mail, on its own port, for tests only
// Ports: E2E_API_PORT (default 3102); the control server is the next port, the mail sink the one after.
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { stubOutbound, trackRequests } from './harness/outbound.mjs';
import { startMailSink } from './harness/mailSink.mjs';

const API_PORT = Number(process.env.E2E_API_PORT) || 3102;
const CONTROL_PORT = API_PORT + 1;
const SMTP_PORT = API_PORT + 2;

for (const key of Object.keys(process.env)) {
  if (/^(MONGODB_|SMTP_|EMAIL_|SENTRY_|VAPID_|ANTHROPIC_|GOOGLE_|VITE_|CRON_|FRONTEND_|JWT_)/.test(key)) delete process.env[key];
}

const mongo = await MongoMemoryServer.create();
Object.assign(process.env, {
  MONGODB_URI: mongo.getUri('ascent_e2e'),
  JWT_SECRET: 'e2e-only-secret',
  PORT: String(API_PORT),
  NODE_ENV: 'development',
  FRONTEND_URL: `http://localhost:${process.env.E2E_APP_PORT || 4190}`,
  CRON_SECRET: 'e2e-cron',
  // The test build's client id (e2e/support/network.js); Google's token check is stubbed
  GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(SMTP_PORT),
  SMTP_USER: 'e2e',
  SMTP_PASS: 'e2e',
  SMTP_FROM: 'Ascent <ascent@e2e.test>',
});
if (!process.env.MONGODB_URI.startsWith('mongodb://127.0.0.1:')) throw new Error('The e2e API only runs on its in-memory database');

// Passwords hashed at bcrypt cost 4 instead of 10 here. bcryptjs is plain JavaScript on the API's one thread:
// at cost 10 each hash takes ~120 ms of it, and with several test workers seeding accounts and signing in at
// once, the API stalls and unrelated tests time out. The tests check that passwords work, not how slowly.
const genSalt = bcrypt.genSalt;
bcrypt.genSalt = (rounds, ...rest) => genSalt(4, ...rest);

trackRequests();
stubOutbound();
await startMailSink(SMTP_PORT);
// Imported after the environment is set: server modules read it as they load
const { warmUp, watchEventLoop } = await import('./harness/warmup.mjs');
await warmUp();
watchEventLoop();
const { startControl } = await import('./harness/control.mjs');
await startControl(CONTROL_PORT);
await import('../server/server.js');
console.log(`[e2e] API :${API_PORT} · control :${CONTROL_PORT} · mail :${SMTP_PORT}`);

const stop = async () => { await mongo.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
