// Turns the amount text iOS hands to a Shortcut ("₪25.00", "1.234,50 €", "‏25.00 ₪") into a number and a currency.
import { stripBidi } from './text.js';

const ISO_OK = new Set(
  'USD EUR GBP ILS JPY CAD AUD NZD CHF SEK NOK DKK PLN CZK HUF RON BGN TRY RUB UAH INR CNY HKD SGD THB KRW MXN BRL ZAR AED SAR EGP JOD ISK CLP VND KWD BHD OMR TND'.split(' ')
);
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
const DOLLAR_FAMILY = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD']);

const PREFIXED_DOLLAR = [
  [/(?<![A-Za-z])US\$/, 'USD'],
  [/(?<![A-Za-z])CA?\$/, 'CAD'],
  [/(?<![A-Za-z])A(?:U)?\$/, 'AUD'],
  [/(?<![A-Za-z])NZ\$/, 'NZD'],
  [/(?<![A-Za-z])HK\$/, 'HKD'],
  [/(?<![A-Za-z])S\$/, 'SGD'],
  [/(?<![A-Za-z])MX\$/, 'MXN'],
];
const SYMBOLS = [
  [/₪/, 'ILS'],
  [/(?<![\p{L}])ש["״'׳]?ח(?![\p{L}])/u, 'ILS'],
  [/(?<![A-Za-z])NIS(?![A-Za-z])/i, 'ILS'],
  [/€/, 'EUR'],
  [/£/, 'GBP'],
  [/₽/, 'RUB'],
  [/₴/, 'UAH'],
  [/₹/, 'INR'],
  [/₺/, 'TRY'],
  [/zł/i, 'PLN'],
  [/Kč/, 'CZK'],
];

function detectCurrency(s, userCurrency) {
  for (const [re, code] of PREFIXED_DOLLAR) if (re.test(s)) return code;
  for (const [re, code] of SYMBOLS) if (re.test(s)) return code;
  for (const m of s.toUpperCase().matchAll(/(?<![A-Z])[A-Z]{3}(?![A-Z])/g)) {
    if (ISO_OK.has(m[0])) return m[0];
  }
  // A bare "$" is the user's own dollar when they use one, otherwise USD.
  if (s.includes('$')) return DOLLAR_FAMILY.has(userCurrency) ? userCurrency : 'USD';
  if (/[¥￥]/.test(s)) return userCurrency === 'CNY' ? 'CNY' : 'JPY';
  return null;
}

const exponentOf = (currency) => (ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2);

// Decimal versus grouping: the later of "." and "," is the decimal; a single separator followed by exactly
// three digits is grouping ("1,234" -> 1234); currencies without decimals only ever group.
function toNumber(run, exponent) {
  const r = run.replace(/['’]/g, '').replace(/[.,]+$/, '');
  const dots = (r.match(/\./g) || []).length;
  const commas = (r.match(/,/g) || []).length;
  let decimalSep = null;

  if (dots && commas) {
    decimalSep = r.lastIndexOf('.') > r.lastIndexOf(',') ? '.' : ',';
  } else if (dots + commas === 1 && exponent !== 0) {
    const sep = dots ? '.' : ',';
    const at = r.indexOf(sep);
    const after = r.length - at - 1;
    const intPart = r.slice(0, at);
    const looksGrouped = after === 3 && exponent !== 3 && !/^0+$/.test(intPart);
    decimalSep = looksGrouped ? null : sep;
  }

  if (decimalSep) {
    const group = decimalSep === '.' ? ',' : '.';
    return Number(r.split(group).join('').replace(decimalSep, '.'));
  }
  return Number(r.replace(/[.,]/g, ''));
}

/**
 * Amount text -> { value, minor, currency | null, exponent, negative }, or null when there is no readable number.
 * `value` is never negative (the sign is reported separately). `currency` is null when the text names none.
 */
export function parseAmount(input, { userCurrency = 'USD' } = {}) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const exponent = exponentOf(userCurrency);
    const f = 10 ** exponent;
    const minor = Math.round(Math.abs(input) * f);
    return { value: minor / f, minor, currency: null, exponent, negative: input < 0 };
  }
  if (typeof input !== 'string') return null;

  const s = stripBidi(input.normalize('NFKC')).trim();
  if (!s) return null;

  const run = s.replace(/[\s   ]/g, '').match(/\d[\d.,'’]*/);
  if (!run) return null;

  const currency = detectCurrency(s, userCurrency);
  const exponent = exponentOf(currency ?? userCurrency);

  const raw = toNumber(run[0], exponent);
  if (!Number.isFinite(raw)) return null;

  const negative = /^[^\d]*[-−–][^\d]*\d/.test(s) || /^\(.*\)$/.test(s);   // "-18", "-₪18", "₪-18", "(18.00)"
  const f = 10 ** exponent;
  const minor = Math.round(raw * f);
  return { value: minor / f, minor, currency, exponent, negative };
}
