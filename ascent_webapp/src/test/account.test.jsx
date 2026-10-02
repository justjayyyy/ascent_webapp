// Account care through the real app against an in-memory API: forgotten passwords, email confirmation,
// deleting an account, and keeping a workspace whose owner left.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeFetch, seedData } from './fakeApi';
import { translations } from '@/lib/translations';

const idb = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({
  get: async (k) => idb.get(k),
  set: async (k, v) => { idb.set(k, v); },
  del: async (k) => { idb.delete(k); },
  keys: async () => [...idb.keys()],
}));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
// NumberFlow is a custom element jsdom cannot run; show the formatted number instead
vi.mock('@number-flow/react', () => ({
  default: ({ value, locales, format, className }) => <span className={className}>{new Intl.NumberFormat(locales, format).format(value)}</span>,
}));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }));
// ECharts needs a real canvas; the charts' data is covered by the pages' own numbers
vi.mock('@/components/charts/EChart', () => ({
  default: () => <div data-testid="chart" />,
  useChartTokens: () => ({ series: ['#111', '#222', '#333', '#444', '#555'], text: '#000', muted: '#666', grid: '#eee', card: '#fff' }),
  withAlpha: (c) => c,
}));

const { default: App } = await import('@/App');
const { queryClientInstance } = await import('@/lib/query-client');

let api;
let consoleErrors;
beforeEach(() => {
  idb.clear();
  queryClientInstance.clear();
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleErrors.push(args.map(String).join(' ')));
});
afterEach(() => vi.unstubAllGlobals());

function openApp(path, { signedIn = true, change } = {}) {
  const data = seedData();
  change?.(data);
  api = fakeFetch(data);
  vi.stubGlobal('fetch', vi.fn(api.fetchImpl));
  if (signedIn) localStorage.setItem('ascent_signed_in', '1');
  window.history.pushState({}, '', path);
  return render(<App />);
}
const en = translations.en;
const callTo = (path, action) => api.calls.find((c) => c.path === path && (!action || c.query.action === action));

test('a forgotten password is sent from the sign-in page, for the email typed there', async () => {
  const user = userEvent.setup();
  localStorage.setItem('ascent_login_lang', 'en');
  openApp('/login', { signedIn: false });
  await user.type(await screen.findByLabelText(en.email), 'dana@x.test');
  await user.click(screen.getByRole('button', { name: en.authContinue }));
  await user.click(await screen.findByRole('button', { name: en.authForgotPassword }));
  await waitFor(() => expect(callTo('/api/auth/password', 'forgot')).toBeTruthy());
  expect(callTo('/api/auth/password', 'forgot').body).toEqual({ email: 'dana@x.test' });
  expect(await screen.findByText(en.authResetSent.replace('{email}', 'dana@x.test'))).toBeTruthy();
}, 20000);

test('a reset link sets the new password and opens the app signed in', async () => {
  const user = userEvent.setup();
  localStorage.setItem('ascent_login_lang', 'en');
  const token = 'a'.repeat(43);
  openApp(`/reset-password/${token}`, { signedIn: false });
  const field = await screen.findByLabelText(en.resetNewPassword);
  await user.type(field, '123');
  await user.click(screen.getByRole('button', { name: en.resetSave }));
  expect(await screen.findByText(en.authPasswordShort)).toBeTruthy();
  expect(callTo('/api/auth/password', 'reset')).toBeUndefined();
  await user.type(field, '4567');
  await user.click(screen.getByRole('button', { name: en.resetSave }));
  await waitFor(() => expect(window.location.pathname).toBe('/Dashboard'));
  expect(callTo('/api/auth/password', 'reset').body).toEqual({ token, password: '1234567' });
  expect(localStorage.getItem('ascent_signed_in')).toBe('1');
}, 20000);

test('an expired reset link says so and points back to sign in', async () => {
  const user = userEvent.setup();
  localStorage.setItem('ascent_login_lang', 'en');
  openApp(`/reset-password/${'bad'.padEnd(43, 'x')}`, { signedIn: false });
  await user.type(await screen.findByLabelText(en.resetNewPassword), 'secret12');
  await user.click(screen.getByRole('button', { name: en.resetSave }));
  expect(await screen.findByText(en.resetInvalid)).toBeTruthy();
  expect(screen.getByRole('link', { name: en.resetBackToSignIn }).getAttribute('href')).toBe('/login');
}, 20000);

test('the confirmation link confirms the email once', async () => {
  const token = 'c'.repeat(43);
  openApp(`/verify-email/${token}`, { signedIn: false });
  expect(await screen.findByText(en.verifyDone)).toBeTruthy();
  expect(api.calls.filter((c) => c.path === '/api/auth/verify-email')).toHaveLength(1);
  expect(callTo('/api/auth/verify-email', 'confirm').body).toEqual({ token });
}, 20000);

test('an unconfirmed email shows a banner that can send the link again; a confirmed one does not', async () => {
  const user = userEvent.setup();
  openApp('/Dashboard', { change: (d) => { d.me.emailVerified = false; } });
  const resend = await screen.findByRole('button', { name: en.verifyResend });
  await user.click(resend);
  expect(await screen.findByText(en.verifySent)).toBeTruthy();
  expect(callTo('/api/auth/verify-email', 'send')).toBeTruthy();
}, 20000);

test('no confirmation banner for accounts that are confirmed or from before confirmation existed', async () => {
  openApp('/Dashboard');
  await screen.findAllByText(/Rome|Car loan|₪/);
  expect(screen.queryByRole('button', { name: en.verifyResend })).toBeNull();
}, 20000);

test('when the owner deleted their account, a member is asked and can keep the workspace', async () => {
  const user = userEvent.setup();
  openApp('/Dashboard', {
    change: (d) => {
      const ws = d.workspaces[0];
      ws.ownerId = 'gone';
      ws.ownerLeft = { email: 'old@x.test', name: 'Avi' };
      ws.members[0].role = 'editor';
    },
  });
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(en.olTitle.replace('{name}', 'Avi'))).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: en.olKeep }));
  await waitFor(() => expect(callTo('/api/workspaces', 'claim')).toBeTruthy());
  expect(callTo('/api/workspaces', 'claim').query.id).toBe('w1');
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}, 20000);

test('deleting the account needs the email typed, then signs out', async () => {
  const user = userEvent.setup();
  openApp('/Settings');
  await screen.findAllByDisplayValue('Dana');
  await user.click(screen.getByRole('button', { name: en.delTitle }));
  const dialog = await screen.findByRole('alertdialog');
  const confirm = within(dialog).getByRole('button', { name: en.delConfirm });
  expect(confirm.disabled).toBe(true);
  await user.type(within(dialog).getByLabelText(en.delTypeEmail.replace('{email}', 'dana@x.test')), 'dana@x.test');
  expect(confirm.disabled).toBe(false);
  await user.click(confirm);
  await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/auth/me')).toBe(true));
  expect(api.calls.find((c) => c.method === 'DELETE' && c.path === '/api/auth/me').body).toEqual({ confirm: 'dana@x.test' });
  await waitFor(() => expect(localStorage.getItem('ascent_signed_in')).toBeNull());
}, 20000);

test('signing out of the other devices keeps this one signed in', async () => {
  const user = userEvent.setup();
  openApp('/Settings');
  await screen.findAllByDisplayValue('Dana');
  await user.click(screen.getByRole('button', { name: en.setSignOutOthers }));
  expect(await screen.findByText(en.setSignedOutOthers)).toBeTruthy();
  expect(callTo('/api/auth/logout').query.scope).toBe('others');
  expect(localStorage.getItem('ascent_signed_in')).toBe('1');
}, 20000);

test('a locked sign-in says why, in the page language', async () => {
  const user = userEvent.setup();
  localStorage.setItem('ascent_login_lang', 'he');
  const he = translations.he;
  api = fakeFetch(seedData());
  vi.stubGlobal('fetch', vi.fn(async (input, init) => (String(input).endsWith('/api/auth/login')
    ? new Response(JSON.stringify({ success: false, error: 'Too many wrong passwords', retryAfter: 900 }), { status: 429, headers: { 'content-type': 'application/json' } })
    : api.fetchImpl(input, init))));
  window.history.pushState({}, '', '/login');
  render(<App />);
  await user.type(await screen.findByLabelText(he.email), 'dana@x.test');
  await user.click(screen.getByRole('button', { name: he.authContinue }));
  await user.type(await screen.findByLabelText(he.password), 'whatever');
  await user.click(screen.getByRole('button', { name: he.signIn }));
  expect(await screen.findByText(he.authTooManyAttempts)).toBeTruthy();
}, 20000);
