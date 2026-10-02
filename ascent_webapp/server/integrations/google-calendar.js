// Google Calendar and Tasks for the signed-in person. A thin proxy over Google's REST APIs: the answers are
// Google's JSON, as the calendar UI expects.
//   GET    ?action=list-calendars | list-events | get-event | get-colors | list-tasks
//   POST   ?action=create-event | create-task
//   PUT    ?action=update-event          PATCH|PUT ?action=update-task          DELETE ?action=delete-event
// The connection belongs to the account (lib/calendarTokens.js):
//   GET    ?action=status       POST ?action=connect { code }       POST ?action=disconnect
// A request carrying a Google access token (Authorization: Bearer ...) uses that token instead: deployments
// without GOOGLE_CLIENT_SECRET connect in the browser for an hour at a time.
import { getTokenFromHeader } from '../lib/jwt.js';
import { authMiddleware } from '../middleware/auth.js';
import CalendarLink from '../models/CalendarLink.js';
import {
  CalendarAuthError, accessTokenFor, calendarClient, exchangeCode, forgetAccess, rememberAccess, revoke, seal,
} from '../lib/calendarTokens.js';

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

const links = {
  find: (userId) => CalendarLink.findOne({ userId }).lean(),
  save: (userId, refreshToken, scope) => CalendarLink.updateOne({ userId }, { $set: { refreshToken, scope } }, { upsert: true }),
  remove: (userId) => CalendarLink.deleteOne({ userId }),
};

const notConnected = (res) => res.status(401).json({ error: 'Google Calendar is not connected', code: 'CALENDAR_NOT_CONNECTED' });

const ACCOUNT = {
  status: {
    method: 'GET',
    run: async ({ user, store, client }) => ({ available: !!client, connected: !!(await store.find(user._id)) }),
  },
  connect: {
    method: 'POST',
    run: async ({ user, store, client, body, fetchImpl }) => {
      const grant = await exchangeCode(body?.code, { client, fetchImpl });
      await store.save(user._id, seal(grant.refreshToken), grant.scope);
      rememberAccess(user._id, grant.accessToken, grant.expiresIn);
      return { connected: true };
    },
  },
  disconnect: {
    method: 'POST',
    run: async ({ user, store, fetchImpl }) => {
      const link = await store.find(user._id);
      forgetAccess(user._id);
      if (link) {
        await store.remove(user._id);
        await revoke(link.refreshToken, { fetchImpl });
      }
      return { connected: false };
    },
  },
};

function sendGoogleError(req, res, err) {
  const status = err instanceof GoogleApiError ? err.status : 502;
  if (status === 401) return res.status(401).json({ error: 'Invalid or expired Google token. Please re-authenticate.' });
  if (status === 403) return res.status(403).json({ error: 'Access denied. Please ensure calendar permissions are granted.' });
  if (status === 404) return res.status(404).json({ error: 'Calendar or event not found.' });
  if (status === 400) return res.status(400).json({ error: err.message });
  console.error('[Google Calendar]', req.query.action, err?.message);
  return res.status(502).json({ error: 'Calendar API error' });
}

/** `fetchImpl` reaches Google; the options swap the sign-in check, the stored connections and the OAuth client in tests. */
export function createHandler(fetchImpl = fetch, { authenticate = authMiddleware, store = links, client = calendarClient } = {}) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const name = req.query?.action;
    const action = ACTIONS[name] || ACCOUNT[name];
    if (!action) return res.status(400).json({ error: `Invalid action. Use: ${[...Object.keys(ACTIONS), ...Object.keys(ACCOUNT)].join(', ')}` });
    const methods = [].concat(action.method);
    if (!methods.includes(req.method)) return res.status(405).json({ error: `${methods[0]} method required` });
    const body = req.body && typeof req.body === 'object' ? req.body : undefined;

    // A Google token from the browser: the hour-long connection
    const browserToken = !ACCOUNT[name] && getTokenFromHeader(req);
    if (browserToken) {
      try {
        return res.json(await action.run(googleClient(browserToken, fetchImpl), req.query, body));
      } catch (err) {
        return sendGoogleError(req, res, err);
      }
    }

    const user = await authenticate(req, res);
    if (!user) return undefined;
    const oauth = client();

    if (ACCOUNT[name]) {
      try {
        return res.json(await action.run({ user, store, client: oauth, body, fetchImpl }));
      } catch (err) {
        // A code Google refuses is a bad request here: a 401 would read as the app session ending
        if (err instanceof CalendarAuthError) return res.status(err.status === 401 ? 400 : err.status).json({ error: err.code, code: err.code });
        console.error('[Google Calendar]', name, err?.message);
        return res.status(500).json({ error: 'Calendar connection failed' });
      }
    }

    const link = await store.find(user._id);
    if (!link) return notConnected(res);
    const run = async () => action.run(googleClient(await accessTokenFor(user._id, link.refreshToken, { client: oauth, fetchImpl }), fetchImpl), req.query, body);
    try {
      try {
        return res.json(await run());
      } catch (err) {
        // A remembered access token Google no longer takes: once more with a fresh one
        if (!(err instanceof GoogleApiError && err.status === 401)) throw err;
        forgetAccess(user._id);
        return res.json(await run());
      }
    } catch (err) {
      if (err instanceof CalendarAuthError) {
        // The person took access back in their Google account: this connection is over
        if (err.status === 401) {
          await store.remove(user._id);
          return notConnected(res);
        }
        console.error('[Google Calendar] token', err.code);
        return res.status(err.status === 501 ? 501 : 502).json({ error: 'Calendar API error', code: err.code });
      }
      return sendGoogleError(req, res, err);
    }
  };
}

export default createHandler();
