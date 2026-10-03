// Journey: a week of Apple Pay taps, one of them already entered by hand, sorted out in the weekly check-in.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { identityHeaders } from '../../support/network.js';

test('Apple Pay week: taps arrive to review, the check-in keeps the real ones and drops the copy @critical @smoke', async ({ page, api, playwright, baseURL, testKey }) => {
  // A whole story in one test: long by design, so it gets three times the usual time
  test.slow();
  await test.step('one purchase entered by hand, then three taps from the phone (one of them the same purchase)', async () => {
    await api.create('transactions', expense({ description: 'Super-Pharm', amount: 64.9 }));
    const { token } = await api.call('POST', '/ingest-tokens', { label: 'My iPhone' });
    const phone = await playwright.request.newContext({ baseURL, extraHTTPHeaders: identityHeaders(testKey, 7) });
    for (const [merchant, amount] of [['Aroma Espresso Bar', '$18.50'], ['Paz Yellow', '$250.00'], ['Super-Pharm', '$64.90']]) {
      const res = await phone.post('/api/ingest/wallet', {
        headers: { Authorization: `Bearer ${token}` },
        data: { v: 1, merchant, amount, card: 'Visa', at: new Date().toISOString() },
      });
      expect(res.status(), await res.text()).toBeLessThan(300);
    }
    await phone.dispose();
  });

  await test.step('the Dashboard asks for a look at the three taps', async () => {
    await openApp(page, '/Dashboard');
    await expect(page.getByText(L('ciToLookAt', { n: 3 }))).toBeVisible();
    await page.getByRole('button', { name: L('ciStart') }).click();
  });

  await test.step('each tap: keep it, or delete it when it is a copy of what was entered by hand', async () => {
    const sheet = page.getByRole('dialog');
    const finished = sheet.getByText(L('ciHandled', { n: 3 }));
    const merchants = sheet.getByText(/^(Aroma Espresso Bar|Paz Yellow|Super-Pharm)$/);
    for (let step = 0; step < 3; step += 1) {
      const deleteCopy = sheet.getByRole('button', { name: L('ciDeleteCopy') });
      const looksRight = sheet.getByRole('button', { name: L('ciLooksRight') });
      await expect(sheet.getByText(L('ciProgress', { n: step + 1, total: 3 }))).toBeVisible();
      await expect(merchants).toHaveCount(1);
      const merchant = await merchants.textContent();
      if (await deleteCopy.isVisible()) {
        await expect(sheet.getByText(L('ciDuplicateHint'))).toBeVisible();
        await deleteCopy.click();
      } else {
        await looksRight.click();
      }
      // The counter moves on at once, but the card slides out before the next one comes in
      await expect(sheet.getByText(merchant, { exact: true })).toHaveCount(0);
    }
    await expect(finished).toBeVisible();
  });

  await test.step('what is left: the hand-entered purchase and the two real taps, nothing waiting for review', async () => {
    await expect.poll(async () => (await api.list('transactions')).map((t) => [t.description || t.merchant, t.amount, t.status || 'confirmed']).sort())
      .toEqual([['Aroma Espresso Bar', 18.5, 'confirmed'], ['Paz Yellow', 250, 'confirmed'], ['Super-Pharm', 64.9, 'confirmed']]);
  });
});
