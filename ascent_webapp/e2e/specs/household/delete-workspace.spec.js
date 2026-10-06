// Deleting a workspace: only the owner sees it, it asks for the name, and the app reopens on a workspace that exists.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

const workspaceIds = async (page) => {
  const res = await page.request.get('/api/workspaces');
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).data.map((w) => String(w.id || w._id));
};

test('the owner deletes the workspace after typing its name, and a member loses it too', async ({ page, owner, member }) => {
  const sam = await member('editor');
  await openApp(page, '/Settings');

  const res = await page.request.get(`/api/workspaces?id=${owner.workspaceId}`);
  const { name } = (await res.json()).data;

  await page.getByRole('button', { name: L('wsDelete') }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: L('wsDeleteTitle', { workspace: name }) })).toBeVisible();

  const confirm = dialog.getByRole('button', { name: L('wsDeleteConfirm') });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(L('wsDeleteTypeName', { workspace: name })).fill(`${name} nope`);
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(L('wsDeleteTypeName', { workspace: name })).fill(name);
  await confirm.click();

  // The app reopens on a fresh workspace of the owner's own
  await expect.poll(() => workspaceIds(page)).not.toContain(owner.workspaceId);
  await expect.poll(async () => (await workspaceIds(page)).length).toBe(1);

  expect(await workspaceIds(sam.page)).not.toContain(owner.workspaceId);
});

test('a member sees no way to delete the workspace', async ({ owner: _owner, member }) => {
  const sam = await member('admin');
  await openApp(sam.page, '/Settings');
  await expect(sam.page.getByRole('button', { name: L('wsLeave') })).toBeVisible();
  await expect(sam.page.getByRole('button', { name: L('wsDelete') })).toHaveCount(0);
});
