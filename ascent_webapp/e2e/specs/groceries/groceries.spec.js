// Groceries: the shared list, adding several things at once, and a shopping trip.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

const onList = async (api) => (await api.list('groceries')).filter((i) => i.onList).map((i) => [i.name.toLowerCase(), i.qty || '']).sort();

test('an empty list offers the basics: tapping one puts it on the list @critical', async ({ page, api }) => {
  await openApp(page, '/Groceries');
  const [milk] = L('grStarters').split(', ');
  await page.getByRole('button', { name: milk, exact: true }).click();

  await expect.poll(() => onList(api)).toEqual([['milk', '']]);
  // The list is no longer empty, so it shows the list instead of the basics
  await expect(page.getByRole('button', { name: L('grMarkBought', { name: milk }) }).or(page.getByText(milk, { exact: true })).first()).toBeVisible();
});

test('typing several things at once adds each, with its quantity @critical', async ({ page, api }) => {
  await openApp(page, '/Groceries');
  const add = page.getByRole('textbox', { name: L('grAddLabel') }).first();
  await add.fill('milk, 2 eggs, bread');
  await add.press('Enter');

  await expect.poll(() => onList(api)).toEqual([['bread', ''], ['eggs', '2'], ['milk', '']]);
});

test('a shopping trip: pick the shop, tick what goes in the cart, finish @smoke @critical', async ({ page, api }) => {
  for (const name of ['Milk', 'Eggs', 'Coffee']) {
    await api.create('groceries', { name, onList: true, listedAt: new Date().toISOString() });
  }
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grStartShopping') }).click();
  const shopping = page.getByRole('dialog', { name: L('grShopping') });

  // No shop seen before, so it is typed in
  await shopping.getByRole('button', { name: L('grWhichShop') }).click();
  const shop = shopping.getByRole('textbox', { name: L('grStoreName') });
  await shop.fill('Rami Levy');
  await shop.press('Enter');

  for (const name of ['Milk', 'Eggs', 'Coffee']) await shopping.getByRole('checkbox', { name, exact: true }).click();
  await shopping.getByRole('button', { name: L('grDoneShopping', { n: 3 }) }).click();
  await expect(page.getByRole('heading', { name: L('grShopDone') })).toBeVisible();
  await page.getByRole('button', { name: L('grSkip') }).or(page.getByRole('button', { name: L('grDone'), exact: true })).first().click();

  await expect.poll(async () => (await api.list('groceries')).map((i) => [i.name, i.onList, i.purchases?.at(-1)?.store]).sort())
    .toEqual([['Coffee', false, 'Rami Levy'], ['Eggs', false, 'Rami Levy'], ['Milk', false, 'Rami Levy']]);
});
