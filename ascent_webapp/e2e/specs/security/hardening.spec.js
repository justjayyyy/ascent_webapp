// What the API does with requests it should not trust (§3.18): fields a client may not set, ids that are not ids,
// bodies too big or broken, scheduled jobs without their secret, and text that tries to become code on a screen
// or in an email.
import { test, expect } from '../../fixtures.js';
import { apiFor } from '../../support/api.js';
import { openApp } from '../../support/app.js';
import { seedUser } from '../../support/control.js';
import { expense } from '../../support/factories.js';
import { waitForPageReady } from '../../support/layout.js';

const ENTITIES = ['transactions', 'budgets', 'categories', 'cards', 'goals', 'notes', 'plans', 'commitments', 'groceries', 'tasks'];

test('who added a row and which household it is in come from the session, never from the request @critical', async ({ page, owner, api }) => {
  const stranger = await seedUser({ name: 'Eve Stranger' });
  const row = await api.create('transactions', expense({
    description: 'Mine',
    created_by: stranger.email, createdBy: stranger.userId, workspaceId: stranger.workspaceId, _id: '0123456789abcdef01234567',
  }));
  expect(row.created_by).toBe(owner.email);
  expect(String(row.workspaceId)).toBe(owner.workspaceId);
  expect(row.id).not.toBe('0123456789abcdef01234567');

  // Nor can a change move it, or hand it to someone else
  await api.update('transactions', row.id, { workspaceId: stranger.workspaceId, created_by: stranger.email, amount: 30 });
  const [stored] = await api.list('transactions');
  expect([stored.amount, stored.created_by, String(stored.workspaceId)]).toEqual([30, owner.email, owner.workspaceId]);
  const asStranger = apiFor(page.request, stranger.workspaceId);
  const theirs = await asStranger.send('GET', '/entities/transactions', undefined, { Cookie: `ascent_session=${stranger.token}` });
  expect((await theirs.json()).data).toEqual([]);
});

test('an id that is not an id is a bad request, never a server error @critical', async ({ api }) => {
  for (const entity of ENTITIES) {
    // A change aimed at it is refused as a bad request
    for (const method of ['PUT', 'DELETE']) {
      const res = await api.send(method, `/entities/${entity}?id=not-an-id`, method === 'PUT' ? { name: 'x' } : undefined);
      expect(res.status(), `${method} ${entity}`).toBe(400);
    }
    // Reading never errors (notes' list ignores an id it is not asked to look up)
    expect((await api.send('GET', `/entities/${entity}?id=not-an-id`)).status(), `GET ${entity}`).toBeLessThan(500);
  }
});

test('a body that is too big, broken, or missing its household is refused cleanly @critical', async ({ page, owner, api }) => {
  const big = await api.send('POST', '/entities/notes', { title: 'Big', content: 'x'.repeat(11 * 1024 * 1024) });
  expect(big.status()).toBe(413);
  expect((await big.json()).error).toBe('payload_too_large');

  const broken = await page.request.fetch('/api/entities/notes', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': owner.workspaceId }, data: '{"title": "half',
  });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toBe('invalid_json');

  const noHousehold = await page.request.get('/api/entities/transactions');
  expect(noHousehold.status()).toBe(400);
  expect(await api.list('notes')).toEqual([]);
});

test('the scheduled summaries run only with their secret @critical', async ({ playwright, baseURL }) => {
  const cron = await playwright.request.newContext({ baseURL });
  for (const path of ['/api/send-daily-summary', '/api/send-weekly-summary']) {
    expect((await cron.get(path)).status(), `${path} without a secret`).toBe(401);
    expect((await cron.get(path, { headers: { Authorization: 'Bearer guess' } })).status(), `${path} with a wrong one`).toBe(401);
    expect((await cron.get(path, { headers: { Authorization: 'Bearer e2e-cron' } })).status(), `${path} with it`).toBe(200);
  }
  await cron.dispose();
});

// Markup that runs code if a screen ever treats text as HTML
const PAYLOAD = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';

test('text that looks like code is shown as text on every screen @critical', async ({ page, owner, api, browserName }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}`, { name: `Home ${PAYLOAD}` });
  await api.create('transactions', expense({ description: `Lunch ${PAYLOAD}` }));
  await api.create('categories', { name: `Treats ${PAYLOAD}`, type: 'Expense', color: '#888888' });
  await api.create('plans', { name: `Trip ${PAYLOAD}`, kind: 'other', items: [{ id: 'hotel', name: `Hotel ${PAYLOAD}`, amount: 100 }] });
  await api.create('goals', { name: `Car ${PAYLOAD}`, targetAmount: 1000, currency: 'USD' });
  await api.create('tasks', { title: `Boiler ${PAYLOAD}` });
  await api.create('notes', { title: `Plumber ${PAYLOAD}`, content: `Call ${PAYLOAD}` });
  await api.create('groceries', { name: `Milk ${PAYLOAD}` });

  page.on('dialog', (d) => d.dismiss());
  const screens = [['/Dashboard', 'Lunch'], ['/Expenses', 'Lunch'], ['/Plans', 'Trip'], ['/Savings', 'Car'], ['/Tasks', 'Boiler'], ['/Notes', 'Plumber'], ['/Groceries', 'Milk'], ['/Settings', 'Home']]
    // Settings stops Playwright's WebKit (TEST_PLAN.md §0.2.3); it is checked in Chromium
    .filter(([path]) => browserName !== 'webkit' || path !== '/Settings');
  for (const [path, shown] of screens) {
    await openApp(page, path);
    await waitForPageReady(page, { timeout: 20_000 });
    // The markup is there as characters people can read, and nothing ran
    await expect(page.getByText(`${shown} <img`, { exact: false }).first(), path).toBeVisible();
    expect(await page.evaluate(() => window.__xss), `code ran on ${path}`).toBeUndefined();
    await expect(page.locator('main img[src="x"]'), `an image made from text on ${path}`).toHaveCount(0);
  }
});

test('names in an invitation email are escaped in the HTML and read normally in the text @critical', async ({ owner, api, mail }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}`, { name: `Levi & Sons ${PAYLOAD}` });
  await api.call('POST', `/workspaces?id=${owner.workspaceId}&action=invite`, { email: 'friend@e2e.test', role: 'viewer' });
  const message = await mail.waitFor('friend@e2e.test');
  expect(message.html).not.toContain('<img src=x');
  expect(message.html).not.toContain('<script>');
  expect(message.html).toContain('Levi &amp; Sons &lt;img');
  // The plain-text version is for people, not a browser: no HTML entities in it
  expect(message.text).toContain('Levi & Sons <img');
  expect(message.text).not.toMatch(/&(amp|lt|gt|quot|#39);/);
});
