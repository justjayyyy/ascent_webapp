// The keyboard alone (WCAG 2.1.1, 2.4.3, 2.4.7): signing in, adding an expense, dialogs that keep and return focus,
// and focus that can always be seen.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { seedUser } from '../../support/control.js';
import { L } from '../../support/i18n.js';
import { expectFocusIn, focusIsVisible, focused, tabTo, unseen } from '../../support/keyboard.js';

test('signing in with the keyboard alone @critical @a11y', async ({ page }) => {
  const person = await seedUser();
  await page.goto('/login');
  await tabTo(page, new RegExp(`^${L('email')}`));
  await page.keyboard.type(person.email);
  await page.keyboard.press('Enter');
  await expectFocusIn(page, () => true);
  const password = page.getByLabel(L('password'), { exact: true });
  await expect(password).toBeVisible();
  await password.focus();
  await page.keyboard.type(person.password);
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/\/login/);
});

test('adding an expense with the keyboard alone, and focus coming back afterwards @critical @a11y', async ({ page, api }) => {
  await openApp(page, '/Expenses');
  const trigger = await tabTo(page, L('addExpense'));
  expect(await page.evaluate(focusIsVisible), 'focus on the add button can be seen').toBe(true);
  await page.keyboard.press('Enter');

  // Focus moves into the dialog, and Tab stays inside it
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectFocusIn(page, (f) => !!f?.inDialog, 'focus is in the dialog');
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    expect((await page.evaluate(focused))?.inDialog, 'Tab keeps focus inside the open dialog').toBe(true);
  }

  await dialog.getByLabel(new RegExp(`^${L('amount')}`)).focus();
  await page.keyboard.type('23');
  await tabTo(page, L('addTransaction'));
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await api.list('transactions')).map((t) => t.amount)).toEqual([23]);
  // Back where it started
  await expectFocusIn(page, (f) => f?.name === trigger.name, 'focus returns to the add button');
});

test('Escape closes a dialog and focus returns to what opened it @critical @a11y', async ({ page, owner: _owner }) => {
  await openApp(page, '/Plans');
  await page.getByRole('button', { name: L('planKind_vacation') }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expectFocusIn(page, (f) => f?.name.includes(L('planKind_vacation')), 'focus returns to the button that opened it');
});

test('every control reached with Tab on the Dashboard shows that it has focus @critical @a11y', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const stops = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(focused));
  }
  expect(unseen(stops), 'controls whose focus cannot be seen').toEqual([]);
});
