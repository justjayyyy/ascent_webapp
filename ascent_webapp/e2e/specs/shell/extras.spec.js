// Smaller conveniences (NAV-H05, LN-H04, SV-H06): Ctrl/Cmd+B folds the sidebar and it stays folded, the loan's
// "pay it off faster" what-if, and a savings entry deleted then brought back.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

test('Ctrl+B folds the sidebar and it stays folded after a reload, but not while typing @critical', async ({ page, owner: _owner }) => {
  // Notes, not Settings: Settings stops Playwright's WebKit (TEST_PLAN.md §0.2.3)
  await openApp(page, '/Notes');
  const toggle = (state) => page.getByRole('button', { name: L(state) });
  await expect(toggle('collapseSidebar')).toBeVisible();
  await page.locator('body').click({ position: { x: 640, y: 5 } });
  await page.keyboard.press('Control+b');
  await expect(toggle('expandSidebar')).toBeVisible();
  await page.reload();
  await expect(toggle('expandSidebar')).toBeVisible();

  // In a text field, Ctrl+B belongs to the field
  await page.getByRole('searchbox').first().focus();
  await page.keyboard.press('Control+b');
  await expect(toggle('expandSidebar')).toBeVisible();
});

test('paying a loan off faster: an extra each month shows how much sooner and the interest saved @critical', async ({ page, api }) => {
  await api.create('commitments', { name: 'Mortgage', kind: 'mortgage', direction: 'borrowed', currency: 'USD', principal: 200000, annualRate: 5, payment: 1500, firstPaymentDate: day(10), category: 'rent_housing' });
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: /Mortgage/ }).first().click();
  await expect(page.getByText(L('cmFasterDrag'))).toBeVisible();
  // Radix puts the slider role on the thumb, without the label
  const slider = page.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(page.getByText(L('cmDebtFreeSooner'))).toBeVisible();
  await expect(page.getByText(L('cmInterestSaved'))).toBeVisible();
});

test('a savings entry deleted by mistake comes back with Undo @critical', async ({ page, api }) => {
  await api.create('goals', { name: 'New car', kind: 'car', currency: 'USD', targetAmount: 20000, entries: [{ id: 'e1', date: day(-3), amount: 750, note: 'Bonus' }] });
  await openApp(page, '/Savings');
  await page.getByRole('button', { name: /New car/ }).first().click();
  await page.getByRole('region', { name: L('svHistory') }).getByRole('button', { name: /Bonus/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: L('delete') }).click();
  await expect.poll(async () => (await api.list('goals'))[0].entries).toEqual([]);
  await page.locator('[data-sonner-toast]').filter({ hasText: L('svEntryDeleted') }).getByRole('button', { name: L('ntUndo') }).click();
  await expect.poll(async () => (await api.list('goals'))[0].entries.map((e) => e.amount)).toEqual([750]);
});
