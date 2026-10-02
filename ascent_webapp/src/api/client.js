import { LEGACY_TOKEN_KEY, SIGNED_IN_KEY, WORKSPACE_KEY, SESSION_CACHE_KEY } from '@/lib/storageKeys';
import { localDay } from '@/lib/localDay';

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

// The session is an HttpOnly cookie the server sets at sign-in: page scripts never see it, and the browser
// sends it with every same-origin request. This device only remembers that it is signed in.
const legacyToken = () => storage.get(LEGACY_TOKEN_KEY);
const markSignedIn = () => { storage.set(SIGNED_IN_KEY, '1'); storage.remove(LEGACY_TOKEN_KEY); };
const forgetSession = () => { storage.remove(SIGNED_IN_KEY); storage.remove(LEGACY_TOKEN_KEY); };

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
  // A device still holding a token from before the cookie sends it once more; the server answers with the cookie
  const legacy = legacyToken();
  if (legacy) headers.Authorization = `Bearer ${legacy}`;
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
    forgetSession();
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
  if (!result?.user) throw apiError('The server sent an unexpected answer.', 200, { data: result });
  markSignedIn();
  return { user: result.user, isFirstLogin: result.isFirstLogin === true };
};

// `reason` lets the sign-in page say why the person landed there (see useAuthFlow)
const toLogin = (redirectUrl, reason) => {
  const params = new URLSearchParams();
  if (redirectUrl) params.set('redirect', redirectUrl);
  if (reason) params.set('reason', reason);
  window.location.href = params.size ? `/login?${params}` : '/login';
};

// Safari opens Face ID only when the prompt starts within about a second of the tap; a slow answer from
// the server (or the WebAuthn code still downloading) and it cancels the prompt, on every step. So the
// options are fetched ahead, and a tap starts the prompt straight away.
const OPTIONS_FRESH_MS = 4 * 60 * 1000; // the server keeps a challenge five minutes
const preparedOptions = {};

function prepareOptions(kind, endpoint) {
  const slot = preparedOptions[kind];
  if (slot && Date.now() - slot.at < OPTIONS_FRESH_MS) return slot.promise;
  const promise = Promise.all([import('@simplewebauthn/browser'), request(endpoint, json('POST', {}))]);
  preparedOptions[kind] = { at: Date.now(), promise };
  promise.catch(() => { if (preparedOptions[kind]?.promise === promise) delete preparedOptions[kind]; });
  return promise;
}

/** The prepared options, used once: a challenge is good for one ceremony. */
function takeOptions(kind, endpoint) {
  const promise = prepareOptions(kind, endpoint);
  delete preparedOptions[kind];
  return promise;
}

const forgetPreparedOptions = () => { for (const kind of Object.keys(preparedOptions)) delete preparedOptions[kind]; };

const LOGIN_OPTIONS = '/auth/passkey?action=login-options';
const REGISTER_OPTIONS = '/auth/passkey?action=register-options';

const auth = {
  login: async (email, password) => signedIn(await request('/auth/login', json('POST', { email, password }))),
  register: async (email, password, full_name) =>
    signedIn(await request('/auth/register', json('POST', { email, password, full_name, ...systemPrefs() }))),
  // `credential` is the ID token Google Identity Services hands the page
  googleLogin: async (credential) => signedIn(await request('/auth/google', json('POST', { credential, ...systemPrefs() }))),

  // Face ID / fingerprint: sign in, or unlock this device's session, with a passkey
  preparePasskeyLogin: () => prepareOptions('login', LOGIN_OPTIONS).catch(() => {}),
  async passkeyLogin({ autofill = false } = {}) {
    const [{ startAuthentication }, optionsJSON] = await takeOptions('login', LOGIN_OPTIONS);
    // The autofill request stays open while the page waits, so the button needs options of its own
    if (autofill) auth.preparePasskeyLogin();
    let response;
    try {
      response = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
    } catch (err) {
      if (!autofill) auth.preparePasskeyLogin(); // ready for the next tap
      throw err;
    }
    const result = await request('/auth/passkey?action=login-verify', json('POST', { response }));
    markSignedIn();
    return { ...result, credentialId: response.id };
  },

  // Confirms the session; a device that signed in before the cookie has been moved over by now
  me: async () => {
    const user = await request('/auth/me');
    markSignedIn();
    return user;
  },
  updateMe: (data) => request('/auth/me', json('PUT', data)),
  // `confirm` is the account's email, typed by the person
  deleteAccount: (confirm) => request('/auth/me', json('DELETE', { confirm })),

  // Forgotten password: an emailed link, then a new password that also signs in
  forgotPassword: (email) => request('/auth/password?action=forgot', json('POST', { email })),
  resetPassword: async (token, password) => signedIn(await request('/auth/password?action=reset', json('POST', { token, password }))),
  // Email confirmation
  sendVerification: () => request('/auth/verify-email?action=send', json('POST', {})),
  confirmEmail: (token) => request('/auth/verify-email?action=confirm', json('POST', { token })),

  // Ends every other device's session; this one stays signed in
  signOutOtherDevices: () => request('/auth/logout?scope=others', { method: 'POST' }),

  /**
   * Signs out on this device: the server ends this session (other devices stay signed in) and removes the
   * cookie, then what this device kept for offline use is forgotten.
   */
  logout(redirectUrl, { reason } = {}) {
    const legacy = legacyToken();
    // Plain fetch: a session that already ended must not send this page to the sign-in screen itself.
    // Sent even without a session to end, so the server also removes the cookie.
    const ending = fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: legacy ? { Authorization: `Bearer ${legacy}` } : {},
    }).catch(() => {});
    forgetSession();
    forgetPreparedOptions();
    storage.remove(SESSION_CACHE_KEY);
    // Bounded, so sign-out never hangs on a slow connection
    Promise.race([
      Promise.all([
        ending,
        import('@/components/notes/notesSync').then((m) => m.clearNotesStorage()),
        import('@/lib/offline/deviceData').then((m) => m.clearDeviceData()),
      ]),
      wait(2500),
    ]).catch(() => {}).finally(() => toLogin(redirectUrl, reason));
  },

  redirectToLogin: toLogin,
  // The session was refused: forget it without leaving the page
  forgetToken: forgetSession,
  isAuthenticated: () => !!(storage.get(SIGNED_IN_KEY) || legacyToken()),
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
  ExpenseTransaction: createEntity('transactions'),
  Budget: createEntity('budgets'),
  Category: createEntity('categories'),
  Card: createEntity('cards'),
  FinancialGoal: createEntity('goals'),
  Plan: createEntity('plans'),
  DashboardWidget: createEntity('dashboard-widgets'),
  PageLayout: createEntity('page-layouts'),
  Commitment: createEntity('commitments'),
  GroceryItem: createEntity('groceries'),
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

const workspaces = {
  list: () => request('/workspaces'),
  get: (id) => request(`/workspaces?id=${enc(id)}`),
  create: (data) => request('/workspaces', json('POST', data)),
  update: (id, data) => request(`/workspaces?id=${enc(id)}`, json('PUT', data)),
  // The owner deleted their account: keep the workspace (becoming its owner) or leave it
  claim: (id) => request(`/workspaces?id=${enc(id)}&action=claim`, { method: 'POST' }),
  release: (id) => request(`/workspaces?id=${enc(id)}&action=release`, { method: 'POST' }),
  delete: (id) => request(`/workspaces?id=${enc(id)}`, { method: 'DELETE' }),
  invite: (id, data) => request(`/workspaces?id=${enc(id)}&action=invite`, json('POST', data)),
  updateMember: (id, memberId, data) => request(`/workspaces?id=${enc(id)}&action=updateMember&memberId=${enc(memberId)}`, json('PUT', data)),
  removeMember: (id, memberId) => request(`/workspaces?id=${enc(id)}&action=removeMember&memberId=${enc(memberId)}`, { method: 'DELETE' }),
  resendInvite: (id, memberId) => request(`/workspaces?id=${enc(id)}&action=resend&memberId=${enc(memberId)}`, { method: 'POST' }),
  leave: (id) => request(`/workspaces?id=${enc(id)}&action=leave`, { method: 'POST' }),
  // { dataRev, updated }: changes whenever anyone edits the workspace's data or its members
  pulse: (id) => request(`/workspaces?id=${enc(id)}&action=pulse`, { timeout: 8000, retries: 0 }),
  heartbeat: (id) => request(`/workspaces?id=${enc(id)}&action=heartbeat`, { method: 'POST' }),
  myInvitations: () => request('/workspaces?action=invitations'),
  acceptInvitation: (token) => request(`/workspaces?action=accept&token=${enc(token)}`, { method: 'POST' }),
  declineInvitation: (token) => request(`/workspaces?action=decline&token=${enc(token)}`, { method: 'POST' }),
  // Household options: { aiAssistant, largeExpenseAlert, largeExpenseCurrency }
  updateSettings: (id, settings) => request(`/workspaces?id=${enc(id)}&action=settings`, json('PUT', settings)),
  // Public: the details shown on the invitation page before signing in
  invitation: (token) => request(`/invitations/${enc(token)}`),
};

// Today on this device ("yesterday" means the person's yesterday)
export { localDay } from '@/lib/localDay';

// Smart help: category suggestions while typing, and the opt-in AI assistant
const assist = {
  status: () => request('/assist'),
  suggestCategory: (description, type = 'Expense') => request('/assist?action=suggest-category', json('POST', { description, type })),
  parse: (text) => request('/assist?action=parse', json('POST', { text, today: localDay() })),
  ask: (question) => request('/assist?action=ask', json('POST', { question, today: localDay() })),
  // A receipt photo (base64, no data: prefix) read into { isReceipt, store, date, total, currency, items }
  readReceipt: ({ image, mediaType, items }) =>
    request('/assist?action=receipt', json('POST', { image, mediaType, items, today: localDay() }, { timeout: 60000 })),
};

// Passkeys registered on this account (Settings > Security)
const passkeys = {
  list: () => request('/auth/passkey?action=list'),
  prepareRegister: () => prepareOptions('register', REGISTER_OPTIONS).catch(() => {}),
  async register(name) {
    const [{ startRegistration }, optionsJSON] = await takeOptions('register', REGISTER_OPTIONS);
    let response;
    try {
      response = await startRegistration({ optionsJSON });
    } catch (err) {
      passkeys.prepareRegister(); // ready for the next tap
      throw err;
    }
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

export const ascent = { auth, passkeys, entities, workspaces, ingestTokens, push, assist, imports };
export default ascent;
