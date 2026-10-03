// Bringing someone into the household: an emailed invitation, opened by someone without an account yet.
import { test, expect } from '../../fixtures.js';
import { PASSWORD, newEmail, openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

test('an emailed invitation: they sign up from the link, join, and see the household’s money @smoke @critical @multiuser', async ({ page, owner, api, mail, openDevice }) => {
  await api.create('transactions', expense({ description: 'Owner’s groceries', amount: 210 }));
  const partnerEmail = newEmail('partner');

  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('wsInviteMember') }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(L('wsEmailLabel')).fill(partnerEmail);
  await dialog.getByRole('button', { name: L('wsSendInvite') }).click();
  await expect(page.getByText(L('wsInviteSent')).first()).toBeVisible();
  // With the toast, the dialog turns to its "sent" view, with the link to share
  await expect(dialog.getByRole('heading', { name: L('wsInviteSent') })).toBeVisible();

  // The partner, on their own phone, opens the link from the email
  const link = await mail.link(partnerEmail, '/accept-invitation/');
  const partner = await openDevice(null);
  await partner.goto(link);
  await partner.getByRole('link', { name: L('wsContinueEmail') }).click();
  const login = new LoginScreen(partner);
  await login.chooseLanguage('en');
  await login.signUp({ email: partnerEmail, name: 'Sam Partner', password: PASSWORD });

  // Signing up joins the household straight away
  const { data: workspaces } = await (await page.request.get('/api/workspaces')).json();
  const name = workspaces.find((w) => String(w.id || w._id) === owner.workspaceId).name;
  await expect(partner.getByText(L('wsJoined', { workspace: name }))).toBeVisible();
  await expect.poll(() => partner.evaluate(() => localStorage.getItem('ascent_current_workspace_id'))).toBe(owner.workspaceId);
  await openApp(partner, '/Expenses');
  await expect(partner.getByText('Owner’s groceries').first()).toBeVisible();

  // The owner's household now lists them as an editor
  const { data: mine } = await (await page.request.get('/api/workspaces')).json();
  const member = mine.find((w) => String(w.id || w._id) === owner.workspaceId).members.find((m) => m.email === partnerEmail);
  expect(member).toMatchObject({ status: 'accepted', role: 'editor' });
});
