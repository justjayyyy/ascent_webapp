import { useCallback } from 'react';
import { useMoney } from '@/hooks/useWorkspaceData';

// Kinds of commitment, with the expense category their payments usually belong to
export const COMMITMENT_KINDS = [
  { key: 'mortgage', emoji: '🏠', category: 'rent_housing' },
  { key: 'car', emoji: '🚗', category: 'transportation' },
  { key: 'personal', emoji: '🏦', category: 'other_expense' },
  { key: 'student', emoji: '🎓', category: 'education' },
  { key: 'credit', emoji: '💳', category: 'other_expense' },
  { key: 'lease', emoji: '📄', category: 'transportation' },
  { key: 'family', emoji: '🤝', category: 'other_expense' },
  { key: 'other', emoji: '📌', category: 'other_expense' },
];

// Money lent out is almost always to a person
export const LENT_KINDS = ['family', 'personal', 'other'];

export const kindOf = (key) => COMMITMENT_KINDS.find((k) => k.key === key) || COMMITMENT_KINDS[COMMITMENT_KINDS.length - 1];
export const commitmentEmoji = (c) => c.emoji || kindOf(c.kind).emoji;

export const newPaymentId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Months as "4 yrs 5 mo" style text, in the viewer's language. */
export function durationText(months, t) {
  if (months === null || months === undefined) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(t('cmYears').replace('{n}', y));
  if (m || !y) parts.push(t('cmMonths').replace('{n}', m));
  return parts.join(' ');
}

/** Month and year, e.g. "Dec 2026". */
export const monthYear = (date, loc) => (date
  ? new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric' }).format(new Date(`${date.slice(0, 7)}-15T12:00:00`))
  : '');

/** Converts any commitment's money into the viewer's currency. */
// Until rates arrive (or offline with none cached) an amount is shown as it is rather than as zero.
export function useToUserCurrency(userCurrency) {
  const { convert } = useMoney(userCurrency);
  return useCallback((amount, from) => (amount ? convert(amount, from) ?? amount : 0), [convert]);
}
