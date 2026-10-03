// Edges across the app (P2: TX-E11, NAV-E02, CHK-N01, AI-N06, AUTH-E11, AUTH-E13, RC-E04, ACC-E02): an expense
// turned into income, switching pages fast, a delete that fails, an unreadable receipt, a double-clicked Sign in,
// the deleted-account message, a recap dismissed, and the last member letting an ownerless household go.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { seedUser } from '../../support/control.js';
import { day, expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text });

test('an expense changed into income moves from Expenses to Income @critical', async ({ page, api }) => {
  const row = await api.create('transactions', expense({ description: 'Refund from shop', amount: 40, category: 'shopping' }));
  await api.update('transactions', row.id, { type: 'Income', category: 'refunds' });
  await openApp(page, '/Income');
  await expect(page.getByText('Refund from shop').first()).toBeVisible();
  await openApp(page, '/Expenses');
  await expect(page.getByText('Refund from shop')).toHaveCount(0);
});

test('switching pages fast ends on the last page with its own data, and nothing breaks @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Coffee beans', amount: 25 }));
  await api.create('plans', { name: 'Summer trip', kind: 'vacation', currency: 'USD' });
  await openApp(page, '/Dashboard');
  const nav = page.getByRole('navigation', { name: L('mainNavigation') });
  for (const key of ['expenses', 'plans', 'notes', 'tkNav', 'plans']) await nav.getByRole('link', { name: L(key), exact: true }).click();
  await expect(page).toHaveURL(/\/Plans$/);
  await expect(page.getByText('Summer trip').first()).toBeVisible();
  await expect(page.getByText('Coffee beans')).toHaveCount(0);
});

// No service worker here: in WebKit, page.route does not see requests from a page it controls
test.describe('without the service worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('when deleting a copy in the check-in hits a server error, it waits on the device and goes through later @critical', async ({ page, api }) => {
    const original = await api.create('transactions', expense({ description: 'Aroma', amount: 18.5, date: day(-1) }));
    await api.create('transactions', expense({ description: 'AROMA TLV', amount: 18.5, date: day(-1), status: 'pending', ingest: { flags: ['possibleDuplicate'], duplicateOf: original.id } }));
    const failing = { on: true };
    await page.route(/\/api\/entities\/transactions\?id=/, (route) => (failing.on && route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: { success: false, error: 'Internal server error' } }) : route.continue()));
    await openApp(page, '/Dashboard');
    await expect(page.getByText(L('ciToLookAt', { n: 1 }))).toBeVisible();
    await page.getByRole('button', { name: L('ciStart') }).click();
    await page.getByRole('button', { name: L('ciDeleteCopy') }).click();
    // A server error counts as passing: the delete waits on this device, and the server still has both
    // (with the sheet closed: while it is open the page behind is hidden from assistive technology)
    await page.keyboard.press('Escape');
    const waiting = page.getByRole('button', { name: L('offWaiting', { count: 1 }) });
    await expect(waiting).toBeVisible();
    expect(await api.list('transactions')).toHaveLength(2);
    // Once the server answers again, the app's own retry deletes it
    failing.on = false;
    await expect.poll(async () => (await api.list('transactions')).map((t) => t.id), { timeout: 30_000 }).toEqual([original.id]);
  });
});

test('a photo that is not a receipt says so, and the amount can still be typed in @critical', async ({ page, owner, api, stubs }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await stubs.set({ ai: 'not-a-receipt' });
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grStartShopping') }).click();
  const shopping = page.getByRole('dialog', { name: L('grShopping') });
  await shopping.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await shopping.getByRole('button', { name: L('grDoneShopping', { n: 1 }) }).click();
  const finish = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: L('grShopDone') }) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await finish.locator('input[type=file]').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: png });
  await expect(finish.getByText(L('grReceiptUnreadable'))).toBeVisible();
  await expect(finish.getByRole('button', { name: L('grTryAnotherPhoto') })).toBeVisible();
});

test('a double-clicked Sign in signs in once @critical', async ({ page }) => {
  const person = await seedUser();
  let logins = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/auth\/login$/.test(r.url())) logins += 1; });
  await page.goto('/login');
  const login = new LoginScreen(page);
  await login.email.fill(person.email);
  await login.continue();
  await login.password.fill(person.password);
  await page.getByRole('button', { name: L('signIn') }).last().dblclick();
  await expect(page).not.toHaveURL(/\/login/);
  expect(logins).toBe(1);
});

test('after deleting the account, the sign-in page says it is done @critical', async ({ page }) => {
  await page.goto('/login?reason=account_deleted');
  await expect(toast(page, L('delDone')).or(page.getByText(L('delDone'))).first()).toBeVisible();
});

test('a dismissed recap does not come back this month @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-07-02T09:00:00'));
  // The recap card keeps moving otherwise, and a moving button cannot be clicked
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await api.create('transactions', expense({ amount: 300, date: '2026-06-12' }));
  await api.create('transactions', expense({ amount: 120, date: '2026-06-20' }));
  await openApp(page, '/Dashboard');
  const ready = page.getByText(L('rcReady').replace('{month}', 'June'));
  await expect(ready).toBeVisible();
  // The card keeps moving, so it is pressed from the keyboard
  await page.getByRole('button', { name: L('rcDismiss') }).focus();
  await page.keyboard.press('Enter');
  await expect(ready).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: L('dashboard') })).toBeVisible();
  await expect(ready).toHaveCount(0);
});

test('when the owner has left and the last member lets the household go, it is deleted with its data @critical @multiuser', async ({ page, owner, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  expect((await page.request.delete('/api/auth/me', { data: { confirm: owner.email } })).status()).toBeLessThan(300);
  await openApp(sam.page, '/Dashboard');
  await sam.page.getByRole('button', { name: L('olLetGo') }).click();
  await expect.poll(async () => (await sam.api.send('GET', `/workspaces?id=${owner.workspaceId}`)).status()).toBeGreaterThanOrEqual(400);
});
