// Continue with Google: Google's script is a fake and its token check a stub (support/google.js), so these run
// without Google; everything after the credential (the API's checks, accounts, the session) is real.
import { test, expect } from '../../fixtures.js';
import { newEmail, sessionCookie } from '../../support/app.js';
import { seedUser } from '../../support/control.js';
import { googleCredential, googleSignIn } from '../../support/google.js';
import { L } from '../../support/i18n.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

async function continueWithGoogle(page, credential) {
  await new LoginScreen(page).open();
  await googleSignIn(page, credential, L('continueWithGoogle'));
}

test('a new person continues with Google: an account and a household are made, and they are in @critical', async ({ page, context }) => {
  const email = newEmail('google');
  await continueWithGoogle(page, googleCredential({ email, name: 'Gal Google' }));
  await expect(page).not.toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeTruthy();
  const { data: me } = await (await page.request.get('/api/auth/me')).json();
  expect(me).toMatchObject({ email, full_name: 'Gal Google' });
});

test('Google with the email of an existing account signs into that account, not a new one @critical', async ({ page }) => {
  const person = await seedUser();
  await continueWithGoogle(page, googleCredential({ email: person.email }));
  await expect(page).not.toHaveURL(/\/login/);
  const { data: me } = await (await page.request.get('/api/auth/me')).json();
  expect(String(me._id || me.id)).toBe(person.userId);
});

test('a Google token made for another app, or with an unverified email, is refused @critical', async ({ page, context }) => {
  for (const overrides of [{ aud: 'someone-elses-app.apps.googleusercontent.com' }, { email_verified: 'false' }]) {
    await continueWithGoogle(page, googleCredential({ email: newEmail('google'), ...overrides }));
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(await sessionCookie(context)).toBeUndefined();
  }
});
