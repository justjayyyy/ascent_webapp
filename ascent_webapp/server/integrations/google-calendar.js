// Google Calendar and Tasks, with the person's own Google access token (Authorization: Bearer ...).
// A thin proxy over Google's REST APIs: the answers are Google's JSON, as the calendar UI expects.
//   GET    ?action=list-calendars | list-events | get-event | get-colors | list-tasks
//   POST   ?action=create-event | create-task
//   PUT    ?action=update-event          PATCH|PUT ?action=update-task          DELETE ?action=delete-event
import { getTokenFromHeader } from '../lib/jwt.js';

const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const enc = encodeURIComponent;
const DAY = 24 * 60 * 60 * 1000;

export class GoogleApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** A client for one access token. `fetchImpl` is swapped in tests. */
export function googleClient(accessToken, fetchImpl = fetch) {
  return async function call(url, { method = 'GET', body, query } = {}) {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null))}` : '';
    const res = await fetchImpl(url + qs, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new GoogleApiError(res.status, data?.error?.message || `Google API error ${res.status}`);
    return data;
  };
}

const required = (value, name) => {
  if (!value || typeof value !== 'string') throw new GoogleApiError(400, `${name} required`);
  return value;
};

async function firstTaskList(call) {
  const lists = (await call(`${TASKS}/users/@me/lists`, { query: { maxResults: 1 } }))?.items || [];
  if (lists.length) return lists[0].id;
  return (await call(`${TASKS}/users/@me/lists`, { method: 'POST', body: { title: 'My Tasks' } })).id;
}

const ACTIONS = {
  'list-calendars': { method: 'GET', run: async (call) => (await call(`${CAL}/users/me/calendarList`))?.items || [] },
  'list-events': {
    method: 'GET',
    run: async (call, q) => {
      const now = Date.now();
      const data = await call(`${CAL}/calendars/${enc(q.calendarId || 'primary')}/events`, {
        query: {
          timeMin: q.timeMin || new Date(now).toISOString(),
          timeMax: q.timeMax || new Date(now + 30 * DAY).toISOString(),
          maxResults: Math.min(parseInt(q.maxResults, 10) || 50, 2500),
          singleEvents: 'true',
          orderBy: 'startTime',
        },
      });
      return data?.items || [];
    },
  },
  'get-event': { method: 'GET', run: (call, q) => call(`${CAL}/calendars/${enc(q.calendarId || 'primary')}/events/${enc(required(q.eventId, 'eventId'))}`) },
  'get-colors': { method: 'GET', run: async (call) => (await call(`${CAL}/colors`)) || {} },
  'create-event': { method: 'POST', run: (call, q, body) => call(`${CAL}/calendars/${enc(q.calendarId || 'primary')}/events`, { method: 'POST', body }) },
  'update-event': {
    method: 'PUT',
    run: (call, q, body) => call(`${CAL}/calendars/${enc(q.calendarId || 'primary')}/events/${enc(required(q.eventId, 'eventId'))}`, { method: 'PUT', body }),
  },
  'delete-event': {
    method: 'DELETE',
    run: async (call, q) => {
      await call(`${CAL}/calendars/${enc(q.calendarId || 'primary')}/events/${enc(required(q.eventId, 'eventId'))}`, { method: 'DELETE' });
      return { success: true };
    },
  },
  'list-tasks': {
    method: 'GET',
    run: async (call) => {
      // Tasks are a nice-to-have next to events: without the scope, or on any failure, show none
      try {
        const lists = (await call(`${TASKS}/users/@me/lists`, { query: { maxResults: 100 } }))?.items || [];
        const perList = await Promise.all(lists.map(async (list) => {
          try {
            const items = (await call(`${TASKS}/lists/${enc(list.id)}/tasks`, { query: { maxResults: 100, showCompleted: 'true', showHidden: 'true' } }))?.items || [];
            return items.map((task) => ({ ...task, taskListId: list.id, taskListTitle: list.title }));
          } catch {
            return [];
          }
        }));
        return perList.flat();
      } catch {
        return [];
      }
    },
  },
  'create-task': {
    method: 'POST',
    run: async (call, q, body) => call(`${TASKS}/lists/${enc(q.tasklistId || (await firstTaskList(call)))}/tasks`, { method: 'POST', body }),
  },
  'update-task': {
    method: ['PATCH', 'PUT'],
    run: (call, q, body) =>
      call(`${TASKS}/lists/${enc(required(q.tasklistId, 'tasklistId'))}/tasks/${enc(required(q.taskId, 'taskId'))}`, { method: 'PATCH', body }),
  },
};

export function createHandler(fetchImpl = fetch) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'Google access token required' });

    const action = ACTIONS[req.query?.action];
    if (!action) return res.status(400).json({ error: `Invalid action. Use: ${Object.keys(ACTIONS).join(', ')}` });
    const methods = [].concat(action.method);
    if (!methods.includes(req.method)) return res.status(405).json({ error: `${methods[0]} method required` });

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : undefined;
      return res.json(await action.run(googleClient(token, fetchImpl), req.query, body));
    } catch (err) {
      const status = err instanceof GoogleApiError ? err.status : 502;
      if (status === 401) return res.status(401).json({ error: 'Invalid or expired Google token. Please re-authenticate.' });
      if (status === 403) return res.status(403).json({ error: 'Access denied. Please ensure calendar permissions are granted.' });
      if (status === 404) return res.status(404).json({ error: 'Calendar or event not found.' });
      if (status === 400) return res.status(400).json({ error: err.message });
      console.error('[Google Calendar]', req.query.action, err?.message);
      return res.status(502).json({ error: 'Calendar API error' });
    }
  };
}

export default createHandler();
