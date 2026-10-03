// The monthly review: a whole month's figures, set against the months before it, and the month as a story.
import { format, startOfMonth, subMonths } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense, income } from '../../support/factories.js';
import { L, Lre } from '../../support/i18n.js';

const monthDay = (monthsBack, dayOfMonth) => format(new Date(startOfMonth(subMonths(new Date(), monthsBack)).setDate(dayOfMonth)), 'yyyy-MM-dd');
const monthKey = (monthsBack) => format(subMonths(new Date(), monthsBack), 'yyyy-MM');
// The month is in the address (in the first week of a month the review opens on the month just finished)
const openMonth = (page, monthsBack) => openApp(page, `/Review?month=${monthKey(monthsBack)}`);
const figure = (page, label) => page.locator('dt', { hasText: new RegExp(`^${label}$`) }).first().locator('xpath=following-sibling::dd[1]');

async function lastMonthOnRecord(api) {
  // Last month: 6,000 in, 1,500 out. The month before: 1,000 out
  await api.create('transactions', income({ amount: 6000, category: 'freelance', date: monthDay(1, 10) }));
  await api.create('transactions', expense({ amount: 1200, category: 'rent_housing', date: monthDay(1, 5) }));
  await api.create('transactions', expense({ amount: 300, category: 'food_dining', date: monthDay(1, 12) }));
  await api.create('transactions', expense({ amount: 1000, category: 'rent_housing', date: monthDay(2, 5) }));
}

test('a past month in full: spent, earned and kept, against the month before @critical', async ({ page, api }) => {
  await lastMonthOnRecord(api);
  await openMonth(page, 1);

  await expect(figure(page, L('rvSpent'))).toHaveText('$1,500');
  await expect(figure(page, L('rvEarned'))).toHaveText('$6,000');
  await expect(figure(page, L('rvKept'))).toHaveText('$4,500');
  // Against last month by default: what was spent then
  await expect(page.getByText(L('rvWas', { amount: '$1,000' })).first()).toBeVisible();
});

test('the comparison can be changed: last month, the same month last year, or an average @critical', async ({ page, api }) => {
  await lastMonthOnRecord(api);
  await openMonth(page, 1);
  const compare = page.getByRole('radiogroup', { name: L('rvCompareWith') });
  for (const key of ['rvCompare_avg3', 'rvCompare_lastYear', 'rvCompare_prev']) {
    const option = compare.getByRole('radio', { name: L(key) });
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/vs=/);
  }
});

test('a month with nothing on record says so @critical', async ({ page, owner: _owner }) => {
  await openMonth(page, 0);
  await expect(page.getByText(L('rvEmptyTitle'))).toBeVisible();
});

test('the month as a story: it plays, pauses and closes @critical', async ({ page, api }) => {
  await lastMonthOnRecord(api);
  await openMonth(page, 1);
  await page.getByRole('button', { name: Lre('rvWatchRecap') }).click();

  const story = page.getByRole('dialog', { name: Lre('rcTitle') });
  await expect(story).toBeVisible();
  await story.getByRole('button', { name: L('rcPause') }).click();
  await expect(story.getByRole('button', { name: L('rcPlay') })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(story).toBeHidden();
});

// Every piece of text drawn on a canvas, so a test can read what the generated share card says
function recordCanvasText() {
  window.__canvasText = [];
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function record(text, ...rest) {
    window.__canvasText.push(String(text));
    return fillText.call(this, text, ...rest);
  };
}

async function watchToTheEnd(page) {
  await page.getByRole('button', { name: Lre('rvWatchRecap') }).click();
  const story = page.getByRole('dialog', { name: Lre('rcTitle') });
  await expect(story).toBeVisible();
  const share = story.getByRole('button', { name: L('rcShare') });
  await expect(async () => {
    await page.keyboard.press('ArrowRight');
    await expect(share).toBeVisible({ timeout: 500 });
  }).toPass();
  return share;
}

test('sharing the recap makes an image of the month with its figures @critical', async ({ page, api }) => {
  await page.addInitScript(recordCanvasText);
  // No share sheet here, so the card is downloaded
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
  await lastMonthOnRecord(api);
  await openMonth(page, 1);
  const share = await watchToTheEnd(page);

  const download = page.waitForEvent('download');
  await share.click();
  expect((await download).suggestedFilename()).toBe(`ascent-recap-${monthKey(1)}.png`);
  const text = await page.evaluate(() => window.__canvasText);
  expect(text).toContain('$4,500');
  expect(text).toContain('$1,200 · 80%');
});

test('with values blurred, the shared recap carries percentages only, never amounts @critical', async ({ page, api }) => {
  await page.addInitScript(recordCanvasText);
  // A phone's share sheet, kept so the test can see what was handed to it
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); };
  });
  await api.call('PUT', '/auth/me', { blurValues: true });
  await lastMonthOnRecord(api);
  await openMonth(page, 1);
  const share = await watchToTheEnd(page);

  await share.click();
  await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([
    { name: `ascent-recap-${monthKey(1)}.png`, type: 'image/png', size: expect.any(Number) },
  ]);
  const text = await page.evaluate(() => window.__canvasText);
  // Kept 4,500 of 6,000: the savings rate stands in for the amount, and each category shows only its share
  expect(text).toContain('75%');
  expect(text).toContain('80%');
  expect(text.filter((s) => /\$|\d,\d{3}|\b(6000|4500|1500|1200|300)\b/.test(s)), 'amounts on the card').toEqual([]);
});
