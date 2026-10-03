// Google Sign-In for the tests. The page's Google script is a fake (support/network.js) that keeps the app's
// callback; googleSignIn answers it with a credential the API's tokeninfo stub (harness/outbound.mjs) accepts.

/** A credential for `person`; extra fields override Google's answer (aud, email_verified, exp...). */
export const googleCredential = ({ email, name = 'Google Person', ...overrides }) =>
  `e2e.${Buffer.from(JSON.stringify({ email, name, ...overrides })).toString('base64url')}`;

/** Clicks "Continue with Google" and has the fake Google hand the app `credential`. */
export async function googleSignIn(page, credential, buttonName) {
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForFunction(() => typeof window.__gsi?.callback === 'function');
  await page.evaluate((c) => window.__gsi.callback({ credential: c, select_by: 'btn' }), credential);
}
