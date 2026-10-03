// Savings goals: a target and a date give a monthly amount; money put aside moves the goal along.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

test('a goal with a target and a date says what each month needs @critical', async ({ page, api }) => {
  await openApp(page, '/Savings');
  // With no goals yet the page offers kinds of goal to start from
  await page.getByRole('button', { name: L('svKindShort_emergency'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#sv-name').fill('Rainy day');
  await dialog.getByLabel(new RegExp(`^${L('svTargetAmount')}`)).fill('12000');
  await dialog.getByLabel(new RegExp(`^${L('svTargetDate')}`)).fill(day(365));
  await expect(dialog.getByText(/a month/)).toBeVisible();
  await dialog.getByRole('button', { name: L('svCreateGoal') }).click();

  await expect.poll(async () => (await api.list('goals')).map((g) => [g.name, g.targetAmount, g.targetDate, g.status]))
    .toEqual([['Rainy day', 12000, day(365), 'active']]);
  await expect(page.getByText('Rainy day').first()).toBeVisible();
});

test('money put aside shows in the goal and in its history @critical', async ({ page, api }) => {
  await api.create('goals', { name: 'New car', kind: 'car', currency: 'USD', targetAmount: 20000, targetDate: day(400), entries: [] });
  await openApp(page, '/Savings');
  await page.getByRole('button', { name: /New car/ }).first().click();
  await page.getByRole('button', { name: L('svAddMoney') }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(new RegExp(`^${L('amount')}`)).fill('2000');
  await dialog.getByRole('button', { name: L('save'), exact: true }).click();

  await expect.poll(async () => (await api.list('goals'))[0].entries.map((e) => e.amount)).toEqual([2000]);
  await expect(page.getByText('$2,000').first()).toBeVisible();
});
