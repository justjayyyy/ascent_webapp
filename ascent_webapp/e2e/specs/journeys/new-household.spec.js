// Journey: a new household, from signing up to two people keeping the books together.
import { test, expect } from '../../fixtures.js';
import { PASSWORD, dismissWelcome, newEmail, openApp } from '../../support/app.js';
import { apiFor } from '../../support/api.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

test('new household: sign up, log the month, invite a partner who joins and adds to it, seen live @smoke @critical @multiuser', async ({ page, mail, openDevice }) => {
  // A whole story in one test: long by design, so it gets three times the usual time
  test.slow();
  const ownerEmail = newEmail('owner');
  const partnerEmail = newEmail('partner');
  let workspaceId;

  await test.step('sign up through the screens', async () => {
    const login = new LoginScreen(page);
    await login.open();
    await login.signUp({ email: ownerEmail, name: 'Dana Owner', password: PASSWORD });
    await expect(page).not.toHaveURL(/\/login/);
    await dismissWelcome(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ascent_current_workspace_id'))).toBeTruthy();
    workspaceId = await page.evaluate(() => localStorage.getItem('ascent_current_workspace_id'));
  });

  await test.step('log this month: income and two expenses', async () => {
    await openApp(page, '/Income');
    const money = new ExpensesScreen(page);
    // Default category names are translated in src/lib/translations.js, not the string files
    await money.addExpense({ kind: 'income', amount: 6000, description: 'Consulting', category: 'Freelance' });
    await openApp(page, '/Expenses');
    await money.addExpense({ amount: 1500, description: 'Rent share' });
    await money.addExpense({ amount: 85, description: 'Pharmacy' });
    await expect.poll(async () => (await apiFor(page.request, workspaceId).list('transactions')).length).toBe(3);
  });

  await test.step('the Dashboard works out what is safe to spend', async () => {
    await openApp(page, '/Dashboard');
    await expect(page.getByLabel(new RegExp(`${L('stsLeft')} \\$4,415$`))).toBeVisible();
  });

  await test.step('invite the partner by email', async () => {
    await openApp(page, '/Settings');
    await page.getByRole('button', { name: L('wsInviteMember') }).first().click();
    await page.getByRole('dialog').getByLabel(L('wsEmailLabel')).fill(partnerEmail);
    await page.getByRole('dialog').getByRole('button', { name: L('wsSendInvite') }).click();
    await expect(page.getByText(L('wsInviteSent')).first()).toBeVisible();
  });

  const partner = await openDevice(null);

  await test.step('the partner signs up from the link and joins', async () => {
    await partner.goto(await mail.link(partnerEmail, '/accept-invitation/'));
    await partner.getByRole('link', { name: L('wsContinueEmail') }).click();
    const login = new LoginScreen(partner);
    await login.chooseLanguage('en');
    await login.signUp({ email: partnerEmail, name: 'Sam Partner', password: PASSWORD });
    await expect(partner.getByText(/Welcome! You joined/)).toBeVisible();
    // Joining switches the partner to the household
    await expect.poll(() => partner.evaluate(() => localStorage.getItem('ascent_current_workspace_id'))).toBe(workspaceId);
  });


  await test.step('the partner adds an expense; the owner’s open page shows it without a reload', async () => {
    await openApp(page, '/Expenses');
    await openApp(partner, '/Expenses');
    await expect(partner.getByText('Rent share').first()).toBeVisible();
    await new ExpensesScreen(partner).addExpense({ amount: 42, description: 'Groceries by Sam' });
    await expect(page.getByText('Groceries by Sam').first()).toBeVisible({ timeout: 15_000 });
  });
});
