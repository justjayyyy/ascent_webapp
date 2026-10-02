import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useHousehold } from '@/hooks/useHousehold';
import { aisleEmoji } from './groceryUtils';

export const localeOf = (language) => (language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US');

/** Colours for a supply status: text, ring/stroke, soft fill. */
export const TONE = {
  out: { text: 'text-danger', stroke: 'hsl(var(--danger))', fill: 'bg-danger/15', line: 'border-danger/70' },
  low: { text: 'text-warning', stroke: 'hsl(var(--warning))', fill: 'bg-warning/[0.16]', line: 'border-warning/75' },
  ok: { text: 'text-success', stroke: 'hsl(var(--success))', fill: 'bg-success/[0.13]', line: 'border-success/60' },
  unknown: { text: 'text-muted-foreground', stroke: 'hsl(var(--muted-foreground))', fill: 'bg-foreground/[0.05]', line: 'border-foreground/20' },
};

/** The item's picture: its emoji, or its aisle's. */
export function ItemEmoji({ item, className }) {
  return <span aria-hidden className={cn('leading-none', className)}>{item.emoji || aisleEmoji(item.aisle)}</span>;
}

/** Household members by email, with a fallback for people who have left. */
export function useWho() {
  const { byEmail, isShared } = useHousehold();
  return useMemo(() => ({
    isShared,
    of: (email) => (email && byEmail[email]) || (email ? { name: email.split('@')[0], initials: email.slice(0, 1).toUpperCase(), color: 'hsl(var(--muted-foreground))' } : null),
  }), [byEmail, isShared]);
}

/** A small round initial for whoever added or ticked something. */
export function WhoDot({ person, className }) {
  if (!person) return null;
  return (
    <span
      aria-hidden
      title={person.name}
      className={cn('inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold leading-none text-background', className)}
      style={{ background: person.color }}
    >
      {person.initials?.slice(0, 1)}
    </span>
  );
}

/** "today", "yesterday", "5 days ago". */
export function daysAgo(n, loc) {
  if (n === null || n === undefined) return '';
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (n < 14) return rtf.format(-n, 'day');
  if (n < 60) return rtf.format(-Math.round(n / 7), 'week');
  return rtf.format(-Math.round(n / 30.4), 'month');
}

/** How long the supply will probably last, short: "~3 days", "~2 weeks", "probably out". */
export function leftLabel(supply, t) {
  if (!supply || supply.status === 'unknown') return '';
  if (supply.status === 'out') return supply.manual ? t('grOut') : t('grProbablyOut');
  const d = supply.daysLeft;
  if (d === null) return supply.share >= 0.75 ? t('grLevelFull') : supply.share >= 0.4 ? t('grLevelHalf') : t('grLevelLow');
  if (d <= 0) return t('grRunsOutToday');
  if (d === 1) return t('grOneDayLeft');
  if (d < 14) return t('grDaysLeft', { n: d });
  return t('grWeeksLeft', { n: Math.round(d / 7) });
}

export const money = (loc, currency, digits = 2) => (v) => new Intl.NumberFormat(loc, {
  style: 'currency', currency: currency || 'ILS', minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(v || 0);
