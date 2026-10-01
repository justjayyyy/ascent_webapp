// Today's exchange rates on the server, for rows that arrive without the app (Apple Pay, SMS), so they keep
// the rate of the day they happened, as rows added in the app do. Same source and shape as the app
// (shared/money.js). Cached per server instance for an hour; null when the service cannot be reached.
const SOURCE = 'https://api.exchangerate-api.com/v4/latest/USD';
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

let cache = null; // { rates, at }

export async function getRates({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache && now - cache.at < TTL_MS) return cache.rates;
  try {
    const res = await fetchImpl(SOURCE, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    const rates = (await res.json())?.rates;
    if (!rates || typeof rates !== 'object' || rates.USD !== 1) throw new Error('unexpected rates');
    cache = { rates, at: now };
    return rates;
  } catch (err) {
    console.warn('[Rates] unavailable:', err?.message);
    return cache?.rates ?? null; // an older answer beats none
  }
}

export const forgetRates = () => { cache = null; };
