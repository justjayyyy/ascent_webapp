const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * When the purchase happened, from the ISO 8601 text the Shortcut sends ("Format Date -> ISO 8601").
 * The local calendar date is the first 10 characters of that text: converting to UTC first would push a
 * purchase made at 00:30 in Israel onto the previous day.
 * Missing, malformed, future or older-than-a-week values fall back to "now" and are marked approximate.
 */
export function resolveWhen(at, now = new Date()) {
  if (typeof at === 'string' && ISO_WITH_OFFSET.test(at.trim())) {
    const text = at.trim();
    const t = new Date(text);
    const ms = t.getTime();
    if (!Number.isNaN(ms) && ms <= now.getTime() + 10 * 60_000 && ms >= now.getTime() - 7 * DAY_MS) {
      return { occurredAt: t, date: text.slice(0, 10), approx: false };
    }
  }
  return { occurredAt: now, date: now.toISOString().slice(0, 10), approx: true };
}

/** 'YYYY-MM-DD' plus a number of days, as 'YYYY-MM-DD' (calendar arithmetic, no time zones involved). */
export function shiftDate(date, days) {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}
