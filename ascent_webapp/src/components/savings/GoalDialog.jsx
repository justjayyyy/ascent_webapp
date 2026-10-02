import React, { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { localeOf, moneyIn } from '../plans/PlanParts';
import { SAVING_KINDS, goalEmoji, kindOf, savedIn } from './savingsUtils';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const emptyForm = (currency, kind = 'emergency') => ({
  name: '', kind, target: '', currency, targetDate: '', start: '', monthly: '', notes: '',
});

/** Create a savings goal or edit its details. Only the name (for "Other") is required. */
export default function GoalDialog({ open, onClose, goal, initialKind, onSave, saving }) {
  const { t, user, language } = useTheme();
  const loc = localeOf(language);
  const [form, setForm] = useState(() => emptyForm(user?.currency || 'ILS'));
  const [nameError, setNameError] = useState('');
  const nameRef = useRef(null);
  const editing = !!goal;
  const other = form.kind === 'other';

  useEffect(() => {
    if (!open) return;
    setNameError('');
    if (goal) {
      setForm({
        name: goal.name || '', kind: kindOf(goal),
        target: goal.targetAmount ? String(goal.targetAmount) : '',
        currency: goal.currency || user?.currency || 'ILS',
        targetDate: goal.targetDate || '',
        start: goal.currentAmount ? String(goal.currentAmount) : '',
        monthly: goal.monthlyAmount ? String(goal.monthlyAmount) : '',
        notes: goal.notes || '',
      });
    } else {
      setForm(emptyForm(user?.currency || 'ILS', initialKind || 'emergency'));
    }
  }, [open, goal, initialKind, user?.currency]);

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  // A live answer to "what does it take": the monthly amount that reaches the target on the date
  const perMonth = useMemo(() => {
    const target = parseFloat(form.target) || 0;
    if (!(target > 0) || !form.targetDate) return null;
    const have = editing ? savedIn({ ...goal, currentAmount: parseFloat(form.start) || 0 }) : parseFloat(form.start) || 0;
    const left = target - have;
    if (!(left > 0)) return null;
    const months = Math.max(1, differenceInCalendarMonths(parseISO(form.targetDate), new Date()));
    return Math.ceil(left / months);
  }, [form.target, form.targetDate, form.start, editing, goal]);

  const submit = async (e) => {
    e.preventDefault();
    if (other && !form.name.trim()) {
      setNameError(t('svNameRequired'));
      nameRef.current?.focus();
      return;
    }
    const data = {
      name: form.name.trim() || t(`svKind_${form.kind}`),
      kind: form.kind,
      emoji: goal && kindOf(goal) === form.kind ? goalEmoji(goal) : SAVING_KINDS.find((k) => k.key === form.kind)?.emoji,
      targetAmount: Math.max(0, parseFloat(form.target) || 0),
      currency: form.currency,
      targetDate: form.targetDate || null,
      currentAmount: Math.max(0, parseFloat(form.start) || 0),
      monthlyAmount: Math.max(0, parseFloat(form.monthly) || 0),
      notes: form.notes,
    };
    if (!editing) data.entries = [];
    await onSave(data);
  };

  const money = moneyIn(loc, form.currency);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-4 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold sm:text-xl">{editing ? t('svEditGoal') : t('svNewGoal')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t('svDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-1 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('svKind')}</Label>
            <div role="radiogroup" aria-label={t('svKind')} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {SAVING_KINDS.map(({ key, emoji }) => {
                const active = form.kind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      set({ kind: key });
                      setNameError('');
                      if (key === 'other') requestAnimationFrame(() => nameRef.current?.focus());
                    }}
                    className={cn(
                      'flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-xs font-medium transition-[background-color,border-color,transform] active:scale-95',
                      active ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-foreground/[0.05]'
                    )}
                  >
                    <span aria-hidden className="text-xl leading-none">{emoji}</span>
                    <span className="w-full truncate text-center">{t(`svKindShort_${key}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sv-name" className={cn('text-sm', other ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {other ? t('svOtherName') : t('svName')}
            </Label>
            <Input
              id="sv-name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => { set({ name: e.target.value }); if (nameError) setNameError(''); }}
              placeholder={t(`svKind_${form.kind}`)}
              maxLength={200}
              enterKeyHint="next"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'sv-name-error' : undefined}
              className={cn('h-11', other && 'border-primary/60', nameError && 'border-danger')}
            />
            {nameError && <p id="sv-name-error" className="text-xs text-danger">{nameError}</p>}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="sv-target" className="text-sm text-muted-foreground">{t('svTargetAmount')} ({t('optional')})</Label>
              <Input
                id="sv-target" type="number" inputMode="decimal" min="0" step="any"
                value={form.target} onChange={(e) => set({ target: e.target.value })}
                placeholder="0" className="h-11 text-lg font-semibold tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('currency')}</Label>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="h-11 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sv-date" className="text-sm text-muted-foreground">{t('svTargetDate')} ({t('optional')})</Label>
            <Input id="sv-date" type="date" value={form.targetDate} onChange={(e) => set({ targetDate: e.target.value })} className="h-11" />
            {perMonth && (
              <p className="rounded-2xl bg-primary/[0.06] px-3 py-2 text-sm text-foreground">
                {t('svTakesPerMonth', { amount: money(perMonth) })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sv-start" className="text-sm text-muted-foreground">{t('svAlreadySaved')}</Label>
              <Input id="sv-start" type="number" inputMode="decimal" min="0" step="any" value={form.start} onChange={(e) => set({ start: e.target.value })} placeholder="0" className="h-11 tabular-nums" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sv-monthly" className="text-sm text-muted-foreground">{t('svMonthlyPlan')}</Label>
              <Input id="sv-monthly" type="number" inputMode="decimal" min="0" step="any" value={form.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder={perMonth ? String(perMonth) : '0'} className="h-11 tabular-nums" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sv-notes" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Textarea id="sv-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={5000} className="min-h-[60px]" />
          </div>

          <div className="sheet-actions flex gap-2 md:pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1">
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('svCreateGoal')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
