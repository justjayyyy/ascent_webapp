// Browser tests: the production build (service worker included) against the real API on a throwaway
// database, with third parties stubbed and email caught (e2e/serve-api.mjs). `npm run test:e2e`; the first run
// downloads MongoDB once. Plan and conventions: e2e/TEST_PLAN.md.
//
//   E2E_API_PORT / E2E_APP_PORT  run beside servers already holding the default ports
//   E2E_PREBUILT=1               serve the dist/ that is already built (CI builds once for every shard)
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, APP_PORT, APP_URL } from './e2e/support/env.js';

const CI = !!process.env.CI;
// The test workers read the same ports
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_APP_PORT = String(APP_PORT);

const preview = `npx vite preview --port ${APP_PORT} --strictPort`;

export default defineConfig({
  testDir: 'e2e/specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Every test seeds its own household, so tests never share data and can run side by side
  fullyParallel: true,
  workers: CI ? 3 : '50%',
  retries: CI ? 2 : 0,
  forbidOnly: CI,
  reporter: CI ? [['blob'], ['github'], ['list']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /\.phone\.spec\.js$/ },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /\.phone\.spec\.js$/ },
  ],
  webServer: [
    {
      command: 'node e2e/serve-api.mjs',
      env: { E2E_API_PORT: String(API_PORT), E2E_APP_PORT: String(APP_PORT) },
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: process.env.E2E_PREBUILT ? preview : `node e2e/build-app.mjs && ${preview}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: APP_URL,
      timeout: 300_000,
      reuseExistingServer: !CI,
    },
  ],
});
