// Builds the app for the browser tests: the production build with the test settings, so a developer's own .env
// cannot make the local test build differ from CI's. Used by playwright.config.js and by CI's build job.
import { spawnSync } from 'node:child_process';
import { GOOGLE_CLIENT_ID } from './support/network.js';

const result = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_SENTRY_DSN: '',
    // Google's script is replaced by a fake in the tests (support/network.js); the buttons show, as in production
    VITE_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
  },
});
process.exit(result.status ?? 1);
