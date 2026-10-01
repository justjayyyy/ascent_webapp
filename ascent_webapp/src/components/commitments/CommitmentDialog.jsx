import React, { useEffect, useMemo, useState } from 'react';
import { format, addMonths } from 'date-fns';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { translateCategory } from '@/lib/translations';
import { useTheme } from '../ThemeProvider';
import { localeOf, moneyIn } from '../plans/PlanParts';
import { buildSchedule, paymentOf } from '../../../shared/commitments.js';
import { COMMITMENT_KINDS, LENT_KINDS, kindOf, durationText, monthYear } from './commitmentUtils';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const nextMonth = () => format(addMonths(new Date(), 1), 'yyyy-MM-dd');

const emptyForm = (currency, direction = 'borrowed', kind = 'personal') => ({
  direction, kind, name: '', lender: '', principal: '', currency,
  schedule: kind === 'family' ? 'flexible' : 'monthly',
  annualRate: '', by: 'payment', payment: '', termMonths: '', firstPaymentDate: nextMonth(),
  category: kindOf(kind).category, notes: '',
});

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-foreground/[0.06] p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "min-h-10 rounded-xl px-2 text-sm font-medium transition-[background-color,color,box-shadow]",
            value === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Add a loan, mortgage or money lent out, or edit one. Shows what the numbers mean as you type. */
export default function CommitmentDialog({ open, onClose, commitment, initial, categories = [], onSave, saving }) {
  const { t, user, language } = useTheme();
  const loc = localeOf(language);
  const [form, setForm] = useState(() => emptyForm(user?.currency || 'ILS'));
  const [error, setError] = useState('');
  const editing = !!commitment;

  useEffect(() => {
    if (!open) return;
    setError('');
    if (commitment) {
      const c = commitment;
      setForm({
        direction: c.direction || 'borrowed', kind: c.kind || 'other', name: c.name || '', lender: c.lender || '',
        principal: c.principal ? String(c.principal) : '', currency: c.currency || user?.currency || 'ILS',
        schedule: paymentOf(c) > 0 && c.firstPaymentDate ? 'monthly' : 'flexible',
        annualRate: c.annualRate ? String(c.annualRate) : '',
        by: c.payment > 0 || !c.termMonths ? 'payment' : 'term',
        payment: c.payment ? String(c.payment) : '', termMonths: c.termMonths ? String(c.termMonths) : '',
        firstPaymentDate: c.firstPaymentDate || nextMonth(),
        category: c.category || kindOf(c.kind).category, notes: c.notes || '',
      });
    } else {
      const direction = initial?.direction || 'borrowed';
      const kind = initial?.kind || (direction === 'lent' ? 'family' : 'personal');
      setForm(emptyForm(user?.currency || 'ILS', direction, kind));
    }
  }, [open, commitment, initial, user?.currency]);

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));
  const lent = form.direction === 'lent';
  const kinds = lent ? COMMITMENT_KINDS.filter((k) => LENT_KINDS.includes(k.key)) : COMMITMENT_KINDS;
  const money = moneyIn(loc, form.currency);

  const draft = useMemo(() => {
    const principal = parseFloat(form.principal) || 0;
    if (form.schedule !== 'monthly') return { principal };
    return {
      principal,
      annualRate: parseFloat(form.annualRate) || 0,
      payment: form.by === 'payment' ? parseFloat(form.payment) || 0 : null,
      termMonths: form.by === 'term' ? parseInt(form.termMonths, 10) || null : null,
      firstPaymentDate: form.firstPaymentDate || null,
    };
  }, [form]);

  // "≈ ₪1,033 a month for 12 months · ₪393 interest · paid off Dec 2026"
  const preview = useMemo(() => {
    if (form.schedule !== 'monthly' || !(draft.principal > 0)) return null;
    const payment = paymentOf(draft);
    if (!(payment > 0) || !draft.firstPaymentDate) return null;
    const rows = buildSchedule(draft);
    const last = rows[rows.length - 1];
    if (!last || last.balance > 0) return { never: true };
    return {
      payment, months: rows.length, end: last.date,
      interest: rows.reduce((s, r) => s + r.interest, 0),
    };
  }, [draft, form.schedule]);

  const submit = async (e) => {
    e.preventDefault();
    const principal = parseFloat(form.principal);
    if (!(principal > 0)) { setError(t('cmAmountRequired')); return; }
    if (form.schedule === 'monthly') {
      if (!(paymentOf(draft) > 0)) { setError(t(form.by === 'payment' ? 'cmPaymentRequired' : 'cmTermRequired')); return; }
      if (!form.firstPaymentDate) { setError(t('cmFirstPaymentRequired')); return; }
      if (preview?.never) { setError(t('cmNeverEnds')); return; }
    }
    const monthly = form.schedule === 'monthly';
    await onSave({
      direction: form.direction,
      kind: form.kind,
      name: form.name.trim() || t(`cmKind_${form.kind}`),
      lender: form.lender.trim(),
      emoji: kindOf(form.kind).emoji,
      principal,
      currency: form.currency,
      annualRate: monthly ? parseFloat(form.annualRate) || 0 : 0,
      payment: monthly && form.by === 'payment' ? parseFloat(form.payment) || null : null,
      termMonths: monthly && form.by === 'term' ? parseInt(form.termMonths, 10) || null : null,
      firstPaymentDate: monthly ? form.firstPaymentDate : null,
      category: lent ? '' : form.category,
      notes: form.notes,
    });
  };

  const expenseCategories = categories.filter((c) => c.type === 'Expense' || c.type === 'Both' || c.type === 'expense' || c.type === 'both');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-4 sm:w-full sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold sm:text-xl">{editing ? t('cmEdit') : t('cmNew')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t('cmDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-1 space-y-5">
          <Segmented
            label={t('cmDirection')}
            value={form.direction}
            onChange={(direction) => set({
              direction,
              kind: direction === 'lent' && !LENT_KINDS.includes(form.kind) ? 'family' : form.kind,
              schedule: direction === 'lent' ? 'flexible' : form.schedule,
            })}
            options={[['borrowed', t('cmIOwe')], ['lent', t('cmOwedToMe')]]}
          />

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('cmKind')}</Label>
            <div role="radiogroup" aria-label={t('cmKind')} className={cn("grid gap-2", lent ? "grid-cols-3" : "grid-cols-4")}>
              {kinds.map(({ key, emoji, category }) => {
                const active = form.kind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ kind: key, category, schedule: key === 'family' ? 'flexible' : form.schedule === 'flexible' && form.kind === 'family' ? 'monthly' : form.schedule })}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-xs font-medium transition-[background-color,border-color,transform] active:scale-95",
                      active ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-foreground/[0.05]"
                    )}
                  >
                    <span aria-hidden className="text-xl leading-none">{emoji}</span>
                    <span className="line-clamp-2 w-full text-center leading-tight">{t(`cmKind_${key}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cm-name" className="text-sm text-muted-foreground">{t('cmName')}</Label>
              <Input id="cm-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t(`cmKind_${form.kind}`)} maxLength={200} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-lender" className="text-sm text-muted-foreground">{lent ? t('cmBorrower') : t('cmLender')} ({t('optional')})</Label>
              <Input id="cm-lender" value={form.lender} onChange={(e) => set({ lender: e.target.value })} placeholder={lent ? t('cmBorrowerPlaceholder') : t('cmLenderPlaceholder')} maxLength={200} className="h-11" />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="cm-principal" className="text-sm text-muted-foreground">{lent ? t('cmAmountLent') : t('cmAmountOwed')}</Label>
              <Input
                id="cm-principal" type="number" inputMode="decimal" min="0" step="any"
                value={form.principal} onChange={(e) => set({ principal: e.target.value })}
                placeholder="0" className="h-12 text-xl font-semibold tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('currency')}</Label>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="h-12 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!lent && !editing && <p className="-mt-3 text-xs text-muted-foreground text-pretty">{t('cmAlreadyPayingHint')}</p>}

          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">{t('cmRepayment')}</Label>
            <Segmented
              label={t('cmRepayment')}
              value={form.schedule}
              onChange={(schedule) => set({ schedule })}
              options={[['monthly', t('cmMonthlyPayments')], ['flexible', t('cmFlexible')]]}
            />
            {form.schedule === 'flexible' ? (
              <p className="text-xs text-muted-foreground text-pretty">{t('cmFlexibleHint')}</p>
            ) : (
              <div className="space-y-3 rounded-2xl bg-foreground/[0.04] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="cm-rate" className="text-xs text-muted-foreground">{t('cmRate')}</Label>
                    <div className="relative">
                      <Input id="cm-rate" type="number" inputMode="decimal" min="0" max="100" step="any" value={form.annualRate}
                        onChange={(e) => set({ annualRate: e.target.value })} placeholder="0" className="h-11 pe-8 tabular-nums" />
                      <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cm-first" className="text-xs text-muted-foreground">{t('cmNextPaymentDate')}</Label>
                    <Input id="cm-first" type="date" value={form.firstPaymentDate} onChange={(e) => set({ firstPaymentDate: e.target.value })} className="h-11" />
                  </div>
                </div>
                <Segmented
                  label={t('cmIKnow')}
                  value={form.by}
                  onChange={(by) => set({ by })}
                  options={[['payment', t('cmKnowPayment')], ['term', t('cmKnowTerm')]]}
                />
                {form.by === 'payment' ? (
                  <div className="space-y-2">
                    <Label htmlFor="cm-payment" className="text-xs text-muted-foreground">{t('cmMonthlyPayment')}</Label>
                    <Input id="cm-payment" type="number" inputMode="decimal" min="0" step="any" value={form.payment}
                      onChange={(e) => set({ payment: e.target.value })} placeholder="0" className="h-11 text-base font-semibold tabular-nums" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="cm-term" className="text-xs text-muted-foreground">{t('cmPaymentsLeftLabel')}</Label>
                    <Input id="cm-term" type="number" inputMode="numeric" min="1" max="600" step="1" value={form.termMonths}
                      onChange={(e) => set({ termMonths: e.target.value })} placeholder="60" className="h-11 text-base font-semibold tabular-nums" />
                  </div>
                )}
                {preview && (
                  <p className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-pretty", preview.never ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary")} aria-live="polite">
                    <Sparkles aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {preview.never ? t('cmNeverEnds') : t('cmPreview')
                        .replace('{payment}', money(preview.payment))
                        .replace('{duration}', durationText(preview.months, t))
                        .replace('{interest}', money(preview.interest))
                        .replace('{end}', monthYear(preview.end, loc))}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {!lent && expenseCategories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('cmCategory')}</Label>
              <Select value={form.category || 'other_expense'} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!expenseCategories.some((c) => c.name === (form.category || 'other_expense')) && (
                    <SelectItem value={form.category || 'other_expense'}>{translateCategory(form.category || 'other_expense', language)}</SelectItem>
                  )}
                  {expenseCategories.map((c) => <SelectItem key={c.id || c.name} value={c.name}>{translateCategory(c.name, language)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('cmCategoryHint')}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cm-notes" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Textarea id="cm-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={5000} className="min-h-[60px]" />
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <div className="sticky -bottom-4 z-10 -mx-4 flex gap-2 bg-popover/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:pt-2 sm:backdrop-blur-none">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1">
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('cmAdd')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
