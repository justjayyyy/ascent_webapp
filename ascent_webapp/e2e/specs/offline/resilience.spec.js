// Without a connection, and with a connection that drops at the worst moment.
import { test, expect } from '../../fixtures.js';
import { installOffline, openApp, serverTransactions } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

test('the installed app opens with no connection at all, on the numbers it saw last @critical @offline', async ({ page, context, api }) => {
  await api.create('transactions', expense({ description: 'Seen yesterday', amount: 31 }));
  await openApp(page, '/Expenses');
  await expect(page.getByText('Seen yesterday').first()).toBeVisible();
  await installOffline(page);

  await context.setOffline(true);
  // A fresh start of the app, not just a page already open
  await page.goto('/Dashboard');
  await page.goto('/Expenses');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Seen yesterday').first()).toBeVisible();
  await expect(page.getByText(L('offOffline'), { exact: true }).first()).toBeVisible();
});

test('when the answer to a save is lost on the way back, the retry does not add it twice @critical @offline', async ({ page, owner: _owner }) => {
  await openApp(page, '/Expenses');
  // The first save reaches the server and is stored, then the connection drops before the app hears back
  let dropped = false;
  await page.route('**/api/entities/transactions*', async (route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    await route.fetch();
    return route.abort('connectionreset');
  });

  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 9.5, description: 'Retry coffee' });
  await expect.poll(() => dropped).toBe(true);

  // The app sends it again (same key), and the server recognises it
  await expect.poll(async () => (await serverTransactions(page)).filter((t) => t.description === 'Retry coffee').length, { timeout: 30_000 }).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: /Retry coffee/ })).toHaveCount(1);
  expect((await serverTransactions(page)).filter((t) => t.description === 'Retry coffee')).toHaveLength(1);
});

// How visible an element really is: its opacity times every ancestor's (Playwright counts opacity 0 as visible)
const seenOpacity = (locator) => locator.evaluate((el) => {
  let opacity = 1;
  for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
  return opacity;
});
const ANIMATION_CODE = /\/assets\/motionFeatures-[^/]+\.js$/;

// Open bug: every page fades in from opacity 0 through Motion, whose animation code loads after start-up. If that
// download fails (a weak connection on the first visit, before the service worker has the app), everything stays
// invisible. Marked as failing until it is fixed; when it starts passing, remove test.fail. See TEST_PLAN.md §0.2.2.
test('when the animation code cannot be downloaded, the app still shows @critical', async ({ page, owner: _owner }) => {
  test.fail(true, 'known bug: content stays at opacity 0 without the lazily loaded animation code');
  await page.route(ANIMATION_CODE, (route) => route.abort('connectionreset'));
  await openApp(page, '/Dashboard');
  const heading = page.getByRole('heading', { name: L('dashboard'), level: 1 });
  await expect.poll(() => seenOpacity(heading), { timeout: 8000 }).toBe(1);
});
