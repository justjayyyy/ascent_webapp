// One household's data is only ever its own: no reaching into another's, no changes from other sites.
import { test, expect } from '../../fixtures.js';
import { apiFor } from '../../support/api.js';
import { seedUser } from '../../support/control.js';
import { expense } from '../../support/factories.js';

const ENTITIES = ['transactions', 'budgets', 'categories', 'cards', 'goals', 'notes', 'plans', 'commitments', 'groceries', 'tasks'];

test('a change sent with the session cookie from another site is refused @critical', async ({ page, owner, api }) => {
  const res = await page.request.post('/api/entities/transactions', {
    data: expense({ description: 'Forged' }),
    headers: { 'x-workspace-id': owner.workspaceId, Origin: 'https://evil.example' },
  });
  expect(res.status()).toBe(403);
  expect(await api.list('transactions')).toEqual([]);
});

test('someone from another household cannot read this one, even naming it @critical', async ({ owner, api, openDevice }) => {
  await api.create('transactions', expense({ description: 'Private' }));
  const stranger = await seedUser({ name: 'Eve Stranger' });
  const strangerPage = await openDevice(stranger, { token: stranger.token });
  const asStranger = apiFor(strangerPage.request, owner.workspaceId);

  for (const entity of ENTITIES) {
    const res = await asStranger.send('GET', `/entities/${entity}`);
    // Refused (a 4xx, never a list): nothing of this household comes back
    expect(res.status(), `${entity} of another household`).toBeGreaterThanOrEqual(400);
    expect(res.status(), `${entity} of another household`).toBeLessThan(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  }
});

test('someone from another household cannot change or delete a row by its id @critical', async ({ api, openDevice }) => {
  const row = await api.create('transactions', expense({ description: 'Mine', amount: 50 }));
  const stranger = await seedUser({ name: 'Eve Stranger' });
  const strangerPage = await openDevice(stranger, { token: stranger.token });
  // In the stranger's own household, aiming at this household's row
  const asStranger = apiFor(strangerPage.request, stranger.workspaceId);

  expect((await asStranger.send('PUT', `/entities/transactions?id=${row.id}`, { amount: 1 })).status()).toBe(404);
  expect((await asStranger.send('DELETE', `/entities/transactions?id=${row.id}`)).status()).toBe(404);
  expect((await api.list('transactions')).map((t) => [t.description, t.amount])).toEqual([['Mine', 50]]);
});

test('without a session every list is refused @critical', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  for (const entity of ENTITIES) {
    expect((await anonymous.get(`/api/entities/${entity}`)).status(), entity).toBe(401);
  }
  await anonymous.dispose();
});
