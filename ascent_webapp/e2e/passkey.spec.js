// Passkeys end to end, with Chromium's virtual authenticator standing in for Face ID or a fingerprint.
import { test, expect } from '@playwright/test';
import { openApp, signUpViaApi } from './helpers.js';

test('add a passkey in Settings, sign out, sign in with it', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await signUpViaApi(page);
  await openApp(page, '/Settings');
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByText('Passkey added')).toBeVisible();

  // The sign-in page also offers passkeys in the email field's autofill, which this authenticator would
  // answer at once; turned off here, so the button is what signs in
  await page.addInitScript(() => { PublicKeyCredential.isConditionalMediationAvailable = async () => false; });
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name === 'ascent_session')).toBe(false);

  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name === 'ascent_session')).toBe(true);
});

test('Face ID lock: turn it on, reopen the app, unlock with one tap', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await signUpViaApi(page);
  await openApp(page, '/Settings');
  const lock = page.locator('#lock-switch');
  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(lock).toBeChecked();

  // Opened fresh: locked. The automatic first try fails here (as it does on a phone that wants a tap)
  let optionsFetched = 0;
  page.on('response', (r) => { if (r.url().includes('action=login-options')) optionsFetched += 1; });
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const unlock = page.getByRole('button', { name: /Unlock with/ });
  await expect(unlock).toBeVisible();
  // One set of options for the first try, and the next set made ready for the tap
  await expect.poll(() => optionsFetched).toBe(2);
  await expect(unlock).toBeEnabled();

  // Safari opens Face ID only straight after a tap, so the tap must not wait on the server first
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await unlock.click();
  await expect(page.getByText('Ascent is locked')).toBeHidden();
  expect(optionsFetched).toBe(2);
});
