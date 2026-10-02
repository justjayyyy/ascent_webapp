// The order and time of day of transactions. Rows store their day as 'YYYY-MM-DD'; the moment within it is
// the purchase time automated rows (Apple Pay, SMS) carry or that was picked when adding one, else when
// the row was saved.
import { localDay } from './localDay';

const instantOf = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(ms) ? null : ms;
};

/** When within its day a transaction happened, as a Date, or null when that is not known. */
export function txTime(tx) {
  const occurred = instantOf(tx?.occurredAt);
  if (occurred !== null) return new Date(occurred);
  // Saved on the day it is dated: that is close enough to when it happened
  const saved = instantOf(tx?.created_date);
  if (saved !== null && localDay(new Date(saved)) === String(tx.date || '').slice(0, 10)) return new Date(saved);
  return null;
}

// Rows not saved yet (still on this device) are the newest
const sortInstant = (tx) => instantOf(tx?.occurredAt) ?? instantOf(tx?.created_date) ?? Infinity;

/** Newest first: by day, then by time within the day. */
export function newestFirst(a, b) {
  const byDay = String(b?.date || '').slice(0, 10).localeCompare(String(a?.date || '').slice(0, 10));
  if (byDay) return byDay;
  const ta = sortInstant(a);
  const tb = sortInstant(b);
  return ta === tb ? 0 : ta < tb ? 1 : -1;
}

/** The time of day to show for a transaction ('14:32', in the person's locale), or '' when unknown. */
export function formatTxTime(tx, locale) {
  const at = txTime(tx);
  return at ? new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(at) : '';
}
