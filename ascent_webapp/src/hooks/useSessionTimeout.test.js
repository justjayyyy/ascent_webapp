import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const logout = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ ascent: { auth: { logout } } }));
vi.mock('sonner', () => ({ toast: { info: () => {}, warning: () => {} } }));
const { useSessionTimeout } = await import('./useSessionTimeout');

beforeEach(() => { vi.useFakeTimers(); logout.mockReset(); });
afterEach(() => vi.useRealTimers());

test('signs out after ten idle minutes', () => {
  renderHook(() => useSessionTimeout(true));
  vi.advanceTimersByTime(10 * 60 * 1000);
  expect(logout).toHaveBeenCalledTimes(1);
});

test('waits while changes on the device have not synced, then signs out', () => {
  let waiting = true;
  const mustWait = () => waiting;
  renderHook(() => useSessionTimeout(true, (k) => k, mustWait));
  vi.advanceTimersByTime(15 * 60 * 1000);
  expect(logout).not.toHaveBeenCalled();
  waiting = false;
  vi.advanceTimersByTime(60 * 1000);
  expect(logout).toHaveBeenCalledTimes(1);
});
