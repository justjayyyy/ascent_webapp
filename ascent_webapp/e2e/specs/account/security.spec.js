// Getting back in, staying safe: password reset, email confirmation, other devices, lockout, sessions that end.
import jwt from 'jsonwebtoken';
import { test, expect, signIn } from '../../fixtures.js';
import { openApp, sessionCookie } from '../../support/app.js';
import { seedSession, seedUser } from '../../support/control.js';
import { L } from '../../support/i18n.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

const NEW_PASSWORD = 'e2e-new-pass-456';
const me = (request) => request.get('/api/auth/me');

test('forgot password: the emailed link sets a new one, signs in, and ends every other session @critical', async ({ page, mail, openDevice, playwright, baseURL }) => {
  const person = await seedUser();
  const otherDevice = await openDevice(person);
  await openApp(otherDevice, '/Dashboard');

  const login = new LoginScreen(page);
  await login.open();
  await login.email.fill(person.email);
  await login.continue();
  await page.getByRole('button', { name: L('authForgotPassword') }).click();
  await expect(page.getByText(person.email).first()).toBeVisible();

  await page.goto(await mail.link(person.email, '/reset-password/'));
  await page.getByLabel(L('resetNewPassword')).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: L('resetSave') }).click();
  await expect(page).not.toHaveURL(/\/(login|reset-password)/);

  // The old password no longer works, the new one does
  const fresh = await playwright.request.newContext({ baseURL });
  expect((await fresh.post('/api/auth/login', { data: { email: person.email, password: person.password } })).status()).toBe(401);
  expect((await fresh.post('/api/auth/login', { data: { email: person.email, password: NEW_PASSWORD } })).ok()).toBe(true);
  await fresh.dispose();
  // The phone that was signed in is signed out
  expect((await me(otherDevice.request)).status()).toBe(401);
});

test('a reset link works once; used again, or made up, it is refused @critical', async ({ page, mail, playwright, baseURL }) => {
  const person = await seedUser();
  const api = await playwright.request.newContext({ baseURL });
  await api.post('/api/auth/password?action=forgot', { data: { email: person.email } });
  const link = await mail.link(person.email, '/reset-password/');
  await api.dispose();

  await page.goto(link);
  await page.getByLabel(L('resetNewPassword')).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: L('resetSave') }).click();
  await expect(page).not.toHaveURL(/\/reset-password/);

  await page.context().clearCookies();
  for (const path of [link, '/reset-password/not-a-real-token-at-all']) {
    await page.goto(path);
    await page.getByLabel(L('resetNewPassword')).fill('another-pass-789');
    await page.getByRole('button', { name: L('resetSave') }).click();
    await expect(page.getByText(L('resetInvalid'))).toBeVisible();
  }
});

test('confirming the email address from the emailed link @critical', async ({ page, owner, mail }) => {
  await openApp(page, '/Dashboard');
  await page.getByRole('button', { name: L('verifyResend') }).click();
  await page.goto(await mail.link(owner.email, '/verify-email/'));
  await expect(page.getByText(L('verifyDone'))).toBeVisible();
  await expect.poll(async () => (await (await me(page.request)).json()).data.emailVerified).toBe(true);
  await openApp(page, '/Dashboard');
  await expect(page.getByRole('button', { name: L('verifyResend') })).toHaveCount(0);
});

test('signing out the other devices leaves only this one signed in @critical', async ({ page, owner, openDevice }) => {
  const phone = await openDevice(owner);
  await openApp(phone, '/Dashboard');
  await openApp(page, '/Settings');
  await page.getByRole('button', { name: L('setSignOutOthers') }).click();
  await expect(page.getByText(L('setSignedOutOthers')).first()).toBeVisible();

  expect((await me(phone.request)).status()).toBe(401);
  expect((await me(page.request)).ok()).toBe(true);
  // The phone finds out by itself (its next check with the server) and goes to sign in
  await expect(phone).toHaveURL(/\/login/, { timeout: 20_000 });
});

test('after ten wrong passwords the account stops taking passwords for a while @critical', async ({ page, playwright, baseURL, testKey }) => {
  const person = await seedUser();
  const guesser = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': `10.250.${testKey.length % 250}.9` } });
  for (let i = 0; i < 10; i += 1) {
    expect((await guesser.post('/api/auth/login', { data: { email: person.email, password: `wrong-${i}` } })).status()).toBe(401);
  }
  // Even the right password, from another address, is refused now
  const login = new LoginScreen(page);
  await login.open();
  await login.signIn(person);
  await expect(page.getByText(L('authTooManyAttempts')).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await guesser.dispose();
});

test('a sign-in link pointing to another site lands in the app instead @critical', async ({ page }) => {
  const person = await seedUser();
  for (const target of ['https://evil.example/steal', '//evil.example/steal']) {
    // Signed out completely between the two: no cookie, and no session saved on the device
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
    const login = new LoginScreen(page);
    await login.chooseLanguage('en');
    await login.signIn(person);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/Dashboard/);
  }
});

test('the oldest of more than ten signed-in devices is signed out, and told why @critical', async ({ page, context }) => {
  const person = await seedUser();
  await signIn(context, person);
  await openApp(page, '/Dashboard');
  for (let i = 0; i < 10; i += 1) await seedSession(person.userId);

  // The open app finds out at its next check with the server, and says why it asks to sign in again
  await expect(page).toHaveURL(/\/login\?.*reason=session_replaced/, { timeout: 20_000 });
  await expect(page.getByText(L('sessionReplaced'))).toBeVisible();
  expect(await sessionCookie(context)).toBeUndefined();
});

test('an expired session sends the app to sign in @critical', async ({ page, context }) => {
  const person = await seedUser();
  const { sid } = jwt.decode(person.token);
  // Signed with the e2e API's secret (e2e/serve-api.mjs), already expired
  const expired = jwt.sign({ userId: person.userId, email: person.email, sid }, 'e2e-only-secret', { expiresIn: -60 });
  await signIn(context, person, expired);
  await page.goto('/Dashboard');
  await expect(page).toHaveURL(/\/login/);
});
