// Browser tests: the production build (service worker included) against the real API on a throwaway
// database, with third parties stubbed and email caught (e2e/serve-api.mjs). `npm run test:e2e`; the first run
// downloads MongoDB once. Plan and conventions: e2e/TEST_PLAN.md.
//
//   E2E_API_PORT / E2E_APP_PORT  run beside servers already holding the default ports
//   E2E_PREBUILT=1               serve the dist/ that is already built (CI builds once for every shard)
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, APP_PORT, APP_URL, CONTROL_URL } from './e2e/support/env.js';

const CI = !!process.env.CI;
// The test workers read the same ports
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_APP_PORT = String(APP_PORT);

const preview = `npx vite preview --port ${APP_PORT} --strictPort`;
// Specs that visit Settings or drive the sign-in screen (see the WebKit projects below)
const WEBKIT_PENDING = /specs[\\/](auth|account|journeys|cross)[\\/]|household[\\/](members|permissions|invitations|delete-workspace)|dashboard[\\/]assistant|money[\\/](ingest|import)/;
// Offline: Playwright's WebKit fails any page load made offline under a service worker with "WebKit encountered an
// internal error" (an engine-level failure, not the app's); offline behaviour is covered in Chromium
const WEBKIT_UNSUPPORTED = /specs[\\/]offline[\\/]/;
// Screenshots compared with approved ones (specs/visual); only in their own project, see below
const VISUAL = /\.visual\.spec\.js$/;

export default defineConfig({
  testDir: 'e2e/specs',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Visual regression: no animation, no caret, CSS pixels, and a little room for anti-aliasing
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.002 },
  },
  // The approved screenshots, one set per operating system (they are made on Linux, in CI)
  snapshotPathTemplate: '{testDir}/../screenshots/{testFileName}/{arg}{-projectName}{-platform}{ext}',
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
  // Chromium is the everyday run (npm run test:e2e); WebKit is the engine of Safari on the iPhone, where most of
  // the household uses the app (npm run test:e2e:webkit, and on every push to main)
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: [/\.phone\.spec\.js$/, VISUAL] },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /\.phone\.spec\.js$/ },
    // Not in WebKit for now: specs that go through Settings or the sign-in screen. In Playwright's WebKit builds
    // (Windows and Linux) the Settings page stops the main thread about a second after it opens, and the sign-in
    // screen's controls never settle; not blur, text-wrap or the passkey/notification APIs. To be checked on a real
    // iPhone (e2e/TEST_PLAN.md §0.2.3) before these come back here
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] }, testIgnore: [/\.phone\.spec\.js$/, VISUAL, WEBKIT_PENDING, WEBKIT_UNSUPPORTED] },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] }, testMatch: /\.phone\.spec\.js$/, testIgnore: [WEBKIT_PENDING, WEBKIT_UNSUPPORTED] },
    // Visual regression (npm run test:e2e:visual): key screens against approved screenshots, in Chromium on Linux.
    // Fonts, the clock, the time zone and the data are fixed in the spec, so a difference is a change to the design
    { name: 'visual', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testMatch: VISUAL },
  ],
  webServer: [
    {
      command: 'node e2e/serve-api.mjs',
      env: { E2E_API_PORT: String(API_PORT), E2E_APP_PORT: String(APP_PORT) },
      // The control server answers only once the API is up and warm, and only an e2e API has one, so a dev API
      // on the same port is never mistaken for it. Locally an e2e API left running is reused (quicker reruns)
      url: `${CONTROL_URL}/health`,
      timeout: 180_000,
      reuseExistingServer: !CI,
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
