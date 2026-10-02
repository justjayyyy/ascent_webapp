// Small steps shared by the specs. Every account lives only in the throwaway test database.
import { expect } from '@playwright/test';
import { L } from './i18n.js';

// The password for accounts a test signs up through the screens (seeded ones use the control server's)
export const PASSWORD = 'e2e-pass-123';

let counter = 0;
export const newEmail = (label = 'dana') => `${label}-${process.pid}-${Date.now()}-${counter++}@e2e.test`;

export const sessionCookie = async (context) => (await context.cookies()).find((c) => c.name === 'ascent_session');

/** Closes the first-visit welcome, if it is showing. */
export async function dismissWelcome(page) {
  const start = page.getByRole('button', { name: L('letsGetStarted') });
  if (await start.isVisible().catch(() => false)) await start.click();
}

/** Opens a page of the signed-in app and waits until it is showing. */
export async function openApp(page, path = '/Dashboard') {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login/);
  await dismissWelcome(page);
}

/** Waits until the service worker controls the page, so the app opens without a connection. */
export async function installOffline(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** One of the signed-in person's lists ('transactions', 'plans'...), as the server has it. */
export async function serverList(page, entity) {
  const workspaceId = await page.evaluate(() => localStorage.getItem('ascent_current_workspace_id'));
  const res = await page.request.get(`/api/entities/${entity}?limit=50`, { headers: { 'x-workspace-id': workspaceId } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).data;
}

export const serverTransactions = (page) => serverList(page, 'transactions');
