// The account at its edges (ACC-H05, N02, E01): values blurred on every money screen, preference values the server
// does not take, and an owner deleting their account while others still share the household.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense, income } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

test('with values blurred, no money figure shows on the money screens @critical', async ({ page, api }) => {
  await api.create('transactions', income({ amount: 5432.1, category: 'freelance', description: 'Retainer' }));
  await api.create('transactions', expense({ amount: 1234.56, category: 'groceries', description: 'Big shop' }));
  await api.create('plans', { name: 'Trip', kind: 'vacation', currency: 'USD', budget: 3000, items: [{ id: 'f', name: 'Flights', amount: 900 }] });
  await api.call('PUT', '/auth/me', { blurValues: true });

  // The review opens on last month in a month's first week; this month is where the rows are
  const review = `/Review?month=${new Date().toISOString().slice(0, 7)}`;
  for (const path of ['/Dashboard', '/Expenses', '/Income', review, '/Plans']) {
    await openApp(page, path);
    await waitForPageReady(page, { timeout: 20_000 });
    await expect(page.locator('main').getByText('••••••').first(), path).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text.match(/\$\s?\d[\d,.]*/g), `money shown on ${path}`).toBeNull();
  }
});

test('preference values the app does not have are refused, and nothing changes @critical', async ({ page, api }) => {
  const before = (await (await page.request.get('/api/auth/me')).json()).data;
  for (const bad of [{ currency: 'usd' }, { currency: 'DOLLARS' }, { theme: 'pink' }, { blurValues: 'yes' }, { language: 'klingon' }]) {
    const res = await api.send('PUT', '/auth/me', bad);
    expect(res.status(), JSON.stringify(bad)).toBe(400);
  }
  const after = (await (await page.request.get('/api/auth/me')).json()).data;
  expect([after.currency, after.theme, after.blurValues, after.language]).toEqual([before.currency, before.theme, before.blurValues, before.language]);
});

test('an owner deleting their account leaves the household to its members, and the first to keep it owns it @critical @multiuser', async ({ page, owner, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const kim = await member('editor', { name: 'Kim Partner' });
  // The owner deletes the account (as in Settings › Delete account)
  expect((await page.request.delete('/api/auth/me', { data: { confirm: owner.email } })).status()).toBeLessThan(300);

  await openApp(sam.page, '/Dashboard');
  const ask = sam.page.getByText(L('olTitle', { name: 'Dana Owner' }));
  await expect(ask).toBeVisible();
  await sam.page.getByRole('button', { name: L('olKeep') }).click();
  await expect(sam.page.locator('[data-sonner-toast]').filter({ hasText: /now the owner/ })).toBeVisible();
  const { data } = await (await sam.api.send('GET', `/workspaces?id=${owner.workspaceId}`)).json();
  expect(data.members.find((m) => m.email === sam.email).role).toBe('owner');

  // Kim, a moment later, finds it already kept
  const late = await kim.api.send('POST', `/workspaces?id=${owner.workspaceId}&action=claim`);
  expect(late.status()).toBeGreaterThanOrEqual(400);
});
