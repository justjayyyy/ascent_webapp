// Limits the server holds (P2: ING-N06, AI-N05, AI-E02, NT-N06, NT-E04, CAT-E01, BUD-E01, SV-E02): how often a
// device or a person may call, how big a receipt photo may be, reminder times, note sizes, category names, a budget
// for one month only, and a goal in another currency.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { identityHeaders } from '../../support/network.js';

test('one device key may report 60 purchases in 10 minutes; the 61st waits @critical', async ({ api, playwright, baseURL, testKey }) => {
  test.slow();
  const { token } = await api.call('POST', '/ingest-tokens', { label: 'My iPhone' });
  const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 9) });
  const send = (i) => phone.post('/api/ingest/wallet', { headers: { Authorization: `Bearer ${token}` }, data: { v: 1, merchant: `Shop ${i}`, amount: `$${i + 1}`, at: new Date(Date.now() - i * 1000).toISOString() } });
  for (let i = 0; i < 60; i += 1) expect((await send(i)).status(), `purchase ${i + 1}`).toBeLessThan(300);
  const late = await send(60);
  expect(late.status()).toBe(429);
  expect(late.headers()['retry-after']).toBe('600');
  await phone.dispose();
  expect(await api.list('transactions')).toHaveLength(60);
});

test('the assistant takes 40 questions an hour from one person, then asks them to wait @critical', async ({ owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  for (let i = 0; i < 40; i += 1) {
    expect((await api.send('POST', '/assist?action=ask', { question: `question ${i}` })).status(), `question ${i + 1}`).toBe(200);
  }
  const res = await api.send('POST', '/assist?action=ask', { question: 'one more' });
  expect(res.status()).toBe(429);
});

test('a receipt photo too big, or not a photo, is refused before it reaches the assistant @critical', async ({ owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  const big = await api.send('POST', '/assist?action=receipt', { image: 'A'.repeat(6 * 1024 * 1024), mediaType: 'image/jpeg' });
  expect([400, 413]).toContain(big.status());
  const notImage = await api.send('POST', '/assist?action=receipt', { image: '<svg onload=alert(1)>', mediaType: 'image/svg+xml' });
  expect(notImage.status()).toBe(400);
  expect((await notImage.json()).error).toBe('image_required');
});

test('a note refuses a reminder time that is not a time, and keeps very long text within its limits @critical', async ({ api }) => {
  const note = await api.create('notes', { type: 'text', title: 'Plan', content: 'x', isShared: false });
  const bad = await api.send('PUT', `/entities/notes?id=${note.id}`, { reminder: 'next tuesday-ish' });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('Invalid reminder time');

  const long = await api.send('PUT', `/entities/notes?id=${note.id}`, { content: 'y'.repeat(150_000), tags: Array.from({ length: 40 }, (_, i) => `tag${i}`) });
  expect(long.status()).toBe(200);
  const [saved] = await api.list('notes');
  expect(saved.content.length).toBeLessThanOrEqual(100_000);
  expect(saved.tags.length).toBeLessThanOrEqual(30);
});

test('category names of one character, one hundred, only an emoji, or in Hebrew are kept as typed @critical', async ({ api }) => {
  for (const name of ['A', 'ק'.repeat(100), '🐶', 'חיות מחמד']) {
    const res = await api.send('POST', '/entities/categories', { name, type: 'Expense' });
    expect(res.status(), name).toBe(201);
  }
  const names = (await api.list('categories')).map((c) => c.name);
  for (const name of ['A', 'ק'.repeat(100), '🐶', 'חיות מחמד']) expect(names).toContain(name);
});

test('a budget set for one month counts only that month @critical', async ({ page, api }) => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  await api.create('budgets', { category: 'groceries', monthlyLimit: 500, currency: 'USD', period: 'monthly', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, alertThreshold: 80 });
  await api.create('transactions', expense({ amount: 200, category: 'groceries', date: day(0) }));
  await openApp(page, '/Expenses');
  // This month has no groceries budget, so nothing is measured against last month's
  await expect(page.getByRole('progressbar', { name: /Groceries/ })).toHaveCount(0);
});

test('a goal kept in another currency shows in it @critical', async ({ page, api }) => {
  await api.call('PUT', '/auth/me', { currency: 'ILS' });
  await api.create('goals', { name: 'Trip to New York', kind: 'vacation', currency: 'USD', targetAmount: 3000, entries: [{ id: 'a', date: day(-3), amount: 500 }] });
  await openApp(page, '/Savings');
  await expect(page.getByRole('button', { name: /Trip to New York/ }).first()).toContainText('$500');
});
