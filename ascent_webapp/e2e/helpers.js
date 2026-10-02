// Shared steps for the browser tests. Every account lives only in the throwaway test database.
import { expect, test } from '@playwright/test';

// A generated password for test accounts (never a real one)
export const PASSWORD = 'e2e-pass-123';

let counter = 0;
export const newEmail = (label = 'dana') => `${label}-${Date.now()}-${counter++}@e2e.test`;

/** Creates an account through the API. The browser context gets the session cookie; the app is told it is signed in. */
export async function signUpViaApi(page, { email = newEmail(), name = 'Dana Test' } = {}) {
  // The app's own origin: the API only accepts changes from it
  const origin = new URL(test.info().project.use.baseURL).origin;
  const res = await page.request.post('/api/auth/register', {
    data: { email, password: PASSWORD, full_name: name, language: 'en', theme: 'dark' },
    headers: { Origin: origin },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.addInitScript(() => { try { localStorage.setItem('ascent_signed_in', '1'); } catch { /* not yet */ } });
  return { email };
}

/** Closes the first-visit welcome, if it is showing. */
export async function dismissWelcome(page) {
  const start = page.getByRole('button', { name: "Let's Get Started!" });
  if (await start.isVisible().catch(() => false)) await start.click();
}

/** Opens a page of the signed-in app and waits for it to settle. */
export async function openApp(page, path = '/Dashboard') {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login/);
  await dismissWelcome(page);
}

/** The signed-in person's transactions, as the server has them. */
export async function serverTransactions(page) {
  const workspaceId = await page.evaluate(() => localStorage.getItem('ascent_current_workspace_id'));
  const res = await page.request.get('/api/entities/transactions?limit=50', { headers: { 'x-workspace-id': workspaceId } });
  expect(res.ok()).toBe(true);
  return (await res.json()).data;
}
