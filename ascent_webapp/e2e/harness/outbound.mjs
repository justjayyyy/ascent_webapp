// Third-party calls the API makes, answered here instead of on the internet, so the browser tests never depend
// on someone else's service. Anything not stubbed is refused and recorded; the tests fail when a call they
// did not expect leaves the machine.
//
// Scenarios are per test: the browser tests send `x-e2e-test` with every request, the request runs inside an
// AsyncLocalStorage context carrying it, and the stub looks up that test's scenario (default otherwise).
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';

export const TEST_HEADER = 'x-e2e-test';

const requestContext = new AsyncLocalStorage();
const scenarios = new Map(); // test key → { rates: 'ok' | 'down' | 'malformed' }
const unexpected = []; // { test, method, url }

export const RATES = { USD: 1, ILS: 3.7, EUR: 0.92, RUB: 90, GBP: 0.79 };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const STUBS = [
  {
    host: 'api.exchangerate-api.com',
    answer: ({ rates = 'ok' }) => {
      if (rates === 'down') return json({ error: 'unavailable' }, 503);
      if (rates === 'malformed') return json({ rates: { USD: 2 } });
      return json({ base: 'USD', date: new Date().toISOString().slice(0, 10), rates: RATES });
    },
  },
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
    if (stub) return stub.answer(scenarios.get(test) || {}, url, init);
    const method = init?.method || (typeof input === 'object' && input.method) || 'GET';
    unexpected.push({ test: test || null, method, url: url.href });
    console.warn(`[e2e] refused an outbound call: ${method} ${url.href}`);
    return json({ error: 'blocked by the e2e harness' }, 503);
  };
}

export const setScenario = (test, scenario) => scenarios.set(test, { ...scenarios.get(test), ...scenario });
export const clearScenario = (test) => scenarios.delete(test);
export const unexpectedCalls = (test) => (test ? unexpected.filter((c) => c.test === test) : [...unexpected]);
