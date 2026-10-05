// Third-party calls the API makes, answered here instead of on the internet, so the browser tests never depend
// on someone else's service. Anything not stubbed is refused and recorded; the tests fail when a call they
// did not expect leaves the machine.
//
// Scenarios are per test: the browser tests send `x-e2e-test` with every request, the request runs inside an
// AsyncLocalStorage context carrying it, and the stub looks up that test's scenario (default otherwise).
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { clearGoogle, googleCalendar, googleOAuth, googleTasks } from './googleApis.mjs';

export const TEST_HEADER = 'x-e2e-test';

const requestContext = new AsyncLocalStorage();
const scenarios = new Map(); // test key → { rates: 'ok' | 'down' | 'malformed' }
const unexpected = []; // { test, method, url }

export const RATES = { USD: 1, ILS: 3.7, EUR: 0.92, RUB: 90, GBP: 0.79 };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// --- Anthropic: the assistant's three calls, told apart by their system prompt (server/lib/assistant.js) ---
const message = (text, stop = 'end_turn') => json({
  id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null,
  content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 },
});

/** A note like "coffee 18 with Max" read the simple way: the number is the amount, the rest the description. */
function draftFrom(note) {
  const text = String(note.match(/Note: ([\s\S]*)$/)?.[1] || '').trim();
  const amount = Number(text.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.')) || null;
  const question = /\?\s*$|^(how|what|when|why|כמה|сколько)/i.test(text);
  const card = text.match(/\bwith (\w+)/i)?.[1] || null;
  const description = text.replace(/\d+(?:[.,]\d+)?/g, '').replace(/\bwith \w+/i, '').replace(/\s+/g, ' ').trim();
  return question
    ? { kind: 'question', type: 'Expense', amount: null, currency: null, category: null, description: '', date: null, paymentMethod: null, cardName: null }
    : { kind: 'transaction', type: 'Expense', amount, currency: null, category: /coffee|café|קפה|кофе/i.test(text) ? 'food_dining' : null,
      description, date: null, paymentMethod: card ? 'Card' : null, cardName: card };
}

export const ASSISTANT_ANSWER = 'Food and dining is your biggest category this month.';

function anthropic({ ai = 'ok' }, url, init) {
  if (ai === 'overloaded') return json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529);
  if (ai === 'refusal') return message('', 'refusal');
  const body = JSON.parse(init?.body || '{}');
  const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join('') : String(body.system || '');
  const userText = (body.messages || []).flatMap((m) => (typeof m.content === 'string' ? [m.content] : m.content.map((c) => c.text || ''))).join('\n');
  if (system.startsWith('You read short notes')) return message(JSON.stringify(draftFrom(userText)));
  if (system.startsWith('You read photos of shop receipts')) {
    const firstItem = userText.match(/^- ([^:]+): /m)?.[1] || null;
    return message(JSON.stringify({
      isReceipt: ai !== 'not-a-receipt', store: 'Rami Levy', date: new Date().toISOString().slice(0, 10), total: 87.4, currency: 'USD',
      // Two cartons at 6.90 each
      items: firstItem ? [{ text: 'Milk 3%', qty: 2, unit: null, unitPrice: 6.9, price: 13.8, matchId: firstItem }] : [],
    }));
  }
  return message(ASSISTANT_ANSWER);
}

// --- Google: Sign-In ID tokens checked at tokeninfo. A test's credential is "e2e." + base64url(JSON of the
// person, plus any field to override: aud, email_verified, exp...), see e2e/support/google.js ---
function tokeninfo(scenario, url) {
  const token = url.searchParams.get('id_token') || '';
  if (!token.startsWith('e2e.')) return json({ error: 'invalid_token' }, 400);
  const claims = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
  return json({
    iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 3600), sub: `google-${claims.email}`, ...claims,
  });
}

const STUBS = [
  {
    host: 'api.exchangerate-api.com',
    answer: ({ rates = 'ok' }) => {
      if (rates === 'down') return json({ error: 'unavailable' }, 503);
      if (rates === 'malformed') return json({ rates: { USD: 2 } });
      return json({ base: 'USD', date: new Date().toISOString().slice(0, 10), rates: RATES });
    },
  },
  { host: 'api.anthropic.com', answer: anthropic },
  { host: 'oauth2.googleapis.com', answer: (scenario, url, init, test) => (url.pathname === '/tokeninfo' ? tokeninfo(scenario, url) : googleOAuth(scenario, url, init, test)) },
  // Calendar and Tasks: a fake Google account per test (harness/googleApis.mjs)
  { host: 'www.googleapis.com', answer: googleCalendar },
  { host: 'tasks.googleapis.com', answer: googleTasks },
];

const isLocal = (url) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);

/** Runs every incoming API request inside a context that knows which test sent it. Call before the API starts. */
export function trackRequests() {
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function emitWithTest(event, req, ...rest) {
    if (event !== 'request') return emit.call(this, event, req, ...rest);
    const test = req.headers?.[TEST_HEADER];
    return requestContext.run({ test: typeof test === 'string' ? test : undefined }, () => emit.call(this, event, req, ...rest));
  };
}

/** Replaces fetch for third-party hosts. Call before the API starts. */
export function stubOutbound() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (isLocal(url)) return realFetch(input, init);
    const test = requestContext.getStore()?.test;
    const stub = STUBS.find((s) => s.host === url.hostname);
    if (stub) return stub.answer(scenarios.get(test) || {}, url, init, test);
    const method = init?.method || (typeof input === 'object' && input.method) || 'GET';
    unexpected.push({ test: test || null, method, url: url.href });
    console.warn(`[e2e] refused an outbound call: ${method} ${url.href}`);
    return json({ error: 'blocked by the e2e harness' }, 503);
  };
}

export const setScenario = (test, scenario) => scenarios.set(test, { ...scenarios.get(test), ...scenario });
export const clearScenario = (test) => { scenarios.delete(test); clearGoogle(test); };
export const unexpectedCalls = (test) => (test ? unexpected.filter((c) => c.test === test) : [...unexpected]);
