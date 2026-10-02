import { expect, test, vi } from 'vitest';

vi.mock('idb-keyval', () => ({ del: async () => {}, get: async () => undefined, set: async () => {}, keys: async () => [] }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: null }), useWorkspaceId: () => null }));
const { clearDeviceData } = await import('./deviceData');

test("signing out removes the cached session and the Google Calendar connection", async () => {
  localStorage.setItem('ascent_cached_session', '{}');
  localStorage.setItem('googleCalendarToken', 'ya29.secret');
  localStorage.setItem('googleCalendarTokenExpiry', String(Date.now() + 1000));
  localStorage.setItem('ascent_palette', 'gold');
  await clearDeviceData();
  expect(localStorage.getItem('ascent_cached_session')).toBeNull();
  expect(localStorage.getItem('googleCalendarToken')).toBeNull();
  expect(localStorage.getItem('googleCalendarTokenExpiry')).toBeNull();
  expect(localStorage.getItem('ascent_palette')).toBe('gold'); // a device preference, not account data
});
