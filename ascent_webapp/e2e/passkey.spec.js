// Passkeys end to end, with Chromium's virtual authenticator standing in for Face ID or a fingerprint.
import { test, expect } from '@playwright/test';
import { openApp, signUpViaApi } from './helpers.js';

test('add a passkey in Settings, sign out, sign in with it', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await signUpViaApi(page);
  await openApp(page, '/Settings');
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByText('Passkey added')).toBeVisible();

  // The sign-in page also offers passkeys in the email field's autofill, which this authenticator would
  // answer at once; it waits for a touch until the button is pressed
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name === 'ascent_session')).toBe(false);

  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
  await expect(page).not.toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name === 'ascent_session')).toBe(true);
});
