// The Dashboard at the edges of a month (DSH-E01, DSH-H03): the first day, the last day, and a month that is over.
// The browser's clock is fixed; the household's rows carry their own dates.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense, income } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

const june = (d) => `2026-06-${String(d).padStart(2, '0')}`;
const perDay = new RegExp(L('stsPerDay', { amount: '§', days: '§' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/§/g, '.+'));

/** Nothing on the page came out of a division by zero or a missing value */
async function expectNoBrokenNumbers(page) {
  const text = await page.locator('main').innerText();
  expect(text.match(/NaN|Infinity|undefined|null/g), 'broken numbers on the Dashboard').toBeNull();
}

async function aMonth(api) {
  await api.create('transactions', income({ amount: 3000, category: 'freelance', date: june(1) }));
  await api.create('transactions', expense({ amount: 120, category: 'groceries', date: june(1) }));
}

test('on the first day of the month the figures make sense, with the whole month still ahead @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T09:00:00'));
  await aMonth(api);
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page.getByText(perDay)).toBeVisible();
  await expectNoBrokenNumbers(page);
});

test('on the last day of the month there is no "a day for" line, and nothing breaks @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-06-30T21:00:00'));
  await aMonth(api);
  await openApp(page, '/Dashboard');
  await waitForPageReady(page, { timeout: 20_000 });
  await expect(page.getByText(L('stsTitle')).first()).toBeVisible();
  await expect(page.getByText(perDay)).toHaveCount(0);
  await expectNoBrokenNumbers(page);
});

test('a past month is shown as closed, with its net result @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-07-12T09:00:00'));
  await aMonth(api);
  await openApp(page, '/Dashboard');
  await page.getByRole('button', { name: L('dashPrevMonth') }).click();
  await expect(page.getByText(L('stsPastMonth'))).toBeVisible();
  await expect(page.getByText(perDay)).toHaveCount(0);
  await expectNoBrokenNumbers(page);
});

test('payments that repeat are found, and the one whose price went up says so @critical', async ({ page, api }) => {
  await page.clock.setFixedTime(new Date('2026-06-20T09:00:00'));
  const months = ['03', '04', '05', '06'];
  for (const [i, mm] of months.entries()) {
    await api.create('transactions', expense({ description: 'StreamFlix', amount: i === 3 ? 15.49 : 12.99, category: 'entertainment', date: `2026-${mm}-05` }));
    await api.create('transactions', expense({ description: 'City Gym', amount: 40, category: 'healthcare', date: `2026-${mm}-12` }));
  }
  await api.create('transactions', expense({ description: 'Hardware store', amount: 230, category: 'shopping', date: june(8) }));
  await openApp(page, '/Dashboard');

  // The card: the heading's block and the list under it
  const card = page.getByRole('heading', { name: L('subsTitle') }).locator('xpath=ancestor::div[contains(@class,"p-6")][1]');
  await expect(card.getByText('StreamFlix')).toBeVisible();
  await expect(card.getByText('City Gym')).toBeVisible();
  await expect(card.getByText('Hardware store')).toHaveCount(0);
  // Only the raised one, with what it cost before
  const up = card.getByText(/up from/);
  await expect(up).toHaveCount(1);
  await expect(up).toContainText('$13');
  await expect(card.locator('li').filter({ hasText: 'StreamFlix' })).toContainText('up from');
});
