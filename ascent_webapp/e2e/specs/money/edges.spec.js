// Edges that touch money and accounts (P2: TK-E02, GR-E01, LN-E03, TX-E10, BUD-E02, ING-E02, AUTH-E08, AUTH-E09,
// ACC-E03, WS-N12): two people on the same list at once, a price that does not split evenly, other currencies,
// and the shapes of an email, a name and a household that the server must handle.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { seedMember } from '../../support/control.js';
import { day, expense } from '../../support/factories.js';
import { identityHeaders } from '../../support/network.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

const entry = (api, entity, id, list, item) => api.send('PATCH', `/entities/${entity}?id=${id}&list=${list}`, { op: 'put', item });

test('two people ticking the same task, buying the same item, or paying the same loan at once keep both, never an error @critical @multiuser', async ({ api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const task = await api.create('tasks', { title: 'Water the plants', dueDate: day(0) });
  const milk = await api.create('groceries', { name: 'Milk', onList: true });
  const loan = await api.create('commitments', { name: 'Family loan', kind: 'family', direction: 'borrowed', currency: 'USD', principal: 1000 });

  for (const [entity, id, list, a, b] of [
    ['tasks', task.id, 'history', { id: 'h1', date: day(0), amount: 0 }, { id: 'h2', date: day(0), amount: 0 }],
    ['groceries', milk.id, 'purchases', { id: 'p1', date: day(0), store: 'Shufersal' }, { id: 'p2', date: day(0), store: 'Rami Levy' }],
    ['commitments', loan.id, 'payments', { id: 'r1', date: day(0), amount: 100 }, { id: 'r2', date: day(0), amount: 100 }],
  ]) {
    const [mine, sams] = await Promise.all([entry(api, entity, id, list, a), entry(sam.api, entity, id, list, b)]);
    expect([mine.status(), sams.status()], `${entity}: ${await mine.text()}`).toEqual([200, 200]);
    const [row] = (await api.list(entity)).filter((r) => r.id === id);
    expect(row[list].map((e) => e.id).sort(), entity).toEqual([a.id, b.id]);
  }
});

test('a price that does not split evenly: three payments of 100 add up to exactly 100 @critical', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  await new ExpensesScreen(page).addInstallments({ amount: 100, description: 'Headphones', payments: 3 });
  await expect.poll(async () => (await api.list('transactions')).length).toBe(3);
  const parts = (await api.list('transactions')).map((t) => t.amount);
  expect(Math.round(parts.reduce((s, a) => s + a, 0) * 100)).toBe(10000);
  expect(parts.every((a) => a >= 33.33 && a <= 33.34)).toBe(true);
});

test('an expense in another currency counts toward a budget at its converted value @critical', async ({ page, api }) => {
  await api.call('PUT', '/auth/me', { currency: 'USD' });
  const now = new Date();
  await api.create('budgets', { category: 'groceries', monthlyLimit: 100, currency: 'USD', period: 'monthly', year: now.getFullYear(), month: now.getMonth() + 1, alertThreshold: 80 });
  // 185 shekels at the stubbed 3.7 a dollar is $50
  await api.create('transactions', expense({ amount: 185, currency: 'ILS', category: 'groceries', amountInGlobalCurrency: 50, globalCurrency: 'USD' }));
  await openApp(page, '/Expenses');
  await expect(page.getByRole('progressbar', { name: /Groceries/ })).toHaveAttribute('aria-valuenow', '50');
});

test('an Apple Pay tap in another currency is stored in it, with its value in the person’s own currency @critical', async ({ api, playwright, baseURL, testKey }) => {
  await api.call('PUT', '/auth/me', { currency: 'USD' });
  const { token } = await api.call('POST', '/ingest-tokens', { label: 'My iPhone' });
  const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 9) });
  const res = await phone.post('/api/ingest/wallet', { headers: { Authorization: `Bearer ${token}` }, data: { v: 1, merchant: 'Café de Flore', amount: '€9.20', at: new Date().toISOString() } });
  expect(res.status()).toBe(201);
  await phone.dispose();
  const [row] = await api.list('transactions');
  expect([row.amount, row.currency]).toEqual([9.2, 'EUR']);
  // At the stubbed 0.92 euros a dollar
  expect(row.amountInGlobalCurrency).toBeCloseTo(10, 1);
});

test('an email typed with capitals and spaces signs into the same account @critical', async ({ playwright, baseURL, testKey, owner }) => {
  const visitor = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 3) });
  const res = await visitor.post('/api/auth/login', { data: { email: `  ${owner.email.toUpperCase()} `, password: owner.password } });
  expect(res.status()).toBe(200);
  await visitor.dispose();
});

test('a name in any script up to 100 characters is kept; longer is refused; the email cannot be changed this way @critical', async ({ page, api, owner }) => {
  const me = async () => (await (await page.request.get('/api/auth/me')).json()).data;
  const name = 'דנה Дана 🌿 '.padEnd(100, 'א');
  expect((await api.send('PUT', '/auth/me', { full_name: name })).status()).toBe(200);
  expect((await me()).full_name).toBe(name.trim());
  expect((await api.send('PUT', '/auth/me', { full_name: 'א'.repeat(101) })).status()).toBe(400);

  await api.send('PUT', '/auth/me', { email: 'someone-else@e2e.test', full_name: 'Dana' });
  expect((await me()).email).toBe(owner.email);
});

test('a household holds up to 20 members; inviting a 21st is refused with why @critical', async ({ owner, api }) => {
  // The owner and 19 more
  for (let i = 0; i < 19; i += 1) await seedMember(owner.workspaceId, { role: 'viewer', name: `Member ${i}` });
  const res = await api.send('POST', `/workspaces?id=${owner.workspaceId}&action=invite`, { email: 'twentyfirst@e2e.test', role: 'viewer' });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/up to 20 members/);
  expect(L('wsInviteMember')).toBeTruthy();
});
