// Loans and commitments: what is owed, the monthly payment, and recording it as a real expense.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

// With no loans yet, the page offers a kind of loan to start from
async function fillLoan(page, { kind = 'car', name, owed, rate, nextPayment, payment }) {
  await page.getByRole('button', { name: L(`cmKind_${kind}`), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(L('cmName'), { exact: true }).fill(name);
  await dialog.getByLabel(L('cmAmountOwed')).fill(String(owed));
  await dialog.getByLabel(L('cmRate')).fill(String(rate));
  await dialog.getByLabel(L('cmNextPaymentDate')).fill(nextPayment);
  await dialog.getByLabel(L('cmMonthlyPayment')).fill(String(payment));
  return dialog;
}

test('a car loan: what it costs a month, for how long, and in interest @critical', async ({ page, api }) => {
  await openApp(page, '/Commitments');
  const dialog = await fillLoan(page, { name: 'Car loan', owed: 60000, rate: 4.5, nextPayment: day(10), payment: 1200 });
  // The dialog works out the rest before saving
  await expect(dialog.getByText(/a month for/)).toBeVisible();
  await dialog.getByRole('button', { name: L('cmAdd'), exact: true }).click();

  await expect.poll(async () => (await api.list('commitments')).map((c) => [c.name, c.direction, c.principal, c.annualRate, c.payment, c.firstPaymentDate]))
    .toEqual([['Car loan', 'borrowed', 60000, 4.5, 1200, day(10)]]);
  await expect(page.getByText('Car loan').first()).toBeVisible();
});

test('a monthly payment that does not even cover the interest is flagged @critical', async ({ page, api }) => {
  await openApp(page, '/Commitments');
  // 4.5% of 60,000 is 225 a month in interest; 100 a month would never pay it off
  const dialog = await fillLoan(page, { name: 'Bad loan', owed: 60000, rate: 4.5, nextPayment: day(10), payment: 100 });
  await expect(dialog.getByText(L('cmNeverEnds'))).toBeVisible();
  await dialog.getByRole('button', { name: L('cmAdd'), exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await api.list('commitments')).toEqual([]);
});

test('recording this month’s payment adds it to Expenses, linked to the loan @critical', async ({ page, api }) => {
  const loan = await api.create('commitments', {
    name: 'Mortgage', kind: 'mortgage', direction: 'borrowed', currency: 'USD', principal: 300000,
    annualRate: 3.2, payment: 1500, firstPaymentDate: day(5), category: 'rent_housing',
  });
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: /Mortgage/ }).first().click();
  await page.getByRole('button', { name: L('cmRecordInExpenses') }).click();

  // The expense dialog opens with the month's payment filled in
  await expect(page.getByLabel(new RegExp(`^${L('amount')}`))).toHaveValue('1500');
  await page.getByRole('button', { name: L('addTransaction'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.type, t.amount, t.commitmentId, t.description]))
    .toEqual([['Expense', 1500, loan.id, 'Mortgage']]);
  await expect(page.getByText(L('cmRecordedThisMonth'))).toBeVisible();
});
