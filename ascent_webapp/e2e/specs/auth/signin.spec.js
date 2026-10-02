// Signing up, out and in through the real screens, with the session in an HttpOnly cookie.
import { test, expect } from '../../fixtures.js';
import { PASSWORD, dismissWelcome, newEmail, sessionCookie } from '../../support/app.js';
import { L } from '../../support/i18n.js';
import { seedUser } from '../../support/control.js';
import { LoginScreen } from '../../screens/LoginScreen.js';
import { SettingsScreen } from '../../screens/SettingsScreen.js';

test('sign up, sign out and sign back in @smoke @critical', async ({ page, context, mail }) => {
  const email = newEmail();
  const login = new LoginScreen(page);
  await login.open();

  await login.signUp({ email, name: 'Dana Test', password: PASSWORD });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: L('welcomeToAscent') })).toBeVisible();
  await dismissWelcome(page);

  // The session is a cookie scripts cannot read; nothing like a token is left in storage
  expect(await sessionCookie(context)).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('ascent_session');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/token/i);

  // Signing up sends a link to confirm the address
  expect(await mail.link(email, '/verify-email/')).toMatch(/^\/verify-email\/[\w-]+$/);

  // Sign out from Settings: the cookie goes and the app asks to sign in
  await page.goto('/Settings');
  await new SettingsScreen(page).logout();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => sessionCookie(context)).toBeUndefined();

  // Sign back in with the password
  await login.chooseLanguage('en');
  await login.signIn({ email, password: PASSWORD });
  await expect(page).not.toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeTruthy();
});

test('a seeded account signs in with its password @critical', async ({ page, context }) => {
  const person = await seedUser();
  const login = new LoginScreen(page);
  await login.open();
  await login.signIn(person);
  await expect(page).not.toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeTruthy();
});

test('signing out on a slow connection still ends the session and removes the cookie @critical', async ({ page, context, owner: _owner, playwright, baseURL }) => {
  // The logout answer takes a while, as on a phone with a weak signal. The app must wait for it (up to 2.5 s)
  // rather than leave for /login and cut it off, which it used to do within milliseconds and which left the
  // session alive and this device's data in place
  await page.route('**/api/auth/logout', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto('/Settings');
  const { value: token } = await sessionCookie(context);
  await new SettingsScreen(page).logout();

  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => sessionCookie(context)).toBeUndefined();
  // The server no longer accepts that session either
  const oldDevice = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: `ascent_session=${token}` } });
  expect((await oldDevice.get('/api/auth/me')).status()).toBe(401);
  await oldDevice.dispose();
});

test('a wrong password is refused and leaves no session @critical', async ({ page, context }) => {
  const login = new LoginScreen(page);
  await login.open();
  await login.signIn({ email: newEmail('nobody'), password: 'not-the-password' });
  await expect(page.getByRole('alert').or(page.locator('[data-sonner-toast]')).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeUndefined();
});
