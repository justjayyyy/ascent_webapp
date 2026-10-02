// Signing up, out and in through the real screens, with the session in an HttpOnly cookie.
import { test, expect } from '@playwright/test';
import { PASSWORD, dismissWelcome, newEmail } from './helpers.js';

const sessionCookie = async (context) => (await context.cookies()).find((c) => c.name === 'ascent_session');

test('sign up, sign out and sign back in', async ({ page, context }) => {
  const email = newEmail();
  await page.goto('/login');
  await page.getByRole('radio', { name: 'English' }).click();

  // Sign up: email, name, password
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByPlaceholder('name@example.com').last().fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await page.getByLabel('Full Name').fill('Dana Test');
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).last().click();

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome to Ascent!' })).toBeVisible();
  await dismissWelcome(page);

  // The session is a cookie scripts cannot read; nothing like a token is left in storage
  const cookie = await sessionCookie(context);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('ascent_session');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/token/i);

  // Sign out from Settings: the cookie goes and the app asks to sign in
  await page.goto('/Settings');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => sessionCookie(context)).toBeUndefined();

  // Sign back in with the password
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).last().click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeTruthy();
});

test('a wrong password is refused and leaves no session', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByPlaceholder('name@example.com').fill(newEmail('nobody'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign In' }).last().click();
  await expect(page.getByRole('alert').or(page.locator('[data-sonner-toast]')).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeUndefined();
});
