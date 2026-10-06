// Home costs on the Dashboard: bills counted in the months they are for, not the month they were paid.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

const fill = (key, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), L(key));

test('a water bill paid late lands in the months it is for, and property tax paid ahead is spread over its months @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00'));
  await api.create('transactions', expense({ amount: 191.55, date: '2026-10-05', category: 'utilities', description: 'Meniv water', coversFrom: '2026-07', coversTo: '2026-08' }));
  await api.create('transactions', expense({ amount: 916.3, date: '2026-09-01', category: 'taxes', description: 'Arnona', coversFrom: '2026-09', coversTo: '2026-10' }));

  await openApp(page, '/Dashboard');
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: L('homeTitle') }) });
  const months = card.getByRole('list', { name: L('homeByMonth') });
  // Half the water bill in each of July and August, nothing in October for it but what is expected
  await expect(months.getByRole('listitem', { name: 'July: $96' })).toBeVisible();
  await expect(months.getByRole('listitem', { name: 'August: $96' })).toBeVisible();
  await expect(months.getByRole('listitem', { name: `September: $554 (${fill('homeEstimatedPart', { amount: '$96' })})` })).toBeVisible();
  // October: half the property tax, and the water expected from the last bill; what was paid in October is the water bill
  await expect(card.getByText(fill('homeMonthTotal', { month: 'October', amount: '$554' }))).toBeVisible();
  await expect(card.getByText(fill('homePaidIn', { month: 'October', amount: '$192' }))).toBeVisible();
  await expect(card.getByText(`Arnona · Sep–Oct 2026`)).toBeVisible();
  await expect(card.getByText(`Meniv water · ${L('homeExpected')}`)).toBeVisible();
});

test('an expense can say which months it is for, and the list shows them @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00'));
  await openApp(page, '/Expenses?new=1');
  await page.getByLabel(new RegExp(`^${L('amount')}`)).fill('191.55');
  await page.getByLabel(new RegExp(`^${L('description')}`)).fill('Meniv water');
  await page.getByRole('checkbox', { name: L('forOtherMonths') }).click();
  await page.getByRole('combobox', { name: L('coversFromLabel') }).click();
  await page.getByRole('option', { name: 'July 2026' }).click();
  await page.getByRole('combobox', { name: L('coversToLabel') }).click();
  await page.getByRole('option', { name: 'August 2026' }).click();
  await expect(page.getByText(fill('forOtherMonthsHelp', { period: 'Jul–Aug 2026' }))).toBeVisible();
  await page.getByRole('button', { name: L('addTransaction'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.amount, t.coversFrom, t.coversTo])).toEqual([[191.55, '2026-07', '2026-08']]);
  await expect(page.getByLabel(fill('forPeriod', { period: 'Jul–Aug 2026' })).first()).toBeVisible();
});
