import React from 'react';
import { Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { useHousehold } from '@/hooks/useHousehold';
import { splitShares } from '../../../shared/balances.js';

const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);

/** Custom percentages that add up to 100 (a small rounding slack is allowed). */
export const splitIsValid = (split) =>
  !split || split.mode !== 'custom' || Math.abs(split.shares.reduce((s, x) => s + (Number(x.percent) || 0), 0) - 100) < 0.5;

/**
 * Who paid and, when one person fronted money for the others, how it is shared. Only shown in
 * households with more than one person. `value` is { paidBy, split }; an empty paidBy means `creator` paid.
 */
export default function HouseholdFields({ value, onChange, amount, currency, error, creator }) {
  const { t, language } = useTheme();
  const { members, isShared, meEmail } = useHousehold();
  if (!isShared) return null;

  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const money = (v) => new Intl.NumberFormat(loc, { style: 'currency', currency: currency || 'ILS', maximumFractionDigits: 2 }).format(v || 0);
  const payer = value.paidBy || creator || meEmail;
  const split = value.split;
  const everyone = members.map((m) => m.email);

  const setSplit = (next) => onChange({ ...value, split: next });
  const toggleSplit = (on) => setSplit(on ? { mode: 'equal', shares: everyone.map((email) => ({ email })) } : null);
  const setMode = (mode) => setSplit(mode === 'equal'
    ? { mode, shares: everyone.map((email) => ({ email })) }
    : { mode, shares: everyone.map((email) => ({ email, percent: Math.round((100 / everyone.length) * 10) / 10 })) });
  // Two people: typing one share fills in the other
  const setPercent = (email, percent) => setSplit({
    ...split,
    shares: split.shares.map((s) => {
      if (s.email === email) return { ...s, percent };
      if (split.shares.length === 2 && percent !== '') return { ...s, percent: Math.max(0, Math.round((100 - percent) * 10) / 10) };
      return s;
    }),
  });

  const shares = split ? splitShares(split, everyone) : null;
  const owed = shares && amount > 0
    ? shares.filter((s) => s.email !== payer).map((s) => ({ email: s.email, amount: amount * s.fraction }))
    : [];
  const nameOf = (email) => members.find((m) => m.email === email)?.name || email;
  const chip = (active) => cn(
    'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors sm:min-h-9',
    active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-primary/10'
  );

  return (
    <div className={cn('space-y-3 rounded-2xl border p-2 sm:p-3', split ? 'border-primary/40 bg-primary/[0.06]' : 'border-border')}>
      <div className="space-y-1.5">
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

      <div className="flex items-center gap-2">
        <Checkbox id="splitExpense" checked={!!split} onCheckedChange={(c) => toggleSplit(!!c)} />
        <Label htmlFor="splitExpense" className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
          <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />{t('splitExpense')}
        </Label>
      </div>
      {!split && <p className="-mt-1 ps-6 text-xs text-muted-foreground text-pretty">{t('splitHelp')}</p>}

      {split && (
        <div className="space-y-2 ps-6">
          <div role="radiogroup" aria-label={t('splitExpense')} className="flex gap-2">
            {['equal', 'custom'].map((mode) => (
              <button key={mode} type="button" role="radio" aria-checked={split.mode === mode} onClick={() => setMode(mode)} className={chip(split.mode === mode)}>
                {t(mode === 'equal' ? 'splitEqual' : 'splitCustom')}
              </button>
            ))}
          </div>
          {split.mode === 'custom' && (
            <ul className="space-y-1.5">
              {split.shares.map((s) => (
                <li key={s.email} className="flex items-center justify-between gap-2 text-sm">
                  <label htmlFor={`share-${s.email}`} className="truncate">{s.email === meEmail ? t('hhYou') : nameOf(s.email)}</label>
                  <span className="flex items-center gap-1">
                    <Input id={`share-${s.email}`} type="number" inputMode="decimal" min="0" max="100" step="1" value={s.percent ?? ''}
                      onChange={(e) => setPercent(s.email, e.target.value === '' ? '' : Number(e.target.value))}
                      className="h-10 w-20 text-center tabular-nums" />
                    <span className="text-muted-foreground">%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          {owed.length > 0 && (
            <p className="text-xs font-medium text-primary tabular-nums">
              {owed.map((o) => fill(t('splitOwedPreview'), { name: o.email === meEmail ? t('hhYou') : nameOf(o.email), amount: money(o.amount) })).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
