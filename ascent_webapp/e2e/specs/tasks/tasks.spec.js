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
