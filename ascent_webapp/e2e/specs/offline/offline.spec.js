// Offline: the installed app opens without a connection, takes changes, and sends them once back online.
import { test, expect } from '../../fixtures.js';
import { installOffline, openApp, serverList, serverTransactions } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';
import { PlansScreen } from '../../screens/PlansScreen.js';

test('an expense added offline reaches the server when the connection returns @critical @offline', async ({ page, context, owner: _owner }) => {
  await openApp(page, '/Expenses');
  // The service worker has the whole app before the connection goes
  await installOffline(page);

  // A new account's default categories are on the device before the connection goes
  await expect(page.getByRole('button', { name: L('foodDining') }).first()).toBeVisible();

  await context.setOffline(true);
  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 42.5, description: 'Offline coffee' });
  await expect(expenses.row('Offline coffee')).toBeVisible();

  // Still offline, the app opens again from the device with the expense waiting
  await page.reload();
  await expect(expenses.row('Offline coffee')).toBeVisible();
  expect(await serverTransactions(page).catch(() => [])).toEqual([]);

  await context.setOffline(false);
  await expect.poll(async () => (await serverTransactions(page)).map((t) => [t.description, t.amount]), { timeout: 30_000 })
    .toEqual([['Offline coffee', 42.5]]);
});

test('a plan made offline, with a cost added to it, reaches the server when the connection returns @critical @offline', async ({ page, context, owner: _owner }) => {
  await openApp(page, '/Plans');
  await installOffline(page);

  await context.setOffline(true);
  // With no plans yet, the page offers a kind of plan to start from
  const plans = new PlansScreen(page);
  await plans.createFromKind('vacation', { name: 'Offline trip' });
  await expect(page.getByText(L('offSavedOnDevice')).first()).toBeVisible();

  // The new plan opens at once; a cost added to it waits on the device with it
  await plans.addCost({ name: 'Flights', amount: 900 });
  await expect(page.getByText('Flights').first()).toBeVisible();
  expect(await serverList(page, 'plans')).toEqual([]);

  await context.setOffline(false);
  // The vacation template's costs came with it; the one added offline is among them
  await expect.poll(async () => (await serverList(page, 'plans')).map((p) => [p.name, (p.items || []).some((i) => i.name === 'Flights' && i.amount === 900)]), { timeout: 30_000 })
    .toEqual([['Offline trip', true]]);
  // Still open, now under its real id
  await expect(page.getByText('Flights').first()).toBeVisible();
  await expect(page).not.toHaveURL(/local%3A|local:/);
});
