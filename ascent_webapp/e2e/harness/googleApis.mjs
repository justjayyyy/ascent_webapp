// Google's OAuth token endpoint, Calendar and Tasks, faked in memory for the calendar tests. Each test has its own
// Google account here (keyed by the test, like the stub scenarios), which a test can seed and read back through the
// control server. The `calendar` scenario breaks it on purpose:
//   'ok'         everything works
//   'revoked'    the person took access back in their Google account: tokens are refused (invalid_grant / 401)
//   'no-refresh' Google grants access without a refresh token (it only hands one out the first time)
//   'down'       Calendar answers 500
const accounts = new Map(); // test → account

const fresh = () => ({
  seq: 0,
  events: [], // { id, calendarId, summary, start, end, ... } as Google keeps them
  lists: [{ id: 'list-1', title: 'My Tasks' }],
  tasks: [], // { id, listId, title, notes, due, status }
  codes: [], // authorization codes exchanged
  revoked: [], // tokens the API asked Google to revoke
});

const accountOf = (test) => {
  const key = test || 'none';
  if (!accounts.has(key)) accounts.set(key, fresh());
  return accounts.get(key);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });
const bodyOf = (init) => {
  try { return JSON.parse(init?.body || '{}'); } catch { return {}; }
};
const formOf = (init) => Object.fromEntries(new URLSearchParams(String(init?.body || '')));
const accessToken = (test) => `e2e-access-${test}`;
const refreshToken = (test) => `e2e-refresh-${test}`;

/** oauth2.googleapis.com: /token (code and refresh grants) and /revoke */
export function googleOAuth({ calendar = 'ok' }, url, init, test) {
  const account = accountOf(test);
  const form = formOf(init);
  if (url.pathname === '/revoke') {
    account.revoked.push(form.token);
    return json({});
  }
  if (url.pathname !== '/token') return json({ error: 'not stubbed' }, 404);
  if (form.grant_type === 'authorization_code') {
    if (!String(form.code).startsWith('e2e-code')) return json({ error: 'invalid_grant' }, 400);
    account.codes.push(form.code);
    return json({
      access_token: accessToken(test), expires_in: 3600, token_type: 'Bearer', scope: 'calendar tasks',
      ...(calendar === 'no-refresh' ? {} : { refresh_token: refreshToken(test) }),
    });
  }
  if (form.grant_type === 'refresh_token') {
    if (calendar === 'revoked' || form.refresh_token !== refreshToken(test)) return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: accessToken(test), expires_in: 3600, token_type: 'Bearer' });
  }
  return json({ error: 'unsupported_grant_type' }, 400);
}

const COLORS = Object.fromEntries(
  ['#a4bdfc', '#7ae7bf', '#dbadff', '#ff887c', '#fbd75b', '#ffb878', '#46d6db', '#e1e1e1', '#5484ed', '#51b749', '#dc2127']
    .map((background, i) => [String(i + 1), { background, foreground: '#1d1d1d' }]),
);

const startOf = (event) => new Date(event.start?.dateTime || event.start?.date).getTime();

function refused(scenario, init, test) {
  if (scenario.calendar === 'revoked') return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
  if (init?.headers?.Authorization !== `Bearer ${accessToken(test)}`) return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
  if (scenario.calendar === 'down') return json({ error: { code: 500, message: 'Backend Error' } }, 500);
  return null;
}

/** www.googleapis.com/calendar/v3 */
export function googleCalendar(scenario, url, init, test) {
  const no = refused(scenario, init, test);
  if (no) return no;
  const account = accountOf(test);
  const method = init?.method || 'GET';
  const path = url.pathname.replace(/^\/calendar\/v3/, '');
  if (path === '/colors') return json({ kind: 'calendar#colors', event: COLORS, calendar: {} });
  if (path === '/users/me/calendarList') return json({ items: [{ id: 'primary', summary: 'Primary', primary: true }] });
  const [, calendarId, eventId] = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/) || [];
  if (!calendarId) return json({ error: { code: 404, message: 'Not Found' } }, 404);
  const calendar = decodeURIComponent(calendarId);
  const find = () => account.events.find((e) => e.id === decodeURIComponent(eventId) && e.calendarId === calendar);
  if (!eventId && method === 'GET') {
    const from = Date.parse(url.searchParams.get('timeMin')) || -Infinity;
    const to = Date.parse(url.searchParams.get('timeMax')) || Infinity;
    const items = account.events.filter((e) => e.calendarId === calendar && startOf(e) >= from && startOf(e) < to).sort((a, b) => startOf(a) - startOf(b));
    return json({ kind: 'calendar#events', items });
  }
  if (!eventId && method === 'POST') {
    account.seq += 1;
    const event = { ...bodyOf(init), id: `ev-${account.seq}`, calendarId: calendar, status: 'confirmed' };
    account.events.push(event);
    return json(event);
  }
  const event = find();
  if (!event) return json({ error: { code: 404, message: 'Not Found' } }, 404);
  if (method === 'GET') return json(event);
  if (method === 'PUT') {
    const { id, calendarId: _c, ...rest } = event;
    Object.keys(rest).forEach((k) => delete event[k]);
    Object.assign(event, bodyOf(init), { id, calendarId: calendar });
    return json(event);
  }
  if (method === 'DELETE') {
    account.events = account.events.filter((e) => e !== event);
    return noContent();
  }
  return json({ error: { code: 405, message: 'Method not allowed' } }, 405);
}

/** tasks.googleapis.com/tasks/v1 */
export function googleTasks(scenario, url, init, test) {
  const no = refused(scenario, init, test);
  if (no) return no;
  const account = accountOf(test);
  const method = init?.method || 'GET';
  const path = url.pathname.replace(/^\/tasks\/v1/, '');
  if (path === '/users/@me/lists') {
    if (method === 'POST') {
      account.seq += 1;
      const list = { id: `list-${account.seq}`, title: bodyOf(init).title };
      account.lists.push(list);
      return json(list);
    }
    return json({ items: account.lists });
  }
  const [, listId, taskId] = path.match(/^\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/) || [];
  if (!listId) return json({ error: { code: 404, message: 'Not Found' } }, 404);
  const list = decodeURIComponent(listId);
  if (!taskId && method === 'GET') return json({ items: account.tasks.filter((t) => t.listId === list).map(({ listId: _l, ...t }) => t) });
  if (!taskId && method === 'POST') {
    account.seq += 1;
    const task = { status: 'needsAction', ...bodyOf(init), id: `task-${account.seq}`, listId: list };
    account.tasks.push(task);
    return json(task);
  }
  const task = account.tasks.find((t) => t.id === decodeURIComponent(taskId) && t.listId === list);
  if (!task) return json({ error: { code: 404, message: 'Not Found' } }, 404);
  if (method === 'PATCH') {
    Object.assign(task, bodyOf(init));
    return json(task);
  }
  return json({ error: { code: 405, message: 'Method not allowed' } }, 405);
}

/** Puts events and tasks in this test's Google account. Events need start/end as Google writes them. */
export function seedGoogle(test, { events = [], tasks = [] } = {}) {
  const account = accountOf(test);
  events.forEach((e) => { account.seq += 1; account.events.push({ calendarId: 'primary', status: 'confirmed', ...e, id: `ev-${account.seq}` }); });
  tasks.forEach((t) => { account.seq += 1; account.tasks.push({ listId: 'list-1', status: 'needsAction', ...t, id: `task-${account.seq}` }); });
  return googleAccount(test);
}

export const googleAccount = (test) => {
  const { seq: _s, ...account } = accountOf(test);
  return { ...account, refreshToken: refreshToken(test) };
};
export const clearGoogle = (test) => accounts.delete(test || 'none');
