// Changes made offline wait on the device and go out in order when the connection is back (src/lib/offline):
// edits and deletes as well as adds, a row someone else removed meanwhile, a change the server refuses, a
// connection that keeps dropping, and the household lists.
import { test, expect } from '../../fixtures.js';
import { installOffline, openApp, serverTransactions } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

const amounts = async (page) => (await serverTransactions(page)).map((t) => [t.description, t.amount]).sort();
const pill = (page, key, count) => page.getByRole('button', { name: L(key, { count }) });
// Waiting, however many changes that is (ticking a task is two: the task and its history)
const waiting = (page) => page.getByRole('button', { name: new RegExp(L('offOfflineWaiting', { count: '\\d+' })) });

test('an expense edited and another deleted offline are both applied when the connection returns @critical @offline', async ({ page, context, api }) => {
  await api.create('transactions', expense({ description: 'Taxi home', amount: 30 }));
  await api.create('transactions', expense({ description: 'Wrong entry', amount: 99 }));
  await openApp(page, '/Expenses');
  await installOffline(page);
  const expenses = new ExpensesScreen(page);
  await expect(expenses.row('Wrong entry')).toBeVisible();

  await context.setOffline(true);
  await expenses.edit('Taxi home', { amount: 45 });
  await expenses.delete('Wrong entry');
  await expect(pill(page, 'offOfflineWaiting', 2)).toBeVisible();
  // Reopened still offline, the device shows its own changes
  await page.reload();
  await expect(page.getByRole('button', { name: /Taxi home/ }).first()).toContainText('45');
  await expect(page.getByRole('button', { name: /Wrong entry/ })).toHaveCount(0);

  await context.setOffline(false);
  await expect.poll(() => amounts(page), { timeout: 30_000 }).toEqual([['Taxi home', 45]]);
  await expect(pill(page, 'offOfflineWaiting', 2)).toBeHidden();
});

test('an edit made offline to a row someone else deleted meanwhile is dropped quietly, not stuck @critical @offline @multiuser', async ({ page, context, api }) => {
  const row = await api.create('transactions', expense({ description: 'Shared dinner', amount: 80 }));
  await openApp(page, '/Expenses');
  await installOffline(page);
  const expenses = new ExpensesScreen(page);
  await expect(expenses.row('Shared dinner')).toBeVisible();

  await context.setOffline(true);
  await expenses.edit('Shared dinner', { amount: 85 });
  await expect(pill(page, 'offOfflineWaiting', 1)).toBeVisible();
  // Meanwhile, on another phone
  await api.remove('transactions', row.id);

  await context.setOffline(false);
  await expect(pill(page, 'offOfflineWaiting', 1)).toBeHidden({ timeout: 30_000 });
  await expect(pill(page, 'offFailed', 1)).toHaveCount(0);
  expect(await amounts(page)).toEqual([]);
  // Nor does it come back
  await page.reload();
  await expect(page.getByRole('button', { name: /Shared dinner/ })).toHaveCount(0);
});

test('a change the server refuses says so, can be tried again, and can be thrown away @critical @offline @multiuser', async ({ owner, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  await openApp(sam.page, '/Expenses');
  await installOffline(sam.page);
  await sam.page.context().setOffline(true);
  await new ExpensesScreen(sam.page).addExpense({ amount: 12, description: 'Bus ticket' });
  await expect(pill(sam.page, 'offOfflineWaiting', 1)).toBeVisible();

  // While Sam is offline, the owner makes Sam a viewer
  const { data } = await (await api.send('GET', `/workspaces?id=${owner.workspaceId}`)).json();
  const samRow = data.members.find((m) => m.email === sam.email);
  await api.call('PUT', `/workspaces?id=${owner.workspaceId}&action=updateMember&memberId=${samRow._id || samRow.id}`, { role: 'viewer' });

  await sam.page.context().setOffline(false);
  const failed = pill(sam.page, 'offFailed', 1);
  await expect(failed).toBeVisible({ timeout: 30_000 });
  await failed.click();
  const sheet = sam.page.getByRole('dialog', { name: L('offSheetTitle') });
  await expect(sheet.getByText(L('offRefused'))).toBeVisible();
  // Still not allowed: refused again
  await sheet.getByRole('button', { name: L('offRetry') }).click();
  await expect(sheet.getByText(L('offRefused'))).toBeVisible();
  await sheet.getByRole('button', { name: L('offDiscard') }).click();
  await expect(sheet.getByText(L('offNothingWaiting'))).toBeVisible();
  await sam.page.keyboard.press('Escape');
  await expect(failed).toBeHidden();
  expect(await api.list('transactions')).toEqual([]);
});

test('a connection that keeps dropping while changes go out sends each one exactly once @critical @offline', async ({ page, context, owner: _owner }) => {
  await openApp(page, '/Expenses');
  await installOffline(page);
  await context.setOffline(true);
  const expenses = new ExpensesScreen(page);
  const added = [];
  for (let i = 1; i <= 5; i += 1) {
    await expenses.addExpense({ amount: i, description: `Snack ${i}` });
    added.push([`Snack ${i}`, i]);
  }
  await expect(pill(page, 'offOfflineWaiting', 5)).toBeVisible();

  // Back, gone, back, gone... then back for good
  for (let i = 0; i < 6; i += 1) {
    await context.setOffline(i % 2 === 1);
    await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 300); }));
  }
  await context.setOffline(false);
  await expect.poll(() => amounts(page), { timeout: 45_000 }).toEqual(added.sort());
  await expect(pill(page, 'offWaiting', 1)).toHaveCount(0);
});

test('a task ticked off offline is done on the server once the connection returns @critical @offline', async ({ page, context, api }) => {
  const task = await api.create('tasks', { title: 'Water the plants', dueDate: new Date().toISOString().slice(0, 10) });
  await openApp(page, '/Tasks');
  await installOffline(page);
  await expect(page.getByText('Water the plants').first()).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: L('tkMarkDoneNamed', { name: 'Water the plants' }) }).click();
  await expect(waiting(page)).toBeVisible();

  await context.setOffline(false);
  await expect.poll(async () => (await api.list('tasks')).find((t) => t.id === task.id)?.history?.length, { timeout: 30_000 }).toBe(1);
  await expect(waiting(page)).toBeHidden();
});
