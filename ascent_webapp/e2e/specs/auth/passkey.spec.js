// Passkeys end to end, with Chromium's virtual authenticator standing in for Face ID or a fingerprint.
import { test, expect } from '../../fixtures.js';
import { openApp, sessionCookie } from '../../support/app.js';
import { L, Lre } from '../../support/i18n.js';
import { SettingsScreen } from '../../screens/SettingsScreen.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'the virtual authenticator needs Chromium (CDP)');

async function virtualAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  // Settings asks once, as it opens, whether the device has Face ID or a fingerprint reader; a phone always has
  // its own, but the virtual one can take a moment to be reported, so wait until the browser says so
  await page.goto('/login');
  await expect.poll(() => page.evaluate(() => PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())).toBe(true);
  return { cdp, authenticatorId };
}

/** Adds a passkey on this device in Settings; the owner is Dana Owner */
async function addPasskeyHere(page) {
  await openApp(page, '/Settings');
  const settings = new SettingsScreen(page);
  await expect(settings.addPasskey).toBeEnabled();
  await settings.addPasskey.click();
  await expect(page.getByText(L('secAdded'))).toBeVisible();
  // The sign-in page also offers passkeys in the email field's autofill, which this authenticator would
  // answer at once; turned off here, so what the page itself does is what signs in
  await page.addInitScript(() => { PublicKeyCredential.isConditionalMediationAvailable = async () => false; });
  return settings;
}

test('add a passkey in Settings, sign out, sign in with it @critical', async ({ page, context, owner: _owner }) => {
  await virtualAuthenticator(context, page);
  const settings = await addPasskeyHere(page);
  await settings.logout();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => sessionCookie(context)).toBeUndefined();

  // The passkey made here is remembered, so the page greets its owner and leads with it, by the
  // device's own name. Signed out on purpose, so Face ID waits for the tap.
  await expect(page.getByRole('heading', { name: L('authWelcomeBackName', { name: 'Dana' }) })).toBeVisible();
  await expect(page.getByRole('button', { name: L('passkeySignIn') })).toBeHidden();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: Lre('authSignInWith') }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(await sessionCookie(context)).toBeTruthy();
});

test('back after the session ran out: Face ID opens by itself', async ({ page, context, owner: _owner }) => {
  await virtualAuthenticator(context, page);
  await addPasskeyHere(page);
  // The session ends without the person choosing to sign out
  await context.clearCookies();
  await page.goto('/login?reason=session_expired');
  // Nobody taps: the new session comes from Face ID opening by itself
  await expect.poll(() => sessionCookie(context)).toBeTruthy();
  await expect(page).not.toHaveURL(/\/login/);
});

test('"Not Dana?" puts the sign-in page back to its plain self', async ({ page, context, owner: _owner }) => {
  await virtualAuthenticator(context, page);
  const settings = await addPasskeyHere(page);
  await settings.logout();
  await page.getByRole('button', { name: L('authNotYou', { name: 'Dana' }) }).click();
  await expect(page.getByRole('heading', { name: L('authWelcomeBackName', { name: 'Dana' }) })).toBeHidden();
  await expect(page.getByRole('button', { name: L('passkeySignIn') })).toBeVisible();
  // and the name is not shown here again
  await page.reload();
  await expect(page.getByRole('button', { name: Lre('authSignInWith') })).toBeVisible();
  await expect(page.getByText('Dana')).toBeHidden();
});

test('Face ID lock: turn it on, reopen the app, unlock with one tap @critical', async ({ page, context, owner: _owner }) => {
  const { cdp, authenticatorId } = await virtualAuthenticator(context, page);
  await openApp(page, '/Settings');
  const { lockSwitch } = new SettingsScreen(page);
  await expect(lockSwitch).toBeEnabled();
  await lockSwitch.click();
  await expect(lockSwitch).toBeChecked();

  // Opened fresh: locked. The automatic first try fails here (as it does on a phone that wants a tap)
  let optionsFetched = 0;
  page.on('response', (r) => { if (r.url().includes('action=login-options')) optionsFetched += 1; });
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const unlock = page.getByRole('button', { name: Lre('lockUnlockWith') });
  await expect(unlock).toBeVisible();
  // One set of options for the first try, and the next set made ready for the tap
  await expect.poll(() => optionsFetched).toBe(2);
  await expect(unlock).toBeEnabled();

  // Safari opens Face ID only straight after a tap, so the tap must not wait on the server first
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await unlock.click();
  await expect(page.getByText(L('lockTitle'))).toBeHidden();
  expect(optionsFetched).toBe(2);
});
