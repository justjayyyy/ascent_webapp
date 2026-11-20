// Groceries: the shared list, adding several things at once, prices, the kitchen check and receipts.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { day, expense } from '../../support/factories.js';

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

test('a scanned receipt is saved as the expense when asked to, and the price of one is kept for next time @critical', async ({ page, owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grScanAReceipt') }).first().click();
  const dialog = page.getByRole('dialog', { name: L('grFromReceiptTitle') });
  await dialog.getByLabel(L('grChooseReceipt')).setInputFiles(RECEIPT_PHOTO);
  // What the assistant read (stubbed: Rami Levy, 87.40, two cartons of milk at 6.90)
  await expect(dialog.getByText('Rami Levy')).toBeVisible();
  await expect(dialog.getByText('$13.80')).toBeVisible();
  await dialog.getByRole('button', { name: L('grAddFromReceipt', { n: 1 }) }).click();
  // Nothing in Expenses for it yet, so it asks
  await expect(dialog.getByText(L('grExpenseQ'))).toBeVisible();
  await dialog.getByRole('button', { name: L('grExpenseYes') }).click();
  await expect(page.getByLabel(new RegExp(`^${L('amount')}`))).toHaveValue('87.4');
  await page.getByRole('button', { name: L('addTransaction'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.amount, t.description])).toEqual([[87.4, 'Rami Levy']]);
  // The price of one carton, and how many were bought
  await expect.poll(async () => { const p = (await api.list('groceries'))[0].purchases?.at(-1); return [p?.price, p?.qty]; }).toEqual([6.9, '2']);
});

test('a receipt whose payment Apple Pay already added says so, and no adds no second expense @critical', async ({ page, owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  await api.create('transactions', expense({ amount: 87.4, description: 'RAMI LEVY 123', category: 'groceries' }));
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grScanAReceipt') }).first().click();
  const dialog = page.getByRole('dialog', { name: L('grFromReceiptTitle') });
  await dialog.getByLabel(L('grChooseReceipt')).setInputFiles(RECEIPT_PHOTO);
  await dialog.getByRole('button', { name: L('grAddFromReceipt', { n: 1 }) }).click();
  await expect(dialog.getByText(/RAMI LEVY 123/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: L('grExpenseAddAnyway') })).toBeVisible();
  await dialog.getByRole('button', { name: L('grExpenseNo'), exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(new RegExp(`^${L('amount')}`))).toHaveCount(0);
  expect((await api.list('transactions')).map((t) => t.description)).toEqual(['RAMI LEVY 123']);
  // The receipt is kept with its lines
  await expect.poll(async () => (await api.list('receipts'))[0]?.items).toEqual([{ text: 'Milk 3%', qty: 2, unit: null, unitPrice: 6.9, price: 13.8 }]);
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

test('the kitchen check: one of you goes through the kitchen and finishes it, and it is done for both @critical @multiuser', async ({ page, owner, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  for (const name of ['Rice', 'Olive oil']) {
    await api.create('groceries', { name, onList: false, purchases: [bought('a', 30, 'Shufersal', 10), bought('b', 15, 'Shufersal', 10)] });
  }
  await openApp(page, '/Groceries?view=check');
  await page.getByRole('radio', { name: L('grRemindWeek') }).click();
  await page.getByRole('group', { name: L('grHowMuchLeftOf', { name: 'Rice' }) }).getByRole('button', { name: L('grLevelOut') }).click();
  await page.getByRole('group', { name: L('grHowMuchLeftOf', { name: 'Olive oil' }) }).getByRole('button', { name: L('grLevelFull') }).click();
  await expect(page.getByText(L('grCheckProgress', { n: 2, total: 2 }))).toBeVisible();
  await page.getByRole('button', { name: new RegExp(L('grFinishCheck')) }).click();
  await expect(page.getByRole('heading', { name: L('grKitchenChecked') })).toBeVisible();

  await expect.poll(async () => (await api.list('groceries')).map((i) => [i.name, i.level]).sort()).toEqual([['Olive oil', 'full'], ['Rice', 'out']]);
  // The other one sees it done, by whom, with the reminder they share
  await openApp(sam.page, '/Groceries?view=check');
  await expect(sam.page.getByRole('region', { name: L('grKitchenCheck') }).getByText(new RegExp(owner.name))).toBeVisible();
  await expect(sam.page.getByRole('radio', { name: L('grRemindWeek') })).toBeChecked();
  // What was out is running low on the Wall
  await sam.page.getByRole('tab', { name: L('grViewWall') }).click();
  await expect(sam.page.getByRole('region', { name: new RegExp(L('grRunningLowShort')) }).getByRole('button', { name: /^Rice[,.]/ })).toBeVisible();
});

test('running low: something marked full is not on it, and something taken off the list goes back home @critical', async ({ page, api }) => {
  // Pita is bought every two days and was just marked full; hummus is out by the estimate and on the list
  await api.create('groceries', { name: 'Pita', onList: false, level: 'full', levelAt: new Date().toISOString(), purchases: [bought('a', 4, 'Shufersal', 8), bought('b', 2, 'Shufersal', 8)] });
  await api.create('groceries', { name: 'Hummus', onList: true, listedAt: new Date().toISOString(), purchases: [bought('a', 30, 'Shufersal', 11), bought('b', 20, 'Shufersal', 11)] });
  await openApp(page, '/Groceries');
  const home = page.getByRole('region', { name: new RegExp(L('grAtHome')) });
  await expect(home.getByRole('button', { name: /^Pita[,.]/ })).toBeVisible();
  await expect(page.getByRole('region', { name: new RegExp(L('grRunningLowShort')) })).toHaveCount(0);

  await page.getByRole('button', { name: /^Hummus[,.]/ }).click({ button: 'right' });
  await page.getByRole('dialog').getByRole('button', { name: L('grTakeOffList') }).click();
  await expect(home.getByRole('button', { name: /^Hummus[,.]/ })).toBeVisible();
  await expect(page.getByRole('region', { name: new RegExp(L('grRunningLowShort')) })).toHaveCount(0);
});

test('an older receipt read again counts each line, and the price of one goes onto the item @critical', async ({ page, owner, api }) => {
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  // Two cartons of milk bought today, priced at the whole line (13.80) by an older read
  await api.create('groceries', { name: 'Milk', onList: false, purchases: [{ id: 'm1', date: day(0), qty: '2', price: 13.8, currency: 'USD', store: 'Rami Levy' }] });
  await api.create('receipts', { type: 'image/png', data: RECEIPT_PHOTO.buffer.toString('base64'), store: 'Rami Levy', date: day(0), total: 87.4, currency: 'USD', read: true });
  await openApp(page, '/Groceries?view=prices');
  await page.getByRole('button', { name: L('grPricesFromOld', { n: 1 }) }).click();
  await page.getByRole('button', { name: L('rcptReadAllAgain') }).click();

  await expect.poll(async () => (await api.list('groceries'))[0].purchases[0].price).toBe(6.9);
  expect((await api.list('receipts'))[0].items).toEqual([{ text: 'Milk 3%', qty: 2, unit: null, unitPrice: 6.9, price: 13.8 }]);
  await expect(page.getByRole('button', { name: L('rcptReadAllAgain') })).toHaveCount(0);
});

test('with the assistant off, Scan a receipt says an owner can turn it on @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grScanAReceipt') }).first().click();
  const dialog = page.getByRole('dialog', { name: L('grFromReceiptTitle') });
  await expect(dialog.getByText(L('grScanNeedsAssistant'))).toBeVisible();
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

test('things from other shops go on the Other side by shop, and leave the list once bought @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  const add = page.getByRole('textbox', { name: L('grAddLabel') }).first();
  await add.fill('acamol, drill bits');
  await add.press('Enter');
  // Typed on the Groceries side, they go to Other, and it says so
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: L('grAddedToOther', { name: 'acamol, drill bits' }) });
  await toast.getByRole('button', { name: L('grShow') }).click();
  await expect(page.getByRole('radio', { name: new RegExp(L('grSideOther')) })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: new RegExp(L('grShop_pharmacy')) }).getByRole('button', { name: /^acamol[,.]/ })).toBeVisible();
  await expect(page.getByRole('region', { name: new RegExp(L('grShop_hardware')) }).getByRole('button', { name: /^drill bits[,.]/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Milk[,.]/ })).toHaveCount(0);

  // A name that says nothing goes to the side it was typed on
  await add.fill('gift wrap');
  await add.press('Enter');
  await expect(page.getByRole('region', { name: new RegExp(L('grShop_other')) }).getByRole('button', { name: /^gift wrap[,.]/ })).toBeVisible();

  // Bought: off the list, kept under Bought before here, and not at home with the groceries
  await page.getByRole('button', { name: /^acamol[,.]/ }).click();
  await expect.poll(async () => (await api.list('groceries')).find((i) => i.name === 'acamol')?.onList).toBe(false);
  await expect(page.getByRole('region', { name: new RegExp(L('grBoughtBefore')) }).getByRole('button', { name: /^acamol[,.]/ })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(L('grSideGroceries')) }).click();
  await expect(page.getByRole('button', { name: /^Milk[,.]/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^acamol[,.]/ })).toHaveCount(0);
  expect((await api.list('groceries')).map((i) => [i.name, i.shop]).sort()).toEqual([['Milk', ''], ['acamol', 'pharmacy'], ['drill bits', 'hardware'], ['gift wrap', 'other']]);
});

test('an item moved to another shop in its details moves to the Other side @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Hooks', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: /^Hooks[,.]/ }).click({ button: 'right' });
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: L('grShop_hardware') }).click();
  await expect.poll(async () => (await api.list('groceries'))[0].shop).toBe('hardware');
  // Bought elsewhere, so how much is left and the aisle are not asked
  await expect(sheet.getByRole('group', { name: L('grHowMuchLeft') })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('radio', { name: new RegExp(L('grSideOther')) }).click();
  await expect(page.getByRole('region', { name: new RegExp(L('grShop_hardware')) }).getByRole('button', { name: /^Hooks[,.]/ })).toBeVisible();
});

test('how much to buy, in units or kilos, set in an item’s details and taken along onto the list @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Tomatoes', onList: true, listedAt: new Date().toISOString() });
  await api.create('groceries', { name: 'Eggs', onList: false, purchases: [bought('a', 3, 'Shufersal', 12)] });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: /^Tomatoes[,.]/ }).click({ button: 'right' });
  let sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: L('grUnitKg') }).click();
  await sheet.getByRole('button', { name: L('grMore') }).click();
  await expect.poll(async () => (await api.list('groceries')).find((i) => i.name === 'Tomatoes').qty).toBe('1.5 kg');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: new RegExp(`^Tomatoes, 1\\.5 ${L('grUnitKg')}`) })).toBeVisible();

  // Not on the list yet: the amount set goes onto it with Put on the list
  await page.getByRole('button', { name: /^Eggs[,.]/ }).click({ button: 'right' });
  sheet = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: L('grMore') }).click();
  await expect(sheet.getByRole('textbox', { name: L('grQty') })).toHaveValue('3');
  await sheet.getByRole('button', { name: L('grPutOnList') }).click();
  await expect.poll(async () => { const eggs = (await api.list('groceries')).find((i) => i.name === 'Eggs'); return [eggs.onList, eggs.qty]; }).toEqual([true, '3']);
});

test('in the kitchen check, the rows stay where they are while levels are set @critical', async ({ page, api }) => {
  const at = new Date().toISOString();
  for (const [name, level] of [['Rice', 'out'], ['Olive oil', 'half'], ['Salt', 'full']]) {
    await api.create('groceries', { name, onList: false, level, levelAt: at, purchases: [bought('a', 40, 'Shufersal', 10), bought('b', 20, 'Shufersal', 10)] });
  }
  await openApp(page, '/Groceries?view=check');
  const order = () => page.getByRole('group', { name: new RegExp(L('grHowMuchLeftOf', { name: '.+' })) }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  await expect(page.getByRole('group', { name: L('grHowMuchLeftOf', { name: 'Salt' }) })).toBeVisible();
  const before = await order();
  expect(before[0]).toContain('Rice');
  // Rice was the emptiest; said to be full now, it stays first instead of jumping to the end
  await page.getByRole('group', { name: L('grHowMuchLeftOf', { name: 'Rice' }) }).getByRole('button', { name: L('grLevelFull') }).click();
  await expect.poll(async () => (await api.list('groceries')).find((i) => i.name === 'Rice').level).toBe('full');
  await page.getByRole('group', { name: L('grHowMuchLeftOf', { name: 'Olive oil' }) }).getByRole('button', { name: L('grLevelOut') }).click();
  await expect.poll(async () => (await api.list('groceries')).find((i) => i.name === 'Olive oil').level).toBe('out');
  expect(await order()).toEqual(before);
});
