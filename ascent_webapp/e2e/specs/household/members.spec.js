// Managing the household: changing what someone may do, removing them, leaving, renaming, and the role rules.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { waitForPageReady } from '../../support/layout.js';

const memberRow = async (api, workspaceId, email) => {
  const { data } = await (await api.send('GET', `/workspaces?id=${workspaceId}`)).json();
  return (data.members || []).find((m) => m.email === email);
};

test('turning an editor into a viewer takes effect on their open app @critical @multiuser', async ({ page, owner, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  await openApp(sam.page, '/Expenses');
  await expect(sam.page.getByRole('button', { name: L('addExpense') }).first()).toBeVisible();

  await openApp(page, '/Settings');
  await page.getByRole('button', { name: 'Sam Partner' }).click();
  await page.getByRole('menuitem', { name: L('wsChangeRole') }).click();
  const dialog = page.getByRole('dialog', { name: L('wsEditAccess') });
  await dialog.getByRole('radio', { name: new RegExp(`^${L('wsViewer')}`) }).click();
  await dialog.getByRole('button', { name: L('wsSave') }).click();
  await expect(page.getByText(L('wsAccessSaved')).first()).toBeVisible();
  await expect.poll(async () => (await memberRow(api, owner.workspaceId, sam.email))?.role).toBe('viewer');

  // Sam's open page loses the add button without a reload
  await expect(sam.page.getByRole('button', { name: L('addExpense') })).toHaveCount(0, { timeout: 20_000 });
});

test('a removed member loses the household and its data @critical @multiuser', async ({ page, owner, api, member }) => {
  await api.create('transactions', expense({ description: 'Household rent', amount: 1800 }));
  const sam = await member('editor', { name: 'Sam Partner' });
  await openApp(sam.page, '/Expenses');
  await expect(sam.page.getByText('Household rent').first()).toBeVisible();

  await openApp(page, '/Settings');
  await page.getByRole('button', { name: 'Sam Partner' }).click();
  await page.getByRole('menuitem', { name: L('wsRemoveMember') }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: L('wsRemoveMember') }).click();
  await expect.poll(() => memberRow(api, owner.workspaceId, sam.email)).toBeUndefined();

  // The API no longer answers Sam about it, and the app stops showing it
  expect((await sam.api.send('GET', '/entities/transactions')).status()).toBeGreaterThanOrEqual(400);
  await sam.page.reload();
  await waitForPageReady(sam.page);
  await expect(sam.page.getByText('Household rent')).toHaveCount(0);
});

test('a member can leave the household; the owner cannot @critical @multiuser', async ({ owner, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  await openApp(sam.page, '/Settings');
  await sam.page.getByRole('button', { name: L('wsLeave') }).click();
  await sam.page.getByRole('alertdialog').getByRole('button', { name: L('wsLeave') }).click();
  // Leaving reloads the app on its home page (which also loses its own "You left the workspace" toast)
  await expect(sam.page).toHaveURL(/\/(Dashboard)?$/);
  await expect.poll(() => memberRow(api, owner.workspaceId, sam.email)).toBeUndefined();

  const ownerLeaves = await api.send('POST', `/workspaces?id=${owner.workspaceId}&action=leave`);
  expect(ownerLeaves.status()).toBe(400);
});

test('renaming the household shows the new name to the other members @critical @multiuser', async ({ page, member }) => {
  const sam = await member('editor');
  await openApp(sam.page, '/Dashboard');
  await openApp(page, '/Settings');
  const name = page.getByLabel(L('workspaceName'));
  await name.fill('The Cohen Household');
  await name.press('Enter');

  await expect(sam.page.getByText('The Cohen Household').first()).toBeVisible({ timeout: 20_000 });
});

test('role rules: an admin cannot make admins or touch the owner; nobody can name a non-member on a row @critical', async ({ owner, api, member }) => {
  const admin = await member('admin', { name: 'Ada Admin' });
  const sam = await member('editor', { name: 'Sam Partner' });
  const samRow = await memberRow(api, owner.workspaceId, sam.email);
  const ownerRow = await memberRow(api, owner.workspaceId, owner.email);

  const promote = await admin.api.send('PUT', `/workspaces?id=${owner.workspaceId}&action=updateMember&memberId=${samRow._id || samRow.id}`, { role: 'admin' });
  expect(promote.status()).toBe(403);
  const demoteOwner = await admin.api.send('PUT', `/workspaces?id=${owner.workspaceId}&action=updateMember&memberId=${ownerRow._id || ownerRow.id}`, { role: 'viewer' });
  expect(demoteOwner.status()).toBe(403);
  const removeOwner = await admin.api.send('DELETE', `/workspaces?id=${owner.workspaceId}&action=removeMember&memberId=${ownerRow._id || ownerRow.id}`);
  expect(removeOwner.status()).toBe(403);
  // An admin may still change an editor's access
  const toViewer = await admin.api.send('PUT', `/workspaces?id=${owner.workspaceId}&action=updateMember&memberId=${samRow._id || samRow.id}`, { role: 'viewer' });
  expect(toViewer.status()).toBe(200);

  const stranger = await api.send('POST', '/entities/transactions', expense({ paidBy: 'not-a-member@e2e.test' }));
  expect(stranger.status()).toBe(400);
});

test('inviting: a malformed address is caught, and someone already in the household is refused @critical', async ({ page, member }) => {
  const sam = await member('editor');
  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('wsInviteMember') }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(L('wsEmailLabel')).fill('not-an-email');
  await dialog.getByRole('button', { name: L('wsSendInvite') }).click();
  await expect(dialog.getByText(L('wsInvalidEmail'))).toBeVisible();

  await dialog.getByLabel(L('wsEmailLabel')).fill(sam.email);
  await dialog.getByRole('button', { name: L('wsSendInvite') }).click();
  await expect(dialog.getByText('This person is already a member')).toBeVisible();
});
