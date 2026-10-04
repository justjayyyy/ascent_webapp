// Invitations at the edges (WS-E02, WS-E03): accepting with no connection, then again once it is back; the same
// invitation open in two tabs, answered in one of them.
import { test, expect } from '../../fixtures.js';
import { newEmail } from '../../support/app.js';
import { seedUser } from '../../support/control.js';
import { L } from '../../support/i18n.js';

/** An invitation from the owner to a person who already has an account, opened on that person's own device */
async function invitedPerson({ owner, api, mail, openDevice }) {
  const email = newEmail('invitee');
  const person = await seedUser({ name: 'Noa Invitee', email });
  await api.call('POST', `/workspaces?id=${owner.workspaceId}&action=invite`, { email, role: 'editor' });
  const link = await mail.link(email, '/accept-invitation/');
  const page = await openDevice(person, { token: person.token });
  const joined = async () => {
    const { data } = await (await page.request.get('/api/workspaces')).json();
    return data.some((w) => String(w.id || w._id) === owner.workspaceId);
  };
  return { page, link, joined };
}

test('accepting with no connection says so and keeps the invitation; accepting again later joins @critical @multiuser', async ({ owner, api, mail, openDevice }) => {
  const { page, link, joined } = await invitedPerson({ owner, api, mail, openDevice });
  await page.goto(link);
  const accept = page.getByRole('button', { name: L('wsAccept'), exact: true });
  await expect(accept).toBeVisible();

  await page.context().setOffline(true);
  await accept.click();
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
  // Still on the invitation, able to try again, and not a member yet
  await expect(accept).toBeEnabled();
  await page.context().setOffline(false);
  expect(await joined()).toBe(false);

  await accept.click();
  await expect.poll(joined, { timeout: 20_000 }).toBe(true);
  // The page moves on to the Dashboard; ending the test halfway through would cut its pages off
  await expect(page).not.toHaveURL(/accept-invitation/);
});

test('the same invitation open in two tabs: accepted in one, the other accepting too joins once @critical @multiuser', async ({ owner, api, mail, openDevice }) => {
  const { page, link, joined } = await invitedPerson({ owner, api, mail, openDevice });
  const second = await page.context().newPage();
  await page.goto(link);
  await second.goto(link);
  await expect(second.getByRole('button', { name: L('wsAccept'), exact: true })).toBeVisible();

  await page.getByRole('button', { name: L('wsAccept'), exact: true }).click();
  await expect.poll(joined, { timeout: 20_000 }).toBe(true);
  // The other tab still shows the invitation: accepting there is not an error, and there is still one membership
  await second.getByRole('button', { name: L('wsAccept'), exact: true }).click();
  await expect(second.locator('[data-sonner-toast]').filter({ hasText: L('wsFailed') })).toHaveCount(0);
  const { data } = await (await page.request.get('/api/workspaces')).json();
  const mine = data.find((w) => String(w.id || w._id) === owner.workspaceId);
  expect(mine.members.filter((m) => m.email && m.email.startsWith('invitee'))).toHaveLength(1);
  await expect(page).not.toHaveURL(/accept-invitation/);
  await expect(second).not.toHaveURL(/accept-invitation/);
});

test('declined in one tab, accepting in the other is refused and does not join @critical @multiuser', async ({ owner, api, mail, openDevice }) => {
  const { page, link, joined } = await invitedPerson({ owner, api, mail, openDevice });
  const second = await page.context().newPage();
  await page.goto(link);
  await second.goto(link);
  await expect(second.getByRole('button', { name: L('wsAccept'), exact: true })).toBeVisible();

  await page.getByRole('button', { name: L('wsDecline') }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: L('wsInviteDeclined') })).toBeVisible();

  await second.getByRole('button', { name: L('wsAccept'), exact: true }).click();
  await expect(second.locator('[data-sonner-toast]').first()).toBeVisible();
  expect(await joined()).toBe(false);
  await expect(page).not.toHaveURL(/accept-invitation/);
});
