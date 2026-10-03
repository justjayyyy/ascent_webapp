// Forms say what is missing (PL-N01, LN-N01, LN-N03, SV-N01): a plan without a name or ending before it starts, a
// loan without its amount or next payment, a goal without a name, money of nothing. Nothing is saved meanwhile.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

test('a plan of no particular kind needs a name, and no plan can end before it starts @critical', async ({ page, api }) => {
  await openApp(page, '/Plans');
  // "Other" has no name of its own (a vacation is called Vacation unless named)
  await page.getByRole('button', { name: L('planKind_other') }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: L('createPlan') }).click();
  await expect(dialog.getByText(L('planNameRequired'))).toBeVisible();

  await dialog.locator('#plan-name').fill('Rome');
  await dialog.locator('#plan-start').fill(day(60));
  await dialog.locator('#plan-end').fill(day(50));
  await dialog.getByRole('button', { name: L('createPlan') }).click();
  // The end field starts at the start date: Chromium stops the save and says why; where the browser lets it
  // through (WebKit), the app says it
  const nativeRefused = await dialog.locator('#plan-end').evaluate((el) => !el.validity.valid && el.validationMessage.length > 0);
  await expect(nativeRefused ? dialog.locator('#plan-end') : dialog.getByText(L('endDateAfterStartDate'))).toBeVisible();
  expect(await api.list('plans')).toEqual([]);
});

test('a loan needs its amount and its next payment date @critical', async ({ page, api }) => {
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: L('cmKind_car'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(L('cmName'), { exact: true }).fill('Car loan');
  await dialog.getByLabel(L('cmMonthlyPayment')).fill('500');
  await dialog.getByRole('button', { name: L('cmAdd'), exact: true }).click();
  await expect(dialog.getByText(L('cmAmountRequired'))).toBeVisible();

  await dialog.getByLabel(L('cmAmountOwed')).fill('12000');
  await dialog.getByLabel(L('cmNextPaymentDate')).fill('');
  await dialog.getByRole('button', { name: L('cmAdd'), exact: true }).click();
  await expect(dialog.getByText(L('cmFirstPaymentRequired'))).toBeVisible();
  expect(await api.list('commitments')).toEqual([]);
});

test('a goal of no particular kind needs a name, and money put aside or repaid must be more than nothing @critical', async ({ page, api }) => {
  await openApp(page, '/Savings');
  // "Other" has no name of its own
  await page.getByRole('button', { name: L('svKindShort_other'), exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: L('svCreateGoal') }).click();
  await expect(dialog.getByText(L('svNameRequired'))).toBeVisible();
  expect(await api.list('goals')).toEqual([]);
  await page.keyboard.press('Escape');

  await api.create('goals', { name: 'Family car fund', kind: 'car', currency: 'USD', targetAmount: 1000, entries: [] });
  await page.reload();
  await page.getByRole('button', { name: /Family car fund/ }).first().click();
  await page.getByRole('button', { name: L('svAddMoney') }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(new RegExp(`^${L('amount')}`)).fill('0');
  await dialog.getByRole('button', { name: L('save'), exact: true }).click();
  await expect(dialog.getByText(L('amountGreaterThanZero'))).toBeVisible();
  expect((await api.list('goals'))[0].entries).toEqual([]);
});
