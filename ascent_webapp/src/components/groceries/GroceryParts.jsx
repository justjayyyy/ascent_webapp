import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHousehold } from '@/hooks/useHousehold';
import { aisleEmoji, lineQty } from './groceryUtils';

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

/**
 * What a receipt says was bought: each line with how many (or how much, by weight) at what price each,
 * and what the line came to. A line matched to the shopping list is ticked.
 */
export function ReceiptLines({ lines, fmt, loc, blur, t, className }) {
  if (!lines?.length) return null;
  return (
    <section aria-labelledby="rc-lines" className={className}>
      <h3 id="rc-lines" className="mb-1.5 text-sm font-semibold text-foreground">{t('rcptItems', { n: lines.length })}</h3>
      <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto overscroll-contain rounded-2xl bg-foreground/[0.04] px-3">
        {lines.map((line, i) => {
          const each = typeof line.unitPrice === 'number' ? `${fmt(line.unitPrice)}${line.unit ? `/${line.unit}` : ''}` : null;
          const qty = lineQty(line, loc) || (each ? '1' : null);
          return (
            // Lines have no id, and the same product can be on a receipt twice
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="truncate">{line.text}</span>
                  {line.matchId && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label={t('grOnTheList')} />}
                </span>
                {qty && (
                  <span className={cn('block text-xs tabular-nums text-muted-foreground', blur && each && 'blur-sm')}>
                    <span dir="ltr">{each ? `${qty} × ${each}` : qty}</span>
                  </span>
                )}
              </span>
              <span className={cn('shrink-0 font-semibold tabular-nums text-foreground', blur && 'blur-sm')} dir="ltr">
                {typeof line.price === 'number' ? fmt(line.price) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
