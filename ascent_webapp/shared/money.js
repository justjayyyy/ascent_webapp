// Money in other currencies. Exchange rates are "units of each currency per 1 USD" (rates.USD = 1),
// as https://api.exchangerate-api.com/v4/latest/USD returns them. Shared by the app and the API.

export const RATES_BASE = 'USD';

/** `amount` in `from` expressed in `to`, or null when the rates do not cover both currencies. */
export function convertAmount(amount, from, to, rates) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (!from || !to || from === to) return value;
  const perFrom = from === RATES_BASE ? 1 : rates?.[from];
  const perTo = to === RATES_BASE ? 1 : rates?.[to];
  if (!(perFrom > 0) || !(perTo > 0)) return null;
  return (value / perFrom) * perTo;
}

/**
 * A transaction's amount in `currency`:
 *  - recorded in that currency: its own amount;
 *  - converted when it was saved (amountInGlobalCurrency) into that same currency: that, at the day's rate;
 *  - otherwise today's rate;
 *  - rows saved before `globalCurrency` was recorded kept their conversion in the saver's own currency,
 *    assumed to be `legacyCurrency` (the viewer's; by default the target currency).
 * null when nothing can say what it is worth in `currency`.
 */
export function amountInCurrency(tx, currency, rates, { legacyCurrency = currency } = {}) {
  if (!tx) return null;
  const amount = Number(tx.amount) || 0;
  const from = tx.currency || currency;
  if (from === currency) return amount;
  const stored = typeof tx.amountInGlobalCurrency === 'number' ? tx.amountInGlobalCurrency : null;
  if (stored !== null && tx.globalCurrency === currency) return stored;
  if (stored !== null && !tx.globalCurrency && legacyCurrency === currency) return stored;
  return convertAmount(amount, from, currency, rates);
}

/**
 * When an edit leaves a row's amount and currency alone, the conversion it was saved with stays: editing the
 * description of last spring's hotel must not re-price it at today's rate. null when it should be worked out again.
 */
export function keptConversion(previous, amount, currency) {
  if (!previous || typeof previous.amountInGlobalCurrency !== 'number') return null;
  if (Number(previous.amount) !== Number(amount) || (previous.currency || null) !== (currency || null)) return null;
  return {
    amountInGlobalCurrency: previous.amountInGlobalCurrency,
    exchangeRate: previous.exchangeRate ?? null,
    globalCurrency: previous.globalCurrency ?? null,
  };
}

/** The fields to save with a transaction recorded in `currency` by someone whose own currency is `userCurrency`. */
export function conversionFields(amount, currency, userCurrency, rates) {
  if (!userCurrency) return { amountInGlobalCurrency: null, exchangeRate: null, globalCurrency: null };
  const converted = convertAmount(amount, currency, userCurrency, rates);
  if (converted === null) return { amountInGlobalCurrency: null, exchangeRate: null, globalCurrency: null };
  const value = Number(amount);
  return {
    amountInGlobalCurrency: Math.round(converted * 100) / 100,
    exchangeRate: value ? converted / value : 1,
    globalCurrency: userCurrency,
  };
}
