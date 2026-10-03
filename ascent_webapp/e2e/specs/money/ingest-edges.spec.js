// Purchases that arrive with no one watching (§3.17, ING-*): forwarded bank texts, the same purchase reported twice
// or from two sources, the device limit, a member who may no longer add expenses, and requests that are not what
// the Shortcut sends. All through the API, as the phone sends them.
import { test, expect } from '../../fixtures.js';
import { identityHeaders } from '../../support/network.js';

/** A device key for `api`'s person, and a client that posts as the phone (no session, just the key) */
async function phoneFor({ api, playwright, baseURL, testKey }, label = 'My iPhone', device = 7) {
  const { token } = await api.call('POST', '/ingest-tokens', { label });
  const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, device) });
  const send = (kind, data) => phone.post(`/api/ingest/${kind}`, { headers: { Authorization: `Bearer ${token}` }, data });
  return { token, phone, send };
}

const now = () => new Date().toISOString();

test('forwarded texts: a purchase becomes a row to review; codes, refunds, declines and absurd amounts do not @critical', async ({ api, playwright, baseURL, testKey }) => {
  const { phone, send } = await phoneFor({ api, playwright, baseURL, testKey });
  const purchase = await send('sms', { v: 1, text: 'Purchase of USD 12.50 at STARBUCKS NYC with card ending 1234.', at: now() });
  expect(purchase.status(), await purchase.text()).toBe(201);

  for (const [text, reason] of [
    ['Your verification code is 482913', 'not_a_purchase'],
    ['זיכוי בסך 50 ש"ח בכרטיס 1234', 'not_a_purchase'],
    ['עסקה בסך 100 ש"ח בכרטיס 1234 נדחתה', 'declined'],
    ['Purchase of USD 2,500,000.00 at YACHTS LTD with card ending 1234.', 'amount_out_of_range'],
  ]) {
    const res = await send('sms', { v: 1, text, at: now() });
    expect(res.status(), text).toBe(422);
    expect((await res.json()).error, text).toBe(reason);
  }
  await phone.dispose();
  expect((await api.list('transactions')).map((t) => [t.source, t.status, t.amount, t.merchant])).toEqual([['sms', 'pending', 12.5, 'STARBUCKS NYC']]);
});

test('the same purchase from Apple Pay and from the bank text is one row, not two @critical', async ({ api, playwright, baseURL, testKey }) => {
  const { phone, send } = await phoneFor({ api, playwright, baseURL, testKey });
  const at = new Date();
  expect((await send('wallet', { v: 1, merchant: 'STARBUCKS NYC', amount: '$12.50', card: '1234', at: at.toISOString() })).status()).toBe(201);
  const text = await send('sms', { v: 1, text: 'Purchase of USD 12.50 at STARBUCKS NYC with card ending 1234.', at: new Date(at.getTime() + 40_000).toISOString() });
  expect(text.status(), await text.text()).toBeLessThan(300);
  await phone.dispose();

  const rows = await api.list('transactions');
  expect(rows).toHaveLength(1);
  expect(rows[0].ingest.sources.map((s) => s.source).sort()).toEqual(['sms', 'wallet']);
});

test('the Shortcut sending the same tap twice adds it once @critical', async ({ api, playwright, baseURL, testKey }) => {
  const { phone, send } = await phoneFor({ api, playwright, baseURL, testKey });
  const tap = { v: 1, merchant: 'Aroma', amount: '$18.50', card: 'Visa', at: now() };
  expect((await send('wallet', tap)).status()).toBe(201);
  const again = await send('wallet', tap);
  expect(again.status()).toBeLessThan(300);
  await phone.dispose();
  expect(await api.list('transactions')).toHaveLength(1);
});

test('five devices at most @critical', async ({ api }) => {
  for (let i = 1; i <= 5; i += 1) await api.call('POST', '/ingest-tokens', { label: `Phone ${i}` });
  const sixth = await api.send('POST', '/ingest-tokens', { label: 'Phone 6' });
  expect(sixth.status()).toBe(409);
  expect((await sixth.json()).error).toBe('token_limit');
});

test('a member who may no longer add expenses finds their device key refused at once @critical @multiuser', async ({ owner, api, member, playwright, baseURL, testKey }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const { phone, send } = await phoneFor({ api: sam.api, playwright, baseURL, testKey }, 'Sam’s iPhone', 8);
  expect((await send('wallet', { v: 1, merchant: 'Bakery', amount: '$4', at: now() })).status()).toBe(201);

  const { data } = await (await api.send('GET', `/workspaces?id=${owner.workspaceId}`)).json();
  const samRow = data.members.find((m) => m.email === sam.email);
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=updateMember&memberId=${samRow._id || samRow.id}`, { role: 'viewer' });

  const refused = await send('wallet', { v: 1, merchant: 'Bakery', amount: '$6', at: now() });
  expect(refused.status()).toBe(403);
  await phone.dispose();
  expect((await api.list('transactions')).map((t) => t.amount)).toEqual([4]);
});

test('requests that are not what the Shortcut sends are refused with a reason @critical', async ({ api, playwright, baseURL, testKey }) => {
  const { token, phone, send } = await phoneFor({ api, playwright, baseURL, testKey });
  const auth = { Authorization: `Bearer ${token}` };
  expect((await phone.get('/api/ingest/wallet', { headers: auth })).status()).toBe(405);
  const tooBig = await send('wallet', { v: 1, merchant: 'x'.repeat(9 * 1024), amount: '$1', at: now() });
  expect(tooBig.status()).toBe(413);
  expect((await tooBig.json()).error).toBe('payload_too_large');
  const broken = await phone.post('/api/ingest/wallet', { headers: { ...auth, 'content-type': 'application/json' }, data: '{"v": 1, "merch' });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toBe('invalid_json');
  expect((await send('fax', { v: 1, text: 'hello' })).status()).toBe(404);
  await phone.dispose();
  expect(await api.list('transactions')).toEqual([]);
});
