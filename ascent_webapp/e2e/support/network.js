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

const isLocal = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

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
export function watchPageErrors(context) {
  const errors = [];
  const watch = (page) => page.on('pageerror', (err) => errors.push(`${page.url()}: ${err.message}`));
  context.pages().forEach(watch);
  context.on('page', watch);
  return errors;
}
