// Household tasks: dated chores that cost money, who does them, and logging what they cost when done.
import { addYears, format, parseISO } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, today } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

test('a yearly task with a cost, given to another member @critical @multiuser', async ({ page, api, member }) => {
  const partner = await member('editor', { name: 'Sam Partner' });
  await openApp(page, '/Tasks');
  await page.getByRole('button', { name: L('tkNewTask') }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(L('tkTitle')).fill('Renew the car insurance');
  await dialog.getByLabel(L('tkDueDate'), { exact: true }).fill(day(10));
  await dialog.getByRole('combobox', { name: L('tkRepeat') }).click();
  await page.getByRole('option', { name: L('tkRepeat_yearly') }).click();
  await dialog.getByLabel(new RegExp(`^${L('tkUsualCost')}`)).fill('3000');
  await dialog.getByRole('combobox', { name: L('tkWho') }).click();
  await page.getByRole('option', { name: /Sam Partner/ }).click();
  await dialog.getByRole('button', { name: L('tkCreate') }).click();

  await expect.poll(async () => (await api.list('tasks')).map((t) => [t.title, t.dueDate, t.repeat, t.amount, t.assignee]))
    .toEqual([['Renew the car insurance', day(10), 'yearly', 3000, partner.email]]);
  await expect(page.getByText('Renew the car insurance').first()).toBeVisible();
});

test('ticking off a task logs what it cost as an expense and moves it to next year @critical', async ({ page, api }) => {
  const due = today();
  const task = await api.create('tasks', {
    title: 'Vehicle test', kind: 'car', dueDate: due, repeat: 'yearly', amount: 3000, currency: 'USD', category: 'transportation',
  });
  await openApp(page, '/Tasks');
  await page.getByRole('button', { name: L('tkMarkDoneNamed', { name: 'Vehicle test' }) }).click();

  const dialog = page.getByRole('dialog');
  const nextDue = format(addYears(parseISO(due), 1), 'yyyy-MM-dd');
  const cost = dialog.locator('#tk-done-amount');
  await expect(cost).toHaveValue('3000');
  await cost.fill('3100');
  await expect(dialog.getByRole('switch', { name: L('tkLogExpense') })).toBeChecked();
  await dialog.getByRole('button', { name: L('tkMarkDone'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.type, t.amount, t.category]))
    .toEqual([['Expense', 3100, 'transportation']]);
  const [saved] = (await api.list('tasks')).filter((t) => t.id === task.id);
  expect(saved.dueDate).toBe(nextDue);
  expect(saved.history.map((h) => [h.amount, h.logged])).toEqual([[3100, true]]);
});

test('a task with no cost is done in one tap, and tapping it in Done reopens it @critical', async ({ page, api }) => {
  const task = await api.create('tasks', { title: 'Change the smoke alarm battery', dueDate: today() });
  await openApp(page, '/Tasks');
  await page.getByRole('button', { name: L('tkMarkDoneNamed', { name: 'Change the smoke alarm battery' }) }).click();
  // No dialog: nothing to log
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await api.list('tasks')).find((t) => t.id === task.id)).toMatchObject({ status: 'done' });
  expect((await api.list('tasks')).find((t) => t.id === task.id).history).toHaveLength(1);

  await page.getByRole('button', { name: new RegExp(L('tkGroup_done')) }).click();
  await page.getByRole('button', { name: /Change the smoke alarm battery/ }).first().click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: L('tkReopened') })).toBeVisible();
  await expect.poll(async () => (await api.list('tasks')).find((t) => t.id === task.id).status).toBe('open');
});

test('a task needs a title, and can only be given to someone in the household @critical', async ({ page, api }) => {
  await openApp(page, '/Tasks');
  await page.getByRole('button', { name: L('tkNewTask') }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: L('tkCreate') }).click();
  await expect(dialog.getByText(L('tkTitleRequired'))).toBeVisible();
  expect(await api.list('tasks')).toEqual([]);

  const outsider = await api.send('POST', '/entities/tasks', { title: 'Fix the gate', assignee: 'stranger@elsewhere.test' });
  expect(outsider.status()).toBe(400);
  expect(await api.list('tasks')).toEqual([]);
});

test('late tasks say by how many days, and today’s say today @critical', async ({ page, api }) => {
  await api.create('tasks', { title: 'Renew the parking permit', dueDate: day(-3) });
  await api.create('tasks', { title: 'Water meter reading', dueDate: today() });
  await openApp(page, '/Tasks');
  await expect(page.locator('li, section').filter({ hasText: 'Renew the parking permit' }).getByText(L('tkDaysLate', { n: 3 })).first()).toBeVisible();
  await expect(page.locator('li, section').filter({ hasText: 'Water meter reading' }).getByText(L('today'), { exact: true }).first()).toBeVisible();
});

test('a viewer can tick off a task with a cost but not log it as an expense @critical @multiuser', async ({ api, member }) => {
  const viewer = await member('viewer', { name: 'Grandma' });
  await api.create('tasks', { title: 'Boiler service', dueDate: today(), amount: 350, currency: 'USD', category: 'utilities' });
  await openApp(viewer.page, '/Tasks');
  await viewer.page.getByRole('button', { name: L('tkMarkDoneNamed', { name: 'Boiler service' }) }).click();
  const dialog = viewer.page.getByRole('dialog');
  await expect(dialog.getByRole('switch', { name: L('tkLogExpense') })).toHaveCount(0);
  await dialog.getByRole('button', { name: L('tkMarkDone'), exact: true }).click();
  await expect.poll(async () => (await api.list('tasks'))[0].history?.length).toBe(1);
  expect(await api.list('transactions')).toEqual([]);
  // Nor through the API
  expect((await viewer.api.send('POST', '/entities/transactions', { type: 'Expense', amount: 350, currency: 'USD', category: 'utilities', description: 'Boiler service', date: today() })).status()).toBe(403);
});
