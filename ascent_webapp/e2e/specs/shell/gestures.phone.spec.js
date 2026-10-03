// Phone gestures (NAV-H07): pulling the page down from the top refreshes what is on screen, a short pull does not.
// Touches go through Chromium's DevTools protocol (a real touch sequence the page's listeners see).
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'touch sequences are sent through the Chromium DevTools protocol');

/** A finger from (x, y) straight down by `distance`, in steps, then lifted */
async function pull(page, distance) {
  const cdp = await page.context().newCDPSession(page);
  const x = 190;
  const y = 220;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let d = 10; d <= distance; d += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + d }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Lists of transactions the page asks for from now on */
function transactionLoads(page) {
  const seen = [];
  page.on('request', (req) => { if (/\/api\/entities\/transactions/.test(req.url()) && req.method() === 'GET') seen.push(req.url()); });
  return seen;
}

test('pulling the page down from the top refreshes it, and a short pull does not @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Coffee beans', amount: 25 }));
  // The 4-second change pulse would bring new rows in by itself; silenced here, so only the pull can
  await page.route(/action=pulse/, (route) => route.abort());
  await openApp(page, '/Expenses');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page.getByText('Coffee beans').first()).toBeVisible();

  // A short pull: below the point where it would refresh
  let loads = transactionLoads(page);
  await pull(page, 60);
  await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 800); }));
  expect(loads, 'a short pull refreshed').toEqual([]);

  // Someone else adds one; a full pull brings it in
  await api.create('transactions', expense({ description: 'Train ticket', amount: 12 }));
  loads = transactionLoads(page);
  await pull(page, 220);
  await expect(page.getByRole('status', { name: L('refresh') })).toBeVisible();
  await expect.poll(() => loads.length).toBeGreaterThan(0);
  await expect(page.getByText('Train ticket').first()).toBeVisible();
});
