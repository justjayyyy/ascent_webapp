// What every browser context in the suite gets: third-party calls answered by stubs, and a record of any
// request that tried to leave the machine (the test fails on it). The API's own outbound calls are stubbed
// in the API process (e2e/harness/outbound.mjs), keyed by the same test header.
import crypto from 'node:crypto';

// The same values the API's stub returns (e2e/harness/outbound.mjs)
export const RATES = { USD: 1, ILS: 3.7, EUR: 0.92, RUB: 90, GBP: 0.79 };

// The test build's Google client id (playwright.config.js), so local and CI builds show the same buttons
export const GOOGLE_CLIENT_ID = 'e2e-client.apps.googleusercontent.com';

// Stands in for Google Identity Services (accounts.google.com/gsi/client): renders a button, and keeps the
// callback where a test can answer it with a credential of its choosing (window.__gsi.callback({ credential })).
const FAKE_GSI = `(() => {
  const id = {
    initialize(config) { window.__gsi = config; },
    renderButton(host) {
      const b = document.createElement('div');
      b.setAttribute('role', 'button'); b.tabIndex = 0; b.textContent = 'Google';
      b.addEventListener('click', () => window.__gsiClicked = (window.__gsiClicked || 0) + 1);
      host.replaceChildren(b);
    },
    prompt() {}, cancel() {}, disableAutoSelect() {},
  };
  const oauth2 = {
    initCodeClient: (config) => ({ requestCode() { window.__gsiCode = config; } }),
    initTokenClient: (config) => ({ requestAccessToken() { window.__gsiToken = config; } }),
    revoke(token, done) { done && done({ successful: true }); },
  };
  window.google = { accounts: { id, oauth2 } };
})();`;

// The page's own addresses: this machine, and blob:/data: URLs (a file shown before upload) which go nowhere
const isLocal = (url) => ['blob:', 'data:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/**
 * Headers that say which test a request belongs to. Each test, and each device within it, gets its own client
 * address: the API trusts X-Forwarded-For (it sits behind Vercel's proxy), so rate-limit counters never carry
 * over from one test to the next.
 */
export function identityHeaders(testKey, device = 0) {
  const h = crypto.createHash('sha256').update(`${testKey}#${device}`).digest();
  return { 'x-e2e-test': testKey, 'X-Forwarded-For': `10.${h[0]}.${h[1]}.${h[2] || 1}` };
}

/** Routes a context's third-party traffic. Returns the list of requests that were refused. */
export async function guardContext(context) {
  const refused = [];
  // Vercel Analytics and Speed Insights scripts only exist on Vercel
  await context.route(/\/_vercel\//, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  // The fake Google is there before the app runs, so the app never asks for Google's script at all: in WebKit a
  // request for it once slipped past the route below and brought the real one, which opened Google's real popup
  await context.addInitScript({ content: FAKE_GSI });
  await context.route((url) => !isLocal(url), (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.exchangerate-api.com') {
      return route.fulfill({ json: { base: 'USD', date: new Date().toISOString().slice(0, 10), rates: RATES } });
    }
    if (url.hostname === 'accounts.google.com' && url.pathname === '/gsi/client') {
      return route.fulfill({ contentType: 'text/javascript', body: FAKE_GSI });
    }
    refused.push(`${route.request().method()} ${url.href}`);
    return route.abort('blockedbyclient');
  });
  return refused;
}

/** Collects uncaught errors from every page in the context. */
// WebKit reports a request to the app's own address cut off by leaving the page as "...due to access control
// checks"; a same-origin request cannot fail access control, so it is the navigation, not an error
const navigationNoise = (page, message) => {
  const own = new URL(page.url()).host;
  return /due to access control checks/.test(message) && message.includes(own);
};

// Likewise, when the page goes (a reload, or the next page.goto), a request to another address (the stubbed
// exchange rates) gets the same "access control" message, and a page's code still loading is rejected with
// "Importing a module script failed" (Chromium: "Failed to fetch dynamically imported module", for the next pages'
// code it fetches ahead). Struck off only if the page does navigate within a moment, so a request or a chunk that
// really fails still fails the test
const CUT_OFF = /Importing a module script failed|Failed to fetch dynamically imported module|due to access control checks/;
const CUT_OFF_WINDOW_MS = 2000;

export function watchPageErrors(context) {
  const errors = [];
  const watch = (page) => {
    let cutOff = []; // { entry, at } failures that a navigation may yet explain
    page.on('pageerror', (err) => {
      if (navigationNoise(page, err.message)) return;
      const entry = `${page.url()}: ${err.message}`;
      errors.push(entry);
      if (CUT_OFF.test(err.message)) cutOff.push({ entry, at: Date.now() });
    });
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const now = Date.now();
      cutOff.filter((c) => now - c.at < CUT_OFF_WINDOW_MS).forEach((c) => {
        const i = errors.indexOf(c.entry);
        if (i >= 0) errors.splice(i, 1);
      });
      cutOff = [];
    });
  };
  context.pages().forEach(watch);
  context.on('page', watch);
  return errors;
}
