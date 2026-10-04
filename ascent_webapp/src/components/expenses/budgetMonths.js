import { monthKey } from '@shared/budgets';

export const localeOf = (language) => (language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US');

/** The month on screen as 'YYYY-MM': the one picked, or this month when none or several are. */
export function shownMonth(selectedYear, selectedMonths = []) {
  const now = new Date();
  if (selectedYear && selectedMonths?.length === 1) return monthKey(Number(selectedYear), Number(selectedMonths[0]));
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

/**
 * A month's name with its year, two ways: `name` to stand alone ("сентябрь 2026 г.") and `from` after "since"
 * or "from" ("с сентября 2026 г."), which differ in Russian.
 */
export function monthNames(key, language) {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const locale = localeOf(language);
  const name = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  if (language !== 'ru') return { name, from: name };
  // A date's month is in the genitive ("1 сентября 2026 г."): drop the day
  const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(date);
  const from = parts.filter((p) => p.type !== 'day').map((p) => p.value).join('').trim();
  return { name, from };
}
