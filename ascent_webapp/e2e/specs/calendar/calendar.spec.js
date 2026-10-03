// The calendar (§3.16): connecting Google once for the account, events and tasks kept in Google, and what happens
// when Google takes access back or fails. Google is faked on the API's side (e2e/harness/googleApis.mjs), and its
// sign-in popup in the browser (support/network.js); the test plays the popup by handing over a code.
import { format } from 'date-fns';
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { googleAccount, seedGoogle } from '../../support/control.js';
import { L } from '../../support/i18n.js';

const toast = (page, key) => page.locator('[data-sonner-toast]').filter({ hasText: L(key) }).first();
const at = (hour) => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

async function openCalendar(page, path = '/Dashboard') {
  await openApp(page, path);
  await page.getByRole('navigation', { name: L('mainNavigation') }).getByRole('button', { name: L('calendar') }).click();
  const calendar = page.getByRole('dialog', { name: L('calendar') });
  await expect(calendar).toBeVisible();
  return calendar;
}

// The toolbar's button (the agenda beside the month has one too)
const newEvent = (calendar) => calendar.getByRole('button', { name: L('newEvent') }).first();

/** Connect with Google, and Google's popup handing back a code */
async function connect(page, calendar) {
  await calendar.getByRole('button', { name: L('connectWithGoogle') }).click();
  await expect.poll(() => page.evaluate(() => !!window.__gsiCode)).toBe(true);
  return page.evaluate(() => {
    const { client_id: clientId, scope } = window.__gsiCode;
    window.__gsiCode.callback({ code: 'e2e-code-1' });
    return { clientId, scope };
  });
}

test('connecting Google once shows its events, and disconnecting gives the access back @critical', async ({ page, testKey, owner: _owner }) => {
  await seedGoogle(testKey, { events: [{ summary: 'Dentist', start: { dateTime: at(10) }, end: { dateTime: at(11) } }] });
  const calendar = await openCalendar(page);

  const asked = await connect(page, calendar);
  expect(asked.clientId).toBe('e2e-client.apps.googleusercontent.com');
  expect(asked.scope).toContain('https://www.googleapis.com/auth/calendar');
  await expect(toast(page, 'calendarConnected')).toBeVisible();
  await expect(calendar.getByText('Dentist').first()).toBeVisible();
  expect((await googleAccount(testKey)).codes).toEqual(['e2e-code-1']);

  await calendar.getByRole('button', { name: L('disconnect') }).click();
  await expect(toast(page, 'calendarDisconnected')).toBeVisible();
  await expect(calendar.getByRole('button', { name: L('connectWithGoogle') })).toBeVisible();
  // Google was told to drop the grant
  const google = await googleAccount(testKey);
  await expect.poll(async () => (await googleAccount(testKey)).revoked).toEqual([google.refreshToken]);
});

test('the connection belongs to the account: another device opens the calendar already connected @critical', async ({ page, testKey, owner, openDevice }) => {
  await seedGoogle(testKey, { events: [{ summary: 'Parents evening', start: { dateTime: at(18) }, end: { dateTime: at(19) } }] });
  await connect(page, await openCalendar(page));
  await expect(toast(page, 'calendarConnected')).toBeVisible();

  const laptop = await openDevice(owner);
  const calendar = await openCalendar(laptop);
  await expect(calendar.getByText('Parents evening').first()).toBeVisible();
  await expect(calendar.getByRole('button', { name: L('connectWithGoogle') })).toHaveCount(0);
});

test('an event is created, renamed and deleted in Google @critical', async ({ page, testKey, owner: _owner }) => {
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calendarConnected')).toBeVisible();

  await newEvent(calendar).click();
  let composer = page.getByRole('dialog', { name: L('newEvent') });
  await composer.getByLabel(L('eventTitle')).fill('Car service');
  await composer.getByLabel(L('location')).fill('Garage');
  await composer.getByRole('button', { name: L('create') }).click();
  await expect(toast(page, 'eventCreated')).toBeVisible();
  await expect.poll(async () => (await googleAccount(testKey)).events.map((e) => [e.summary, e.location])).toEqual([['Car service', 'Garage']]);

  await calendar.getByText('Car service').first().click();
  composer = page.getByRole('dialog', { name: L('editEvent') });
  await composer.getByLabel(L('eventTitle')).fill('Car service and MOT');
  await composer.getByRole('button', { name: L('save') }).click();
  await expect(toast(page, 'eventUpdated')).toBeVisible();
  await expect.poll(async () => (await googleAccount(testKey)).events.map((e) => [e.summary, e.location])).toEqual([['Car service and MOT', 'Garage']]);

  await calendar.getByText('Car service and MOT').first().click();
  await page.getByRole('dialog', { name: L('editEvent') }).getByRole('button', { name: L('delete') }).click();
  await expect(toast(page, 'eventDeleted')).toBeVisible();
  await expect(calendar.getByText('Car service and MOT')).toHaveCount(0);
  expect((await googleAccount(testKey)).events).toEqual([]);
});

test('a task is added to Google Tasks and marked done @critical', async ({ page, testKey, owner: _owner }) => {
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calendarConnected')).toBeVisible();

  await newEvent(calendar).click();
  await page.getByRole('dialog', { name: L('newEvent') }).getByRole('tab', { name: L('calTask') }).click();
  const composer = page.getByRole('dialog', { name: L('newTask') });
  await composer.getByLabel(L('taskTitle')).fill('Renew passport');
  await composer.getByLabel(L('dueDate')).fill(format(new Date(), 'yyyy-MM-dd'));
  await composer.getByRole('button', { name: L('create') }).click();
  await expect(toast(page, 'taskCreated')).toBeVisible();
  await expect.poll(async () => (await googleAccount(testKey)).tasks.map((t) => [t.title, t.status])).toEqual([['Renew passport', 'needsAction']]);

  await calendar.getByText('Renew passport').first().click();
  await page.getByRole('dialog', { name: 'Renew passport' }).getByRole('button', { name: L('calMarkDone') }).click();
  await expect.poll(async () => (await googleAccount(testKey)).tasks.map((t) => t.status)).toEqual(['completed']);
});

test('an event needs a title @critical', async ({ page, testKey, owner: _owner }) => {
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calendarConnected')).toBeVisible();
  await newEvent(calendar).click();
  await page.getByRole('dialog', { name: L('newEvent') }).getByRole('button', { name: L('create') }).click();
  await expect(toast(page, 'eventTitleRequired')).toBeVisible();
  expect((await googleAccount(testKey)).events).toEqual([]);
});

test('access taken back in Google ends the connection, and the calendar asks to connect again @critical', async ({ page, testKey, stubs, owner: _owner }) => {
  await seedGoogle(testKey, { events: [{ summary: 'Dentist', start: { dateTime: at(10) }, end: { dateTime: at(11) } }] });
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calendarConnected')).toBeVisible();

  // Once the first load is done (its event is on screen)
  await expect(calendar.getByText('Dentist').first()).toBeVisible();
  const refresh = calendar.getByRole('button', { name: L('refresh') });
  await expect(refresh).toBeEnabled();
  await stubs.set({ calendar: 'revoked' });
  await refresh.click();
  await expect(toast(page, 'calendarSessionExpired')).toBeVisible();
  await expect(calendar.getByRole('button', { name: L('connectWithGoogle') })).toBeVisible();
  // Still signed in to the app: only the calendar connection ended
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/Dashboard/);
});

test('Google failing says the change was not saved @critical', async ({ page, testKey, stubs, owner: _owner }) => {
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calendarConnected')).toBeVisible();

  await stubs.set({ calendar: 'down' });
  await newEvent(calendar).click();
  const composer = page.getByRole('dialog', { name: L('newEvent') });
  await composer.getByLabel(L('eventTitle')).fill('Haircut');
  await composer.getByRole('button', { name: L('create') }).click();
  await expect(toast(page, 'calSaveFailed')).toBeVisible();
  // The form stays open with what was typed, to try again
  await expect(composer.getByLabel(L('eventTitle'))).toHaveValue('Haircut');
  expect((await googleAccount(testKey)).events).toEqual([]);
});

test('when Google grants no lasting access, the calendar asks to connect once more @critical', async ({ page, testKey, stubs, owner: _owner }) => {
  await stubs.set({ calendar: 'no-refresh' });
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  await expect(toast(page, 'calConnectTryAgain')).toBeVisible();
  await expect(calendar.getByRole('button', { name: L('connectWithGoogle') })).toBeVisible();
  // The half-grant was dropped, so the next try is a first time again and brings a refresh token
  await expect.poll(async () => (await googleAccount(testKey)).revoked.length).toBe(1);
});

test('day, week and month, moving through time, and a layer switched off @critical', async ({ page, testKey, owner: _owner }) => {
  await seedGoogle(testKey, {
    events: [{ summary: 'Dentist', start: { dateTime: at(10) }, end: { dateTime: at(11) } }],
    tasks: [{ title: 'Renew passport', due: `${format(new Date(), 'yyyy-MM-dd')}T00:00:00.000Z` }],
  });
  const calendar = await openCalendar(page);
  await connect(page, calendar);
  const view = calendar.locator('main');
  await expect(view.getByText('Dentist').first()).toBeVisible();

  const tabs = calendar.getByRole('tablist', { name: L('calView') });
  for (const key of ['week', 'day', 'month']) {
    await tabs.getByRole('tab', { name: L(key) }).click();
    await expect(tabs.getByRole('tab', { name: L(key) })).toHaveAttribute('aria-selected', 'true');
    await expect(view.getByText('Dentist').first()).toBeVisible();
  }
  // The next day has nothing; Today comes back to it
  await tabs.getByRole('tab', { name: L('day') }).click();
  await calendar.getByRole('button', { name: L('calNext'), exact: true }).click();
  await expect(view.getByText('Dentist')).toHaveCount(0);
  await calendar.getByRole('button', { name: L('today'), exact: true }).first().click();
  await expect(view.getByText('Dentist').first()).toBeVisible();

  // Tasks off: the task goes, the event stays, and the choice is kept for next time
  await tabs.getByRole('tab', { name: L('month') }).click();
  await expect(view.getByText('Renew passport').first()).toBeVisible();
  const tasks = calendar.getByRole('switch', { name: L('calTasks') });
  await tasks.click();
  await expect(tasks).toHaveAttribute('aria-checked', 'false');
  await expect(view.getByText('Renew passport')).toHaveCount(0);
  await expect(view.getByText('Dentist').first()).toBeVisible();
  await page.reload();
  const again = await openCalendar(page);
  await expect(again.getByRole('switch', { name: L('calTasks') })).toHaveAttribute('aria-checked', 'false');
});

test('when Google cannot be reached, the calendar says so, and Connect tries again @critical', async ({ page, owner: _owner }) => {
  // No Google script: neither the stand-in the tests install nor Google's own
  await page.addInitScript(() => { Object.defineProperty(window, 'google', { get: () => undefined, set: () => {}, configurable: false }); });
  await page.route(/accounts\.google\.com\/gsi\/client/, (route) => route.abort('internetdisconnected'));
  const calendar = await openCalendar(page);
  await expect(calendar.getByText(L('calGoogleOffline'))).toBeVisible();
  await calendar.getByRole('button', { name: L('connectWithGoogle') }).click();
  await expect(toast(page, 'calGoogleLoading')).toBeVisible();
});
