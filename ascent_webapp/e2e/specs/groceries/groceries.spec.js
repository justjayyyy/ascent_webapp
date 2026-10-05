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

// A real image (1×1 PNG): the app draws the photo onto a canvas before sending it, so it has to decode
const RECEIPT_PHOTO = { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };

test('after a shop, a receipt photo is read and saved as the expense, and prices are kept for next time @critical', async ({ page, owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grStartShopping') }).click();
  const shopping = page.getByRole('dialog', { name: L('grShopping') });
  await shopping.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await shopping.getByRole('button', { name: L('grDoneShopping', { n: 1 }) }).click();

  const finish = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: L('grShopDone') }) });
  await finish.locator('input[type=file]').setInputFiles(RECEIPT_PHOTO);
  // What the assistant read (stubbed: Rami Levy, 87.40, the milk at 6.90)
  await expect(finish.getByText('Rami Levy')).toBeVisible();
  await expect(finish.getByText('87.40').or(finish.getByText('87.4'))).toBeVisible();
  await finish.getByRole('button', { name: L('grSaveExpense') }).click();
  await expect(page.getByLabel(new RegExp(`^${L('amount')}`))).toHaveValue('87.4');
  await page.getByRole('button', { name: L('addTransaction'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.amount, t.description])).toEqual([[87.4, 'Rami Levy']]);
  await expect.poll(async () => (await api.list('groceries'))[0].purchases?.at(-1)?.price).toBe(6.9);
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

test('adding something already on the list does not add it twice @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  const add = page.getByRole('textbox', { name: L('grAddLabel') }).first();
  await add.fill('milk');
  await add.press('Enter');
  await add.fill('MILK, bread');
  await add.press('Enter');
  await expect.poll(() => onList(api)).toEqual([['bread', ''], ['milk', '']]);
  expect((await api.list('groceries')).filter((i) => i.name.toLowerCase() === 'milk')).toHaveLength(1);
});

test('shopping together: what one puts in the cart shows on the other’s phone, by name @critical @multiuser', async ({ page, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  for (const name of ['Milk', 'Eggs']) await api.create('groceries', { name, onList: true, listedAt: new Date().toISOString() });
  const shop = async (p) => {
    await openApp(p, '/Groceries');
    await p.getByRole('button', { name: L('grStartShopping') }).click();
    return p.getByRole('dialog', { name: L('grShopping') });
  };
  const mine = await shop(page);
  const samsCart = await shop(sam.page);

  await samsCart.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: L('grPartnerGot', { name: 'Sam Partner', item: 'Milk' }) })).toBeVisible({ timeout: 15_000 });
  await expect(mine.getByRole('checkbox', { name: 'Milk', exact: true })).toBeChecked();
  await expect(mine.getByRole('checkbox', { name: 'Eggs', exact: true })).not.toBeChecked();
});

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const bought = (id, n, store, price) => ({ id, date: daysAgo(n), store, price, currency: 'USD', qty: '' });

test('prices across shops: the cheaper shop is named, and the list is costed @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString(), purchases: [
    bought('a', 20, 'Shufersal', 7.9), bought('b', 13, 'Rami Levy', 6.5), bought('c', 6, 'Shufersal', 7.9), bought('d', 2, 'Rami Levy', 6.5),
  ] });
  await openApp(page, '/Groceries');
  await page.getByRole('tab', { name: L('grViewPrices') }).click();
  await expect(page.getByText(L('grListWillCost'))).toBeVisible();
  await expect(page.getByText(L('grCheapestAt', { store: 'Rami Levy' })).first()).toBeVisible();
});

test('something bought every week says how long it usually lasts and when it runs out @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Coffee', onList: false, purchases: [bought('a', 15, 'Shufersal', 30), bought('b', 8, 'Shufersal', 30), bought('c', 1, 'Shufersal', 30)] });
  await openApp(page, '/Groceries');
  await page.getByRole('tab', { name: L('grViewCheck') }).click();
  await expect(page.getByText(new RegExp(L('grDaysLeft', { n: '\\d+' }).replace('~', '~?'))).first()).toBeVisible();
});

test('the kitchen check: going through what is usually bought, "have it" for each, ends checked @critical', async ({ page, api }) => {
  for (const name of ['Rice', 'Olive oil']) {
    await api.create('groceries', { name, onList: false, purchases: [bought('a', 30, 'Shufersal', 10), bought('b', 15, 'Shufersal', 10)] });
  }
  await openApp(page, '/Groceries');
  await page.getByRole('tab', { name: L('grViewCheck') }).click();
  await expect(async () => {
    await page.getByRole('button', { name: L('grHaveIt'), exact: true }).first().click({ timeout: 1000 });
    await expect(page.getByText(L('grKitchenChecked'))).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
});

test('with the assistant off, the receipt step says an owner can turn it on @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grStartShopping') }).click();
  const shopping = page.getByRole('dialog', { name: L('grShopping') });
  await shopping.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await shopping.getByRole('button', { name: L('grDoneShopping', { n: 1 }) }).click();
  await expect(page.getByText(L('grScanNeedsAssistant'))).toBeVisible();
});

test('on the Wall, things tapped one after another stay put while tapping, then are bought together with one undo @critical', async ({ page, api }) => {
  for (const name of ['Milk', 'Eggs', 'Bread']) await api.create('groceries', { name, onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  const tile = (name) => page.getByRole('button', { name: new RegExp(`^${name}[,.]`) });
  await tile('Milk').click();
  await tile('Eggs').click();
  // Ticked where they are, so the next tap lands on whatever is under the finger
  await expect(tile('Milk')).toHaveAttribute('aria-pressed', 'true');
  await expect(tile('Bread')).toHaveAttribute('aria-pressed', 'false');

  const toast = page.locator('[data-sonner-toast]').filter({ hasText: L('grBoughtMany', { n: 2 }) });
  await expect(toast).toBeVisible();
  await expect.poll(() => onList(api)).toEqual([['bread', '']]);
  await toast.getByRole('button', { name: L('ntUndo') }).click();
  await expect.poll(() => onList(api)).toEqual([['bread', ''], ['eggs', ''], ['milk', '']]);
});

test('an item’s details are saved as they are changed, with nothing to confirm @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: /^Milk[,.]/ }).click({ button: 'right' });
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: L('grQty') }).fill('3');
  await sheet.getByRole('button', { name: L('grAisle_pantry'), exact: true }).click();

  await expect.poll(async () => (await api.list('groceries')).map((i) => [i.qty, i.aisle])).toEqual([['3', 'pantry']]);
  await expect(sheet).toBeVisible();
});
