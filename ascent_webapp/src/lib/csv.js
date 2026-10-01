// CSV for spreadsheets. Values that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the
// start) are prefixed with an apostrophe: merchant names come from bank SMS and Wallet, so they are
// not trusted. Numbers stay numbers.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = Array.isArray(value) ? value.join(';') : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows as CSV with the given columns, header first. */
export function toCSV(rows, columns) {
  return [columns.join(','), ...(rows || []).map((row) => columns.map((c) => csvCell(row?.[c])).join(','))].join('\n');
}

/** Several titled tables in one file, separated by a blank line. */
export const sections = (parts) => parts.map(([title, csv]) => `${title}\n${csv}`).join('\n\n');
