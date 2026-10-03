// Talks to the e2e API's control server (e2e/harness/control.mjs): seeding accounts, reading mail, stubs.
import { CONTROL_URL } from './env.js';

export async function control(method, path, body, { attempts = 2 } = {}) {
  let res;
  try {
    res = await fetch(`${CONTROL_URL}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // A connection dropped before the call was answered; every control call is safe to send again
    if (attempts > 1) return control(method, path, body, { attempts: attempts - 1 });
    throw new Error(`control ${method} ${path} could not reach the e2e API: ${err.cause?.code || err.message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`control ${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

/** A new account with its own workspace: { userId, email, name, password, workspaceId, token } */
export const seedUser = (account = {}) => control('POST', '/seed/user', account);

/** A new account that has joined `workspaceId` as `role` ('admin' | 'editor' | 'viewer'), optionally with custom permissions */
export const seedMember = (workspaceId, { role = 'editor', permissions, ...account } = {}) =>
  control('POST', '/seed/member', { workspaceId, role, permissions, ...account });

/** Another signed-in session for an existing account (a second device) */
export const seedSession = (userId) => control('POST', '/seed/session', { userId });

export const mailTo = (to) => control('GET', `/mail?to=${encodeURIComponent(to)}`);
export const setStubs = (test, scenario) => control('PUT', '/stubs', { test, ...scenario });
export const clearStubs = (test) => control('DELETE', `/stubs?test=${encodeURIComponent(test)}`);
export const refusedCalls = (test) => control('GET', `/outbound?test=${encodeURIComponent(test)}`);
/** The test's fake Google account: seed { events, tasks }, or read { events, tasks, codes, revoked, refreshToken } */
export const seedGoogle = (test, data) => control('PUT', '/google', { test, ...data });
export const googleAccount = (test) => control('GET', `/google?test=${encodeURIComponent(test)}`);
