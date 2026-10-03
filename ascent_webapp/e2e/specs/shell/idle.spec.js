// What an open, idle app costs the server (§4.5): a change pulse every 4 seconds, a presence heartbeat every minute
// and the household list (who is online) every 30 seconds, 18 requests a minute, and nothing while the tab is
// hidden. The browser's clock is installed so a minute passes in a moment; motion is reduced so the frames it
// fast-forwards through are cheap.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { waitForPageReady } from '../../support/layout.js';

/** API requests the page makes from now on, as "METHOD /path?action"; .pending is how many are still in flight */
function countApiRequests(page) {
  const seen = [];
  const inFlight = new Set();
  Object.defineProperty(seen, 'pending', { get: () => inFlight.size });
  const api = (req) => new URL(req.url()).pathname.startsWith('/api/');
  page.on('request', (req) => {
    if (!api(req)) return;
    const url = new URL(req.url());
    seen.push(`${req.method()} ${url.pathname}${url.search.replace(/id=[^&]+&?/, '')}`);
    inFlight.add(req);
  });
  const done = (req) => { inFlight.delete(req); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return seen;
}

/** Moves the clock on in 4-second steps, letting each step's requests finish, as real time would */
async function passTime(page, ms, requests) {
  for (let t = 0; t < ms; t += 4_000) {
    await page.clock.runFor(Math.min(4_000, ms - t));
    await expect.poll(() => requests.pending).toBe(0);
    // And lets the page finish handling the answers (real tasks: the installed clock holds back timers, not these)
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => { const c = new MessageChannel(); c.port1.onmessage = () => resolve(); c.port2.postMessage(0); });
      }
    });
  }
}

const kinds = (requests) => ({
  pulse: requests.filter((r) => r.includes('action=pulse')).length,
  heartbeat: requests.filter((r) => r.includes('action=heartbeat')).length,
  household: requests.filter((r) => r === 'GET /api/workspaces').length,
  other: requests.filter((r) => !/action=(pulse|heartbeat)/.test(r) && r !== 'GET /api/workspaces'),
});

const setVisibility = (page, state) => page.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);

// No service worker: in WebKit the requests it carries are not reported to the test, so they could not be counted
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
});

test('an idle Dashboard makes 18 requests a minute, each for its reason @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  // Let start-up finish, then count one quiet minute
  await page.clock.runFor(10_000);
  const requests = countApiRequests(page);
  await passTime(page, 60_000, requests);

  const k = kinds(requests);
  expect(k.other, 'requests an idle page should not make').toEqual([]);
  // At most the designed rate; how many of them fit depends on how fast the page handles answers under a fast-
  // forwarded clock (a pulse still in flight skips the next tick), so only "it keeps watching" is asserted below it
  expect(k.pulse, 'pulses').toBeGreaterThanOrEqual(1);
  expect(k.pulse, 'pulses (one every 4 s)').toBeLessThanOrEqual(16);
  expect(k.heartbeat, 'heartbeats (one a minute)').toBeLessThanOrEqual(1);
  expect(k.household, 'household refreshes (every 30 s)').toBeLessThanOrEqual(2);
});

test('a hidden tab stops asking the server, and catches up once when it is back @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  await page.clock.runFor(10_000);

  await setVisibility(page, 'hidden');
  // What the last pulse before hiding set off (a household refresh, then what it reloads) finishes first
  await passTime(page, 8_000, countApiRequests(page));
  const requests = countApiRequests(page);
  await passTime(page, 45_000, requests);
  expect([...requests], 'requests from a hidden tab').toEqual([]);

  await setVisibility(page, 'visible');
  await page.clock.runFor(1_000);
  await expect.poll(() => requests.some((r) => r.includes('action=pulse'))).toBe(true);
});
