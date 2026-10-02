// The real API for the browser tests, on a throwaway in-memory MongoDB that disappears when it stops.
// Nothing here can reach a real database or send real email: no MONGODB_URI or SMTP settings are read.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
const env = {
  MONGODB_URI: mongo.getUri('ascent_e2e'),
  JWT_SECRET: 'e2e-only-secret',
  PORT: process.env.E2E_API_PORT || '3102',
  NODE_ENV: 'development',
};
for (const key of Object.keys(process.env)) {
  if (/^(SMTP_|EMAIL_|SENTRY_|VAPID_|ANTHROPIC_|GOOGLE_|VITE_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, env);

await import('../server/server.js');

const stop = async () => { await mongo.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
