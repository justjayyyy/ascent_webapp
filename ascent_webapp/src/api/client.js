import { TOKEN_KEY, WORKSPACE_KEY, SESSION_CACHE_KEY } from '@/lib/storageKeys';

// The Ascent API client. Every call answers with the `data` of `{ success, data }`, or throws an Error
// carrying `status` (0 = never reached the server), `data` (the error body) and `isNetworkError`.
const API_URL = import.meta.env.VITE_API_URL || '/api';
const REQUEST_TIMEOUT = 30000;
// Reads are retried on a dropped connection or server trouble; writes are not, unless the caller makes
// them safe to repeat (offline queue rows carry dedupe keys) and asks for it.
const READ_RETRIES = 2;


const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  remove: (key) => { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

export const getToken = () => storage.get(TOKEN_KEY);
const setToken = (token) => storage.set(TOKEN_KEY, token);
const removeToken = () => storage.remove(TOKEN_KEY);

const enc = encodeURIComponent;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiError(message, status, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

/** Sends one request. options: { method, body, headers, timeout, retries } */
export async function request(endpoint, options = {}) {
  const { timeout = REQUEST_TIMEOUT, retries, method = 'GET', headers: extraHeaders, ...init } = options;
  const maxRetries = retries ?? (method === 'GET' ? READ_RETRIES : 0);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send(endpoint, { ...init, method, extraHeaders, timeout });
    } catch (err) {
      const retryable = err.isNetworkError || err.status >= 500;
      if (!retryable || attempt >= maxRetries) throw err;
      await wait(1000 * (attempt + 1));
    }
  }
}

async function send(endpoint, { method, body, extraHeaders, timeout, ...init }) {
  const headers = { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...extraHeaders };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const workspaceId = storage.get(WORKSPACE_KEY);
  if (workspaceId && !headers['x-workspace-id']) headers['x-workspace-id'] = workspaceId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, { ...init, method, body, headers, signal: controller.signal });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    throw apiError(timedOut ? 'The server took too long to answer.' : 'Could not reach the server.', timedOut ? 408 : 0, { isNetworkError: true });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (response.status === 401 && (data?.code === 'SESSION_REPLACED' || data?.code === 'SESSION_INVALID')) {
    // Signed in on another device (or an old token): this device has to sign in again
    removeToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?reason=${data.code === 'SESSION_REPLACED' ? 'session_replaced' : 'session_expired'}`;
    }
  }

  if (!response.ok) {
    const message = data?.error || (response.status === 429 ? 'Too many requests. Please try again later.' : `Request failed with status ${response.status}`);
    throw apiError(message, response.status, { data, retryAfter: data?.retryAfter });
  }
  if (!data || typeof data !== 'object' || !('data' in data)) {
    throw apiError('The server sent an unexpected answer.', response.status, { data });
  }
  return data.data;
}

const json = (method, body, opts = {}) => ({ ...opts, method, body: JSON.stringify(body) });

// Device language and theme, sent on sign-up so new accounts start in the person's own settings
export function systemPrefs() {
  try {
    // A language picked on the sign-in page wins over the device's
    const lang = (storage.get('ascent_login_lang') || navigator.language || 'en').slice(0, 2).toLowerCase();
    return {
      language: ['en', 'he', 'ru'].includes(lang) ? lang : 'en',
      theme: window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    };
  } catch {
    return {};
  }
}

const signedIn = (result) => {
  if (!result?.token || !result?.user) throw apiError('The server sent an unexpected answer.', 200, { data: result });
  setToken(result.token);
  return { user: result.user, isFirstLogin: result.isFirstLogin === true };
};

const toLogin = (redirectUrl) => {
  window.location.href = redirectUrl ? `/login?redirect=${enc(redirectUrl)}` : '/login';
};

const auth = {
  login: async (email, password) => signedIn(await request('/auth/login', json('POST', { email, password }))),
  register: async (email, password, full_name) =>
    signedIn(await request('/auth/register', json('POST', { email, password, full_name, ...systemPrefs() }))),
  // `credential` is the ID token Google Identity Services hands the page
  googleLogin: async (credential) => signedIn(await request('/auth/google', json('POST', { credential, ...systemPrefs() }))),

  // Face ID / fingerprint: sign in, or unlock this device's session, with a passkey
  async passkeyLogin({ autofill = false } = {}) {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const optionsJSON = await request('/auth/passkey?action=login-options', json('POST', {}));
    const response = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
    const result = await request('/auth/passkey?action=login-verify', json('POST', { response }));
    setToken(result.token);
    return { ...result, credentialId: response.id };
  },

  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', json('PUT', data)),

  logout(redirectUrl) {
    removeToken();
    storage.remove(SESSION_CACHE_KEY);
    // Forget what this device kept for offline use (bounded, so sign-out never hangs)
    Promise.race([
      Promise.all([
        import('@/components/notes/notesSync').then((m) => m.clearNotesStorage()),
        import('@/lib/offline/deviceData').then((m) => m.clearDeviceData()),
      ]),
      wait(800),
    ]).catch(() => {}).finally(() => toLogin(redirectUrl));
  },

  redirectToLogin: toLogin,
  // The token was refused: drop it without leaving the page
  forgetToken: removeToken,
  isAuthenticated: () => !!getToken(),
};

/**
 * CRUD for one workspace entity. Every method takes an optional last `opts` ({ headers, timeout, retries }),
 * e.g. `{ headers: { 'x-workspace-id': id } }` to pin the workspace instead of using the current one.
 */
export function createEntity(path) {
  const base = `/entities/${path}`;
  const listUrl = (sort, limit, filters = {}) => {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    return `${base}?${params}`;
  };
  return {
    list: (sort = '-created_date', limit = 1000, opts) => request(listUrl(sort, limit), opts),
    filter: (filters, sort = '-created_date', limit = 1000, opts) => request(listUrl(sort, limit, filters), opts),
    get: (id, opts) => request(`${base}?id=${enc(id)}&_single=true`, opts),
    create: (data, opts) => request(base, json('POST', data, opts)),
    bulkCreate: (items, opts) => request(base, json('POST', items, opts)),
    update: (id, data, opts) => request(`${base}?id=${enc(id)}`, json('PUT', data, opts)),
    delete: (id, opts) => request(`${base}?id=${enc(id)}`, { ...opts, method: 'DELETE' }),
    // One entry of a list field (plan items, loan payments); see src/lib/listEntries.js
    changeEntry: (id, list, change, opts) => request(`${base}?id=${enc(id)}&list=${enc(list)}`, json('PATCH', change, opts)),
  };
}

const entities = {
  Account: createEntity('accounts'),
  Position: createEntity('positions'),
  DayTrade: createEntity('day-trades'),
  ExpenseTransaction: createEntity('transactions'),
  Budget: createEntity('budgets'),
  Category: createEntity('categories'),
  Card: createEntity('cards'),
  FinancialGoal: createEntity('goals'),
  Plan: createEntity('plans'),
  DashboardWidget: createEntity('dashboard-widgets'),
  PageLayout: createEntity('page-layouts'),
  PortfolioSnapshot: createEntity('snapshots'),
  PortfolioTransaction: createEntity('portfolio-transactions'),
  Settlement: createEntity('settlements'),
  Commitment: createEntity('commitments'),
  Note: {
    ...createEntity('notes'),
    // Permanently delete everything the caller has in the trash
    emptyTrash: () => request('/entities/notes?action=empty-trash', { method: 'DELETE' }),
    // File attachments: bytes travel as base64 inside JSON
    uploadFile: (noteId, file) => request(`/entities/notes?action=file&id=${enc(noteId)}`, json('POST', file)),
    getFile: (noteId, fileId) => request(`/entities/notes?action=file&id=${enc(noteId)}&fileId=${enc(fileId)}`),
    deleteFile: (noteId, fileId) => request(`/entities/notes?action=file&id=${enc(noteId)}&fileId=${enc(fileId)}`, { method: 'DELETE' }),
  },
};

const integrations = {
  Core: {
    getStockQuote: (symbol, provider = 'finnhub') => request(`/integrations/stock-quote?symbol=${enc(symbol)}&provider=${enc(provider)}`),
    getStockQuotes: (symbols, provider = 'finnhub') =>
      request(`/integrations/stock-quote?symbols=${enc([].concat(symbols).join(','))}&provider=${enc(provider)}`),
  },
};

const workspaces = {
  list: () => request('/workspaces'),
  get: (id) => request(`/workspaces?id=${enc(id)}`),
  create: (data) => request('/workspaces', json('POST', data)),
  update: (id, data) => request(`/workspaces?id=${enc(id)}`, json('PUT', data)),
  delete: (id) => request(`/workspaces?id=${enc(id)}`, { method: 'DELETE' }),
  invite: (id, data) => request(`/workspaces?id=${enc(id)}&action=invite`, json('POST', data)),
  updateMember: (id, memberId, data) => request(`/workspaces?id=${enc(id)}&action=updateMember&memberId=${enc(memberId)}`, json('PUT', data)),
  removeMember: (id, memberId) => request(`/workspaces?id=${enc(id)}&action=removeMember&memberId=${enc(memberId)}`, { method: 'DELETE' }),
  resendInvite: (id, memberId) => request(`/workspaces?id=${enc(id)}&action=resend&memberId=${enc(memberId)}`, { method: 'POST' }),
  leave: (id) => request(`/workspaces?id=${enc(id)}&action=leave`, { method: 'POST' }),
  heartbeat: (id) => request(`/workspaces?id=${enc(id)}&action=heartbeat`, { method: 'POST' }),
  myInvitations: () => request('/workspaces?action=invitations'),
  acceptInvitation: (token) => request(`/workspaces?action=accept&token=${enc(token)}`, { method: 'POST' }),
  declineInvitation: (token) => request(`/workspaces?action=decline&token=${enc(token)}`, { method: 'POST' }),
  // Household options: { aiAssistant, largeExpenseAlert, largeExpenseCurrency }
  updateSettings: (id, settings) => request(`/workspaces?id=${enc(id)}&action=settings`, json('PUT', settings)),
  // Public: the details shown on the invitation page before signing in
  invitation: (token) => request(`/invitations/${enc(token)}`),
};

/** Today on this device, 'YYYY-MM-DD' ("yesterday" means the person's yesterday). */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Smart help: category suggestions while typing, and the opt-in AI assistant
const assist = {
  status: () => request('/assist'),
  suggestCategory: (description, type = 'Expense') => request('/assist?action=suggest-category', json('POST', { description, type })),
  parse: (text) => request('/assist?action=parse', json('POST', { text, today: localDay() })),
  ask: (question) => request('/assist?action=ask', json('POST', { question, today: localDay() })),
};

// Passkeys registered on this account (Settings > Security)
const passkeys = {
  list: () => request('/auth/passkey?action=list'),
  async register(name) {
    const { startRegistration } = await import('@simplewebauthn/browser');
    const optionsJSON = await request('/auth/passkey?action=register-options', json('POST', {}));
    const response = await startRegistration({ optionsJSON });
    const list = await request('/auth/passkey?action=register-verify', json('POST', { response, name }));
    return { list, credentialId: response.id };
  },
  rename: (id, name) => request(`/auth/passkey?action=rename&id=${enc(id)}`, json('PUT', { name })),
  remove: (id) => request(`/auth/passkey?action=remove&id=${enc(id)}`, { method: 'DELETE' }),
};

// Card statements read on the device: rows are matched against what is already recorded
const imports = {
  statement: (rows, { review = false } = {}) => request('/import/statement', json('POST', { rows, review })),
};

// Ingest tokens: per-device credentials for the iPhone Shortcut (Apple Pay taps, SMS)
const ingestTokens = {
  list: () => request('/ingest-tokens'),
  create: (label) => request('/ingest-tokens', json('POST', { label })),
  revoke: (id) => request(`/ingest-tokens?id=${enc(id)}`, { method: 'DELETE' }),
  activity: () => request('/ingest-tokens?activity=1'),
};

// Web Push subscriptions for this user's devices
const push = {
  config: () => request('/push'),
  subscribe: (subscription) => request('/push', json('POST', { subscription })),
  test: () => request('/push', json('POST', { test: true })),
  unsubscribe: (endpoint) => request(`/push?endpoint=${enc(endpoint)}`, { method: 'DELETE' }),
};

export const ascent = { auth, passkeys, entities, workspaces, integrations, ingestTokens, push, assist, imports };
export default ascent;
