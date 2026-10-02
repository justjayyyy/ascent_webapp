import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { PLAN_KINDS, kindEmoji, templateItems } from './planUtils';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const emptyForm = (currency, kind = 'vacation') => ({
  name: '', kind, emoji: '', startDate: '', endDate: '', budget: '', currency, notes: '', suggest: true,
});

/** Create a plan (optionally with suggested costs for its kind) or edit its details. */
export default function PlanDialog({ open, onClose, plan, initialKind, onSave, saving }) {
  const { t, user } = useTheme();
  const [form, setForm] = useState(() => emptyForm(user?.currency || 'ILS'));
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const nameRef = useRef(null);
  const editing = !!plan;
  const other = form.kind === 'other';

  useEffect(() => {
    if (!open) return;
    setError('');
    setNameError('');
    if (plan) {
      setForm({
        name: plan.name || '', kind: plan.kind || 'other', emoji: plan.emoji || '',
        startDate: plan.startDate || '', endDate: plan.endDate || '',
        budget: plan.budget ? String(plan.budget) : '', currency: plan.currency || user?.currency || 'ILS',
        notes: plan.notes || '', suggest: false,
      });
    } else {
      setForm(emptyForm(user?.currency || 'ILS', initialKind || 'vacation'));
    }
  }, [open, plan, initialKind, user?.currency]);

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  const submit = async (e) => {
    e.preventDefault();
    // "Other" has no name of its own, so the household gives it one
    if (other && !form.name.trim()) {
      setNameError(t('planNameRequired'));
      nameRef.current?.focus();
      return;
    }
    const name = form.name.trim() || t(`planKind_${form.kind}`);
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      setError(t('endDateAfterStartDate'));
      return;
    }
    const data = {
      name,
      kind: form.kind,
      emoji: form.emoji || kindEmoji(form.kind),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      budget: parseFloat(form.budget) || 0,
      currency: form.currency,
      notes: form.notes,
    };
    if (!editing) data.items = form.suggest ? templateItems(form.kind, form.startDate, t) : [];
    await onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-4 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold sm:text-xl">{editing ? t('editPlan') : t('newPlan')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t('planDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-1 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('planKind')}</Label>
            <div role="radiogroup" aria-label={t('planKind')} className="grid grid-cols-3 gap-2">
              {PLAN_KINDS.map(({ key, emoji }) => {
                const active = form.kind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      set({ kind: key, emoji: form.emoji && form.emoji !== kindEmoji(form.kind) ? form.emoji : '' });
                      setNameError('');
                      // Picking Other means naming it: straight to the name
                      if (key === 'other') requestAnimationFrame(() => nameRef.current?.focus());
                    }}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-xs font-medium transition-[background-color,border-color,transform] active:scale-95",
                      active ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-foreground/[0.05]"
                    )}
                  >
                    <span aria-hidden className="text-xl leading-none">{emoji}</span>
                    <span className="truncate">{t(`planKind_${key}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-name" className={cn('text-sm', other ? 'font-medium text-foreground' : 'text-muted-foreground')}>{other ? t('planOtherName') : t('planName')}</Label>
            <Input
              id="plan-name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => { set({ name: e.target.value }); if (nameError) setNameError(''); }}
              placeholder={t(`planNamePlaceholder_${form.kind}`)}
              maxLength={200}
              enterKeyHint="next"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'plan-name-error' : undefined}
              className={cn('h-11', other && 'border-primary/60', nameError && 'border-danger')}
            />
            {nameError && <p id="plan-name-error" className="text-xs text-danger">{nameError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-start" className="text-sm text-muted-foreground">{t('planDate')}</Label>
              <Input id="plan-start" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end" className="text-sm text-muted-foreground">{t('planEndDate')} ({t('optional')})</Label>
              <Input id="plan-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} className="h-11" />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-budget" className="text-sm text-muted-foreground">{t('planBudget')} ({t('optional')})</Label>
              <Input
                id="plan-budget" type="number" inputMode="decimal" min="0" step="1"
                value={form.budget} onChange={(e) => set({ budget: e.target.value })}
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
            <Label htmlFor="plan-notes" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Textarea id="plan-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={5000} className="min-h-[60px]" />
          </div>

          {!editing && (
            <label htmlFor="plan-suggest" className="flex cursor-pointer items-start gap-3 rounded-2xl bg-primary/[0.06] p-3">
              <Checkbox id="plan-suggest" checked={form.suggest} onCheckedChange={(v) => set({ suggest: !!v })} className="mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" /> {t('planSuggestCosts')}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('planSuggestCostsHint')}</span>
              </span>
            </label>
          )}

          <div className="sheet-actions flex gap-2 md:pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1">
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('createPlan')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
