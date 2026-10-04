// The last browser-testable P2 rows (SV-E01, PL-E05, DSH-E02, GR-N03): a goal whose date has passed or that holds
// more than its target, a plan with no date in another currency and with 200 costs, an overspent month in Hebrew,
// and a shopping trip finished without a total.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense, income } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

/** Nothing on the page came out of a missing value or a negative count */
async function expectNoBrokenNumbers(page) {
  const text = await page.locator('main').innerText();
  expect(text.match(/NaN|Infinity|undefined|null/g), 'broken numbers on the page').toBeNull();
}

test('a goal whose date has passed says so, and asks for no negative months @critical', async ({ page, api }) => {
  await api.create('goals', { name: 'Old trip', kind: 'vacation', currency: 'USD', targetAmount: 3000, targetDate: day(-30), entries: [{ id: 'a', date: day(-60), amount: 500 }] });
  await openApp(page, '/Savings');
  await expect(page.getByText(L('svStatus_late')).first()).toBeVisible();
  await page.getByRole('button', { name: /Old trip/ }).first().click();
  await expect(page.getByRole('dialog').or(page.locator('main')).first()).toBeVisible();
  await expectNoBrokenNumbers(page);
  expect((await page.locator('body').innerText()).match(/-\$\d[\d,]* a month/g)).toBeNull();
});

test('a goal holding more than its target counts as reached @critical', async ({ page, api }) => {
  await api.create('goals', { name: 'Overshot', kind: 'other', currency: 'USD', targetAmount: 1000, targetDate: day(200), entries: [{ id: 'a', date: day(-5), amount: 1500 }] });
  await openApp(page, '/Savings');
  await expect(page.getByText(L('svStatus_reached')).first()).toBeVisible();
  await expectNoBrokenNumbers(page);
});

test('a plan with no date, in euros, with 200 costs, still opens and adds up @critical', async ({ page, api }) => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Cost ${i + 1}`, amount: 10, status: 'planned', dueDate: day(30 + i) }));
  await api.create('plans', { name: 'Big wedding', kind: 'wedding', currency: 'EUR', items });
  await openApp(page, '/Plans');
  await expect(page.getByText(L('planNoDate')).first()).toBeVisible();
  await page.getByRole('button', { name: /Big wedding/ }).first().click();
  await expect(page.getByText('€2,000').first()).toBeVisible();
  await expectNoBrokenNumbers(page);
});

test('an overspent month reads "over by" in Hebrew, with the amount kept left to right @critical', async ({ page, api, owner: _owner }) => {
  await page.request.put('/api/auth/me', { data: { language: 'he' } });
  await api.create('transactions', income({ amount: 1000, category: 'freelance', date: day(0) }));
  await api.create('transactions', expense({ amount: 1600, category: 'groceries', date: day(0) }));
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  const line = page.getByText(L('stsOver', { amount: '' }, 'he').trim().split(' ')[0]).first();
  await expect(line).toBeVisible();
  await expect(line).toContainText('600');
  await expectNoBrokenNumbers(page);
});

test('finishing a trip with no total typed does not save an expense @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Milk', onList: true, listedAt: new Date().toISOString() });
  await openApp(page, '/Groceries');
  await page.getByRole('button', { name: L('grStartShopping') }).click();
  const shopping = page.getByRole('dialog', { name: L('grShopping') });
  await shopping.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await shopping.getByRole('button', { name: L('grDoneShopping', { n: 1 }) }).click();
  const finish = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: L('grShopDone') }) });
  await finish.getByRole('button', { name: L('grEnterAmount') }).click();
  const form = page.getByRole('dialog').last();
  await form.getByRole('button', { name: L('addTransaction'), exact: true }).click();
  await expect(form).toBeVisible();
  expect(await api.list('transactions')).toEqual([]);
});

test('a loan already being paid off starts from today’s balance and the next payment @critical', async ({ page, api }) => {
  await api.create('commitments', { name: 'Car loan', kind: 'car', direction: 'borrowed', currency: 'USD', principal: 8000, annualRate: 4, payment: 500, firstPaymentDate: day(5) });
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: /Car loan/ }).first().click();
  await expect(page.getByText('$8,000').first()).toBeVisible();
  await expectNoBrokenNumbers(page);
  expect((await page.locator('body').innerText()).match(/-\$\d/g)).toBeNull();
});
