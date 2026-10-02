// Browser tests: the production build (service worker included) against the real API on a throwaway
// database. `npm run test:e2e`; the first run downloads MongoDB once.
import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 4190;
const API_PORT = 3102;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec/ },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /phone\.spec/ },
  ],
  webServer: [
    {
      command: 'node e2e/serve-api.mjs',
      env: { E2E_API_PORT: String(API_PORT) },
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `npx vite build && npx vite preview --port ${APP_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}`, VITE_SENTRY_DSN: '' },
      url: `http://localhost:${APP_PORT}`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
