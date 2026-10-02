// The suite's test(): import { test, expect } from './fixtures.js' (or '../fixtures.js') instead of @playwright/test.
//
// Every test gets its own identity (a test header and a client address of its own, so rate limits never
// carry over), stubbed third parties, and fails if a request tried to leave the machine or a page threw.
// Accounts are seeded straight into the throwaway database: sign-up through the API is rate limited per
// address, and only the sign-up tests need to go through it.
//
//   owner       a new account with its own household, signed in on `page`
//   member      (role, permissions?) → another account in the owner's household, on a device of its own
//   openDevice  (person) → a new page for an existing account, signed in on another device
//   mail        the emails the API sent: mail.waitFor(to), mail.link(to, '/reset-password/')
//   stubs       third-party scenarios for this test only: await stubs.set({ rates: 'down' })
import { test as base, expect } from '@playwright/test';
import { clearStubs, mailTo, refusedCalls, seedMember, seedSession, seedUser, setStubs } from './support/control.js';
import { guardContext, identityHeaders, watchPageErrors } from './support/network.js';

export { expect };

const SESSION_COOKIE = 'ascent_session';

/** Signs `person` in on `context`: their session cookie, and the app told which household to open. */
export async function signIn(context, person, token = person.token) {
  const { origin, hostname } = new URL(test.info().project.use.baseURL);
  await context.addCookies([{
    name: SESSION_COOKIE, value: token, domain: hostname, path: '/api',
    httpOnly: true, sameSite: 'Strict', secure: origin.startsWith('https:'),
    expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }]);
  await context.addInitScript((workspaceId) => {
    try {
      localStorage.setItem('ascent_signed_in', '1');
      if (!localStorage.getItem('ascent_current_workspace_id')) localStorage.setItem('ascent_current_workspace_id', workspaceId);
    } catch { /* storage unavailable */ }
  }, person.workspaceId);
}

export const test = base.extend({
  // Unique per test, retry and repeat
  testKey: async ({}, use, info) => {
    await use(`${info.testId}.${info.repeatEachIndex}.${info.retry}`);
  },

  extraHTTPHeaders: async ({ extraHTTPHeaders, testKey }, use) => {
    await use({ ...extraHTTPHeaders, ...identityHeaders(testKey) });
  },

  context: async ({ context, testKey }, use) => {
    const refused = await guardContext(context);
    const pageErrors = watchPageErrors(context);
    await use(context);
    expect(refused, 'requests from the browser that tried to leave the machine').toEqual([]);
    expect(pageErrors, 'uncaught errors in the page').toEqual([]);
    expect(await refusedCalls(testKey), 'third-party calls from the API that have no stub').toEqual([]);
  },

  owner: async ({ context }, use) => {
    const person = await seedUser({ name: 'Dana Owner' });
    await signIn(context, person);
    await use(person);
  },

  openDevice: async ({ browser, testKey }, use) => {
    const opened = [];
    await use(async (person, { token, ...options } = {}) => {
      const context = await browser.newContext({ ...options, extraHTTPHeaders: identityHeaders(testKey, opened.length + 1) });
      const refused = await guardContext(context);
      const pageErrors = watchPageErrors(context);
      opened.push({ context, refused, pageErrors });
      await signIn(context, person, token || (await seedSession(person.userId)).token);
      return context.newPage();
    });
    for (const { context, refused, pageErrors } of opened) {
      await context.close();
      expect(refused, 'requests from another device that tried to leave the machine').toEqual([]);
      expect(pageErrors, 'uncaught errors on another device').toEqual([]);
    }
  },

  member: async ({ owner, openDevice }, use) => {
    await use(async (role = 'editor', { permissions, name = `Sam ${role}`, ...account } = {}) => {
      const person = await seedMember(owner.workspaceId, { role, permissions, name, ...account });
      return { ...person, page: await openDevice(person, { token: person.token }) };
    });
  },

  mail: async ({}, use) => {
    const waitFor = async (to, { subject } = {}) => {
      let found;
      await expect.poll(async () => {
        found = (await mailTo(to)).filter((m) => !subject || (subject instanceof RegExp ? subject.test(m.subject) : m.subject === subject)).at(-1);
        return !!found;
      }, { message: `an email to ${to}` }).toBe(true);
      return found;
    };
    /** The path of the newest link in the newest email to `to` whose path starts with `prefix` */
    const link = async (to, prefix, options) => {
      const message = await waitFor(to, options);
      const url = [...message.html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => new URL(m[0])).find((u) => u.pathname.startsWith(prefix));
      if (!url) throw new Error(`No ${prefix} link in "${message.subject}" to ${to}`);
      return url.pathname + url.search;
    };
    await use({ inbox: mailTo, waitFor, link });
  },

  stubs: async ({ testKey }, use) => {
    await use({ set: (scenario) => setStubs(testKey, scenario) });
    await clearStubs(testKey);
  },
});
