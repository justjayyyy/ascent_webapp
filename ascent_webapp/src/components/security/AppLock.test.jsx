// The Face ID lock: when it locks, and that nothing behind it can be reached.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: null, loginWithPasskey: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ t: (k) => k, user: auth.user }) }));
vi.mock('@/lib/haptics', () => ({ haptic: () => {} }));
vi.mock('@/components/AscentLogo', () => ({ default: () => null }));

const { AppLockProvider } = await import('./AppLock');
const { setLockPrefs, markUnlocked, LOCK_AFTER_WEEK } = await import('@/lib/appLock');

const app = () => (
  <AppLockProvider>
    <div id="root-content">money</div>
  </AppLockProvider>
);

beforeEach(() => {
  auth.user = { id: 'u1', full_name: 'Dana K' };
  auth.loginWithPasskey.mockReset().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
});
afterEach(() => { document.getElementById('root')?.remove(); vi.useRealTimers(); });

test('with the lock off nothing is locked', () => {
  render(app());
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('opened fresh with the lock on, the app is locked and the page behind is inert', () => {
  setLockPrefs('u1', { enabled: true });
  render(app());
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(document.getElementById('root').inert).toBe(true);
});

test('the lock also closes when the account arrives after the app mounted', () => {
  setLockPrefs('u1', { enabled: true });
  const user = auth.user;
  auth.user = null;
  const view = render(app());
  expect(screen.queryByRole('dialog')).toBeNull();
  auth.user = user;
  view.rerender(app());
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('a session already unlocked in this tab is not locked again on reload', () => {
  setLockPrefs('u1', { enabled: true });
  markUnlocked();
  render(app());
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('it locks after being in the background longer than chosen', () => {
  setLockPrefs('u1', { enabled: true, after: 60 });
  markUnlocked();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  render(app());
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(document.documentElement.hasAttribute('data-privacy-curtain')).toBe(true);
  vi.setSystemTime(Date.now() + 30_000);
  visibility.mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.queryByRole('dialog')).toBeNull();
  visibility.mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  vi.setSystemTime(Date.now() + 61_000);
  visibility.mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByRole('dialog')).toBeTruthy();
  visibility.mockRestore();
});

const DAY = 24 * 60 * 60 * 1000;
// The app closed and opened again: this tab's memory is gone, the device's remains
const relaunch = () => sessionStorage.clear();

test('with "1 week" (the default), reopening the app within the week after an unlock does not lock', () => {
  setLockPrefs('u1', { enabled: true });
  vi.useFakeTimers({ toFake: ['Date'] });
  markUnlocked();
  relaunch();
  vi.setSystemTime(Date.now() + 6 * DAY);
  render(app());
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('with "1 week", the first opening after the week asks again', () => {
  setLockPrefs('u1', { enabled: true });
  vi.useFakeTimers({ toFake: ['Date'] });
  markUnlocked();
  relaunch();
  vi.setSystemTime(Date.now() + 7 * DAY + 1000);
  render(app());
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('with "1 week", switching away and back within the week does not lock', () => {
  setLockPrefs('u1', { enabled: true, after: LOCK_AFTER_WEEK });
  markUnlocked();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  render(app());
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  vi.setSystemTime(Date.now() + 2 * DAY);
  visibility.mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { vi.advanceTimersByTime(15 * 60 * 1000); }); // nor after idling
  expect(screen.queryByRole('dialog')).toBeNull();
  visibility.mockRestore();
});

test('a lock set up before "1 week" existed, its time never picked, moves to the week', () => {
  localStorage.setItem('ascent_lock', JSON.stringify({ u1: { enabled: true, after: 60, credentialIds: [] } }));
  vi.useFakeTimers({ toFake: ['Date'] });
  markUnlocked();
  relaunch();
  vi.setSystemTime(Date.now() + DAY);
  render(app());
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a time picked in Settings is kept: "1 min" still locks on reopening', () => {
  setLockPrefs('u1', { enabled: true, after: 60 });
  markUnlocked();
  relaunch();
  render(app());
  expect(screen.getByRole('dialog')).toBeTruthy();
});
