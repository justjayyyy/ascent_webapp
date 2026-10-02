// The test harness itself: what every other spec relies on.
import { test, expect } from '../fixtures.js';
import { newEmail, openApp } from '../support/app.js';
import { L } from '../support/i18n.js';
import { waitForPageReady } from '../support/layout.js';
import { RATES, guardContext, identityHeaders } from '../support/network.js';
import { ExpensesScreen } from '../screens/ExpensesScreen.js';

test('each test has its own rate limits: one address hitting the sign-in limit does not block another @critical', async ({ page, playwright, testKey, baseURL }) => {
  // Sign-in allows 40 attempts per address per 10 minutes (server/lib/authLimit.js). A new email each time:
  // ten wrong passwords for one account lock that account first
  const attempt = (request) => request.post('/api/auth/login', { data: { email: newEmail('nobody'), password: 'wrong-password' } });
  const statuses = [];
  for (let i = 0; i < 41; i += 1) statuses.push((await attempt(page.request)).status());
  expect(statuses.slice(0, 40).every((s) => s === 401)).toBe(true);
  expect(statuses[40]).toBe(429);

  const elsewhere = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 99) });
  expect((await attempt(elsewhere)).status()).toBe(401);
  await elsewhere.dispose();
});

test('two members of one household see the same expenses, live @critical @multiuser', async ({ page, owner: _owner, member }) => {
  const partner = await member('editor');
  await openApp(partner.page, '/Expenses');
  // Settled first: a change landing while the page is still loading can be missed until the next one (the
  // pulse's first answer becomes the baseline even if it already includes that change)
  await waitForPageReady(partner.page);

  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 18, description: 'Shared coffee' });
  await expect(expenses.row('Shared coffee')).toBeVisible();

  // The partner's open page picks it up from the workspace pulse, without a reload
  await expect(partner.page.getByText('Shared coffee').first()).toBeVisible({ timeout: 15_000 });
});

test('emails the API sends land in the mail sink, with working links @critical', async ({ page, owner, mail }) => {
  const res = await page.request.post('/api/auth/password?action=forgot', { data: { email: owner.email } });
  expect(res.ok()).toBe(true);
  const path = await mail.link(owner.email, '/reset-password/', { subject: /password/i });

  await page.goto(path);
  await expect(page.getByLabel(L('resetNewPassword'))).toBeVisible();
});

test('the browser cannot reach third parties: exchange rates are stubbed, anything else is refused', async ({ browser, baseURL }) => {
  // A context of its own: the suite's contexts fail their test on a refused request, which is the point here
  const context = await browser.newContext({ baseURL });
  const refused = await guardContext(context);
  const page = await context.newPage();
  await page.goto('/login');

  const rates = await page.evaluate(() => fetch('https://api.exchangerate-api.com/v4/latest/USD').then((r) => r.json()));
  expect(rates.rates).toEqual(RATES);

  const blocked = await page.evaluate(() => fetch('https://example.org/track').then(() => 'reached', () => 'refused'));
  expect(blocked).toBe('refused');
  expect(refused).toEqual(['GET https://example.org/track']);
  await context.close();
});
