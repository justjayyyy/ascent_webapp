import { parseAmount } from './amount.js';
import { cleanText, merchantKey } from './text.js';
import { resolveWhen } from './time.js';

const MAX_AMOUNT = 1_000_000;

// Only strings and finite numbers are accepted; objects (e.g. { "$gt": 0 }) never get any further.
const asText = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/**
 * Apple Wallet "tap to pay" payload from the Shortcut -> a normalized event, or { ok: false, reason }.
 * Body: { v: 1, merchant, amount, card, at }. `amount` is the text iOS provides, currency symbol included.
 */
export function parseWalletPayload(body, { userCurrency = 'USD', now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid_body' };
  if (body.v !== undefined && body.v !== 1 && body.v !== '1') return { ok: false, reason: 'unsupported_version' };

  const amount = parseAmount(typeof body.amount === 'number' ? body.amount : asText(body.amount), { userCurrency });
  if (!amount || amount.value <= 0) return { ok: false, reason: 'amount_unreadable' };
  if (amount.value > MAX_AMOUNT) return { ok: false, reason: 'amount_out_of_range' };

  const flags = [];
  if (!amount.currency) flags.push('currencyAssumed');
  if (amount.negative) flags.push('signNegative');

  const merchant = cleanText(asText(body.merchant), 120);
  if (!merchant) flags.push('incomplete');

  const at = asText(body.at).trim() || null;
  const when = resolveWhen(at, now);
  if (when.approx) flags.push('dateApprox');

  return {
    ok: true,
    event: {
      source: 'wallet',
      amount: amount.value,
      minor: amount.minor,
      exponent: amount.exponent,
      currency: amount.currency ?? userCurrency,
      merchant,
      merchantKey: merchantKey(merchant),
      cardText: cleanText(asText(body.card), 80),
      at,
      occurredAt: when.occurredAt,
      date: when.date,
      flags,
    },
  };
}
