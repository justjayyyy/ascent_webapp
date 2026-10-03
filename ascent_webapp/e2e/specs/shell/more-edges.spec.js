// More edges (P1/P2: NT-H16, NT-N05, NT-E07, GR-E02, LN-E01, RV-N02, RC-E02, OFF-E07): dictation and a blocked
// microphone, a note deleted for good, quantities in Hebrew and with units, a loan with no interest, a review with
// nothing before it, an overspent month's recap, and the app working when the browser's database refuses.
import { format, startOfMonth, subMonths } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day, expense, income } from '../../support/factories.js';
import { L, Lre } from '../../support/i18n.js';

// The browser's speech recognition, replaced by one the test drives (window.__rec)
function fakeSpeech() {
  class FakeRecognition {
    start() { window.__rec = this; }
    stop() { this.onend?.(); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
}

test('dictation types what is said into the note, and a blocked microphone says so @critical', async ({ page, api }) => {
  await page.addInitScript(fakeSpeech);
  await api.create('notes', { type: 'text', title: 'Shopping', content: '', isShared: false });
  await openApp(page, '/Notes');
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await page.getByRole('button', { name: L('ntDictate') }).first().click();
  await expect(page.getByText(L('ntListening')).first()).toBeVisible();
  await page.evaluate(() => {
    const result = Object.assign([{ transcript: 'buy milk and bread' }], { isFinal: true });
    window.__rec.onresult({ resultIndex: 0, results: [result] });
  });
  await expect.poll(async () => (await api.list('notes'))[0].content).toContain('buy milk and bread');

  await page.evaluate(() => window.__rec.onerror({ error: 'not-allowed' }));
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: L('ntMicBlocked') })).toBeVisible();
});

test('a note deleted for good from the trash is gone, with no Undo offered @critical', async ({ page, api }) => {
  const created = await api.create('notes', { type: 'text', title: 'Old idea', content: 'x', isShared: false });
  await api.update('notes', created.id, { trashed: true });
  await openApp(page, '/Notes');
  await page.getByRole('navigation', { name: L('ntFilters') }).getByRole('button', { name: new RegExp(L('ntTrashNav')) }).first().click();
  const card = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Old idea', exact: true }) });
  await card.hover();
  await card.getByRole('button', { name: L('ntMore') }).click();
  await page.getByRole('menuitem', { name: L('ntDeleteForever') }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).first().getByRole('button', { name: L('delete'), exact: true }).click();
  await expect.poll(async () => (await api.list('notes')).length).toBe(0);
  await expect(page.locator('[data-sonner-toast]').getByRole('button', { name: L('ntUndo') })).toHaveCount(0);
});

test('quantities are read in Hebrew and with units @critical', async ({ page, api }) => {
  await openApp(page, '/Groceries');
  const add = page.getByRole('textbox', { name: L('grAddLabel') }).first();
  await add.fill('2kg tomatoes, תפוחים 3');
  await add.press('Enter');
  await expect.poll(async () => (await api.list('groceries')).map((i) => [i.name.toLowerCase(), i.qty]).sort())
    .toEqual([['tomatoes', '2kg'], ['תפוחים', '3']]);
});

test('a loan with no interest says so @critical', async ({ page, api }) => {
  await api.create('commitments', { name: 'Fridge from Dad', kind: 'family', direction: 'borrowed', currency: 'USD', principal: 1200, annualRate: 0, payment: 100, firstPaymentDate: day(10) });
  await openApp(page, '/Commitments');
  await page.getByRole('button', { name: /Fridge from Dad/ }).first().click();
  await expect(page.getByText(L('cmNoInterest')).first()).toBeVisible();
});

test('a first month on record says there is nothing to compare with yet @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ amount: 40, date: day(0) }));
  await openApp(page, `/Review?month=${format(new Date(), 'yyyy-MM')}`);
  await expect(page.getByText(L('rvNoComparison')).first()).toBeVisible();
});

test('the recap of a month that spent more than came in says so @critical', async ({ page, api }) => {
  const lastMonth = (d) => format(new Date(startOfMonth(subMonths(new Date(), 1)).setDate(d)), 'yyyy-MM-dd');
  await api.create('transactions', income({ amount: 1000, category: 'freelance', date: lastMonth(3) }));
  await api.create('transactions', expense({ amount: 1600, date: lastMonth(10) }));
  await openApp(page, `/Review?month=${format(subMonths(new Date(), 1), 'yyyy-MM')}`);
  await page.getByRole('button', { name: Lre('rvWatchRecap') }).click();
  const story = page.getByRole('dialog', { name: Lre('rcTitle') });
  await story.getByRole('button', { name: L('rcPause') }).click();
  // Story by story until the one about the month's balance
  await expect(async () => {
    await page.keyboard.press('ArrowRight');
    await expect(story.getByText(L('rcOverspent')).first()).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
});

test('when the browser’s database refuses, the app still works online @critical', async ({ page, api }) => {
  await page.addInitScript(() => {
    // As in private modes that refuse it: opening a database throws
    IDBFactory.prototype.open = () => { throw new DOMException('The operation is insecure.', 'InvalidStateError'); };
  });
  await api.create('transactions', expense({ description: 'Coffee beans', amount: 25 }));
  await openApp(page, '/Expenses');
  await expect(page.getByText('Coffee beans').first()).toBeVisible();
});
