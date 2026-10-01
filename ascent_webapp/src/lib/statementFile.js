// Reading a bank or card statement on the device: Excel (.xls/.xlsx, including the HTML-as-.xls files some
// Israeli banks export) or CSV (UTF-8 or Windows-1255). Nothing here talks to the server.

const HEADERS = {
  date: ['תאריך עסקה', 'תאריך רכישה', 'תאריך', 'transaction date', 'purchase date', 'date', 'дата операции', 'дата'],
  description: ['שם בית העסק', 'בית עסק', 'שם בית עסק', 'תיאור', 'פרטים', 'merchant', 'description', 'payee', 'details', 'name', 'описание', 'магазин', 'назначение'],
  // The charged amount (in the account's currency) beats the original purchase amount
  amount: ['סכום חיוב', 'סכום לחיוב', 'charged amount', 'charge amount', 'billing amount', 'חובה', 'סכום', 'סכום עסקה', 'amount', 'debit', 'сумма списания', 'сумма'],
  currency: ['מטבע חיוב', 'מטבע', 'currency', 'валюта'],
  card: ['4 ספרות אחרונות', 'ספרות אחרונות', 'כרטיס', 'card', 'карта'],
};
export const FIELDS = Object.keys(HEADERS);

const norm = (v) => String(v ?? '').replace(/[\u200E\u200F"'״׳]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1255').decode(buffer); // Hebrew Excel's "CSV" default
  }
}

/** File -> [{ name, rows: any[][] }] */
export async function readSheets(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const isText = /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv';
  // raw: text cells stay text. Otherwise SheetJS reads "01/09/2026" as January 9th (US order) before
  // parseDate can apply the day/month order the person picked. Real Excel date cells still come as dates.
  const book = isText
    ? XLSX.read(decodeText(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  return book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }),
  })).filter((s) => s.rows.length);
}

/** Best guess of the header row and which column holds what. */
export function guessColumns(rows) {
  let best = { headerRow: -1, columns: {}, score: 0 };
  rows.slice(0, 40).forEach((row, r) => {
    const cells = row.map(norm);
    const columns = {};
    let score = 0;
    for (const field of FIELDS) {
      for (const word of HEADERS[field]) {
        const at = cells.findIndex((c, i) => c && (c === word || c.startsWith(word) || c.includes(word)) && !Object.values(columns).includes(i));
        if (at !== -1) {
          columns[field] = at;
          score += 1;
          break;
        }
      }
    }
    if (columns.date !== undefined && columns.amount !== undefined && score > best.score) best = { headerRow: r, columns, score };
  });
  return best;
}

const pad = (n) => String(n).padStart(2, '0');

/** A cell -> 'YYYY-MM-DD' or null. `order` is 'dmy' or 'mdy' for ambiguous text like 03/04/2026. */
export function parseDate(value, order = 'dmy') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000); // Excel serial day
    return d.toISOString().slice(0, 10);
  }
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [day, month] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return valid(year, month, day);
  }
  return null;
}

function valid(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** A cell -> a signed number or null: "1,234.50", "₪ 45.90", "12.00-", "(30.00)", "1.234,50 €". */
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value ?? '').replace(/[\u200E\u200F\s\u00A0]/g, '');
  if (!s) return null;
  const negative = /^-|-$|^\(.*\)$|^−/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (lastComma !== -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const CURRENCY_WORDS = [[/₪|ש"?ח|nis|ils/i, 'ILS'], [/\$|usd|דולר/i, 'USD'], [/€|eur|אירו|יורו/i, 'EUR'], [/£|gbp|ליש/i, 'GBP'], [/₽|rub|руб/i, 'RUB']];
const currencyOf = (v) => {
  const s = String(v ?? '').trim();
  if (/^[A-Z]{3}$/i.test(s)) return s.toUpperCase();
  return CURRENCY_WORDS.find(([re]) => re.test(s))?.[1] ?? null;
};

/**
 * Rows after the header -> statement rows for the server: { date, description, amount, currency, card }.
 * Charges are positive; `flip` is for files that list charges as negative numbers.
 */
export function toStatementRows(rows, { headerRow, columns }, { order = 'dmy', flip = false } = {}) {
  const out = [];
  let skipped = 0;
  for (const row of rows.slice(headerRow + 1)) {
    const date = columns.date !== undefined ? parseDate(row[columns.date], order) : null;
    const raw = columns.amount !== undefined ? parseAmount(row[columns.amount]) : null;
    if (!date || raw === null || raw === 0) {
      if (row.some((c) => String(c ?? '').trim())) skipped += 1;
      continue;
    }
    out.push({
      date,
      description: columns.description !== undefined ? String(row[columns.description] ?? '').trim().slice(0, 120) : '',
      amount: flip ? -raw : raw,
      currency: columns.currency !== undefined ? currencyOf(row[columns.currency]) : null,
      card: columns.card !== undefined ? String(row[columns.card] ?? '').trim().slice(0, 40) : '',
    });
  }
  return { rows: out, skipped };
}

/** Most amounts negative: this file lists charges as negative numbers. */
export const chargesLookNegative = (rows, { headerRow, columns }) => {
  const values = rows.slice(headerRow + 1).map((r) => parseAmount(r[columns.amount])).filter((v) => v);
  return values.length > 0 && values.filter((v) => v < 0).length / values.length > 0.6;
};
