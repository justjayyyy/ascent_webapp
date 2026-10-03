// The weekly check-in (CHK-H02, H03): a payment that may have been charged twice is shown next to the one already
// recorded, and either the copy goes or both stay; with nothing to look at, it goes straight to the week.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

/** A confirmed payment and an automatic copy of it, flagged as a possible duplicate (as Apple Pay ingest does) */
async function chargedTwice(api) {
  const original = await api.create('transactions', expense({ description: 'Aroma Espresso Bar', amount: 18.5, date: day(-1) }));
  const copy = await api.create('transactions', expense({
    description: 'AROMA TLV', amount: 18.5, date: day(-1), status: 'pending', source: 'wallet',
    ingest: { flags: ['possibleDuplicate'], duplicateOf: original.id },
  }));
  return { original, copy };
}

async function startCheckin(page) {
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('ciToLookAt', { n: 1 }))).toBeVisible();
  await page.getByRole('button', { name: L('ciStart') }).click();
  const sheet = page.getByRole('dialog', { name: L('ciTitle') }).or(page.getByRole('dialog')).first();
  await expect(sheet.getByText(L('ciReason_duplicate'))).toBeVisible();
  await expect(sheet.getByText(L('ciDuplicateHint'))).toBeVisible();
  return sheet;
}

test('a payment charged twice: deleting the copy leaves the one already recorded @critical', async ({ page, api }) => {
  const { original } = await chargedTwice(api);
  const sheet = await startCheckin(page);
  await sheet.getByRole('button', { name: L('ciDeleteCopy') }).click();
  await expect.poll(async () => (await api.list('transactions')).map((t) => t.id)).toEqual([original.id]);
});

test('a payment charged twice for real: keeping both keeps both, confirmed @critical', async ({ page, api }) => {
  const { copy } = await chargedTwice(api);
  const sheet = await startCheckin(page);
  await sheet.getByRole('button', { name: L('ciKeepBoth') }).click();
  await expect.poll(async () => (await api.list('transactions')).find((t) => t.id === copy.id)?.status).toBe('confirmed');
  expect(await api.list('transactions')).toHaveLength(2);
});

test('with nothing to look at, the check-in goes straight to the week in numbers @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Groceries', amount: 80, date: day(-2), category: 'groceries' }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('ciCardWeek'))).toBeVisible();
  await page.getByRole('button', { name: L('ciStart') }).click();
  await expect(page.getByText(L('ciYourWeek'))).toBeVisible();
  await expect(page.getByText(L('ciReason_duplicate'))).toHaveCount(0);
});
