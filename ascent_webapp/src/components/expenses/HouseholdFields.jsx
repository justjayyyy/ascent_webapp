import React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { useHousehold } from '@/hooks/useHousehold';

/**
 * Who paid. Only shown in households with more than one person. `value` is { paidBy }; an empty paidBy
 * means `creator` paid.
 */
export default function HouseholdFields({ value, onChange, creator }) {
  const { t } = useTheme();
  const { members, isShared, meEmail } = useHousehold();
  if (!isShared) return null;

  const payer = value.paidBy || creator || meEmail;
  const chip = (active) => cn(
    'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors sm:min-h-9',
    active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-primary/10'
  );

  return (
    <div className="space-y-1.5 rounded-2xl border border-border p-2 sm:p-3">
      <Label className="text-xs text-muted-foreground sm:text-sm">{t('paidBy')}</Label>
      <div role="radiogroup" aria-label={t('paidBy')} className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button key={m.email} type="button" role="radio" aria-checked={payer === m.email}
            onClick={() => onChange({ ...value, paidBy: m.email })} className={chip(payer === m.email)}>
            <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: m.color }} aria-hidden>{m.initials}</span>
            {m.isMe ? t('hhYou') : m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
