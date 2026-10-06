import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { translateCategory } from '@/lib/translations';
import { useHousehold } from '@/hooks/useHousehold';
import { useTheme } from '../ThemeProvider';
import { localeOf } from '../plans/PlanParts';
import { REPEATS, TASK_KINDS, TEMPLATES, kindEmoji, taskEmoji } from './taskUtils';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const REMIND = [1, 3, 7, 14, 30];
const ANYONE = '__anyone';
const NONE = '__none';
const SUGGESTED = 6;

const emptyForm = (currency) => ({
  title: '', kind: 'other', dueDate: '', repeat: 'none', amount: '', currency, category: '', assignee: '', remindDays: 7, notes: '',
});

/** The household's own category for a default key (a template's "insurance"), or ''. */
export const categoryFor = (categories, key) => {
  const c = categories.find((x) => x.nameKey === key || x.name === key);
  return c ? c.name : '';
};

const symbolOf = (currency, loc) => {
  try {
    return new Intl.NumberFormat(loc, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
};

/** A row of choices as round chips, one of them picked. */
function ChipChoice({ label, value, options, onChange, disabled, className }) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map(([key, text]) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex min-h-10 items-center rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,box-shadow,transform] active:scale-95 disabled:pointer-events-none disabled:opacity-45',
              on ? 'bg-primary/[0.16] text-primary shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.5)]' : 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/[0.1]'
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Create a household task or edit it. Four things up front (what, when, how often, what it costs);
 * who, the reminder, the category, the currency and notes fold under More. Only the title is required,
 * and a suggestion fills in the rest.
 */
export default function TaskDialog({ open, onClose, task, template = null, categories = [], takenTitles = [], onSave, onDelete, saving }) {
  const { t, user, language } = useTheme();
  const loc = localeOf(language);
  const { members, isShared } = useHousehold();
  const [form, setForm] = useState(() => emptyForm(user?.currency || 'ILS'));
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [allIdeas, setAllIdeas] = useState(false);
  const [picked, setPicked] = useState(null);
  const titleRef = useRef(null);
  const editing = !!task;

  useEffect(() => {
    if (!open) return;
    setError('');
    setMore(false);
    setAllIdeas(false);
    setPicked(null);
    if (task) {
      setForm({
        title: task.title || '', kind: task.kind || 'other', dueDate: task.dueDate || '', repeat: task.repeat || 'none',
        amount: task.amount ? String(task.amount) : '', currency: task.currency || user?.currency || 'ILS',
        category: task.category || '', assignee: task.assignee || '', remindDays: task.remindDays ?? 7, notes: task.notes || '',
      });
      return;
    }
    const blank = emptyForm(user?.currency || 'ILS');
    // Opened from a suggestion on the empty page: start from it
    if (template) {
      const [titleKey, kind, repeat, categoryKey] = template;
      setForm({ ...blank, title: t(titleKey), kind, repeat, category: categoryFor(categories, categoryKey) });
      setPicked(titleKey);
    } else setForm(blank);
    // Only when the dialog opens, not on every list refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, template, user?.currency]);

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));
  const expenseCategories = useMemo(() => categories.filter((c) => c.type !== 'Income'), [categories]);
  // Suggestions the household does not have yet
  const ideas = useMemo(() => {
    const taken = new Set(takenTitles.map((x) => String(x).trim().toLowerCase()));
    return TEMPLATES.filter((tpl) => !taken.has(t(tpl[0]).toLowerCase()));
  }, [takenTitles, t]);
  const shownIdeas = allIdeas ? ideas : ideas.slice(0, SUGGESTED);
  const person = members.find((m) => m.email === form.assignee);
  const hasCost = parseFloat(form.amount) > 0;

  const applyTemplate = ([titleKey, kind, repeat, categoryKey]) => {
    set({ title: t(titleKey), kind, repeat, category: categoryFor(categories, categoryKey) || form.category });
    setPicked(titleKey);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setError(t('tkTitleRequired'));
      titleRef.current?.focus();
      return;
    }
    await onSave({
      title: title.slice(0, 200),
      kind: form.kind,
      emoji: task && task.kind === form.kind ? taskEmoji(task) : kindEmoji(form.kind),
      dueDate: form.dueDate || null,
      repeat: form.dueDate ? form.repeat : 'none',
      amount: Math.max(0, parseFloat(form.amount) || 0),
      currency: form.currency,
      category: form.category,
      assignee: form.assignee,
      remindDays: Number(form.remindDays) || 0,
      notes: form.notes.slice(0, 2000),
    });
  };

  // What is set under More, so it can stay folded and still say so
  const moreSummary = [
    isShared && (person ? person.name : t('tkAnyone')),
    form.dueDate && (form.remindDays ? t('tkRemindDaysBefore', { n: form.remindDays }) : t('tkRemindOnDay')),
    form.category && translateCategory(form.category, language),
    form.notes.trim() && t('notes'),
  ].filter(Boolean).join(' · ');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle className="text-xl font-bold tracking-tight">{editing ? t('tkEditTask') : t('tkNewTask')}</DialogTitle>
          <DialogDescription className="sr-only">{t('tkDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tk-title" className="text-[13px] font-semibold text-muted-foreground">{t('tkTitle')}</Label>
            <Input
              id="tk-title"
              ref={titleRef}
              value={form.title}
              onChange={(e) => { set({ title: e.target.value }); setPicked(null); if (error) setError(''); }}
              placeholder={t('tkTitlePlaceholder')}
              maxLength={200}
              enterKeyHint="next"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? 'tk-title-error' : undefined}
              className={cn('h-12 rounded-[14px] text-base', error && 'border-danger')}
            />
            {error && <p id="tk-title-error" className="text-[13px] font-medium text-danger">{error}</p>}
            {!editing && ideas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1" aria-label={t('tkStartFrom')} role="group">
                {shownIdeas.map((tpl) => (
                  <button
                    key={tpl[0]}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    aria-pressed={picked === tpl[0]}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-[background-color,color,transform] active:scale-95',
                      picked === tpl[0] ? 'bg-primary/[0.16] text-primary shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.5)]' : 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/[0.1]'
                    )}
                  >
                    <span aria-hidden>{kindEmoji(tpl[1])}</span>{t(tpl[0])}
                  </button>
                ))}
                {ideas.length > SUGGESTED && (
                  <button type="button" onClick={() => setAllIdeas((v) => !v)} className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-semibold text-primary hover:bg-primary/10">
                    {allIdeas ? t('showLess') : t('showMore')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="tk-due" className="text-[13px] font-semibold text-muted-foreground">{t('tkDueDate')}</Label>
              <Input id="tk-due" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-12 min-w-0 rounded-[14px] text-[15px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tk-amount" className="text-[13px] font-semibold text-muted-foreground">{t('tkUsualCost')} <span className="font-normal">({t('optional')})</span></Label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-base font-semibold text-muted-foreground">{symbolOf(form.currency, loc)}</span>
                <Input
                  id="tk-amount" type="number" inputMode="decimal" min="0" step="any"
                  value={form.amount} onChange={(e) => set({ amount: e.target.value })}
                  placeholder="0" className="h-12 rounded-[14px] ps-9 text-lg font-bold tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p id="tk-repeat-label" className="text-[13px] font-semibold text-muted-foreground">{t('tkRepeat')}</p>
            <ChipChoice
              label={t('tkRepeat')}
              value={form.dueDate ? form.repeat : 'none'}
              options={REPEATS.map((r) => [r, t(`tkRepeat_${r}`)])}
              onChange={(v) => set({ repeat: v })}
              disabled={!form.dueDate}
            />
            {!form.dueDate && <p className="text-[13px] text-muted-foreground">{t('tkSetDateToRepeat')}</p>}
          </div>

          <div className="overflow-hidden rounded-2xl bg-foreground/[0.04]">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              aria-controls="tk-more"
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-start"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t('tkMoreOptions')}</span>
                <span className="block truncate text-[13px] text-muted-foreground">{moreSummary || t('tkMoreHint')}</span>
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', more && 'rotate-180')} aria-hidden />
            </button>

            {more && (
              <div id="tk-more" className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3.5">
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-muted-foreground">{t('tkKind')}</p>
                  <div role="radiogroup" aria-label={t('tkKind')} className="grid grid-cols-5 gap-1.5">
                    {TASK_KINDS.map(({ key, emoji }) => {
                      const active = form.kind === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => set({ kind: key })}
                          className={cn(
                            'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,transform] active:scale-95',
                            active ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-foreground/[0.05]'
                          )}
                        >
                          <span aria-hidden className="text-lg leading-none">{emoji}</span>
                          <span className="w-full truncate text-center">{t(`tkKind_${key}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={cn('grid gap-3 [&>*]:min-w-0', isShared ? 'grid-cols-2' : 'grid-cols-1')}>
                  {isShared && (
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold text-muted-foreground">{t('tkWho')}</Label>
                      <Select value={form.assignee || ANYONE} onValueChange={(v) => set({ assignee: v === ANYONE ? '' : v })}>
                        <SelectTrigger className="h-11" aria-label={t('tkWho')}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANYONE}>{t('tkAnyone')}</SelectItem>
                          {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold text-muted-foreground">{t('tkRemind')}</Label>
                    <Select value={String(form.remindDays)} onValueChange={(v) => set({ remindDays: Number(v) })} disabled={!form.dueDate}>
                      <SelectTrigger className="h-11" aria-label={t('tkRemind')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, ...REMIND].map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? t('tkRemindOnDay') : t('tkRemindDaysBefore', { n: d })}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className={cn('grid gap-3 [&>*]:min-w-0', hasCost && expenseCategories.length > 0 ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
                  {hasCost && expenseCategories.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold text-muted-foreground">{t('tkCategory')}</Label>
                      <Select value={form.category || NONE} onValueChange={(v) => set({ category: v === NONE ? '' : v })}>
                        <SelectTrigger className="h-11" aria-label={t('tkCategory')}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('tkChooseLater')}</SelectItem>
                          {expenseCategories.map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ''}{translateCategory(c.nameKey || c.name, language)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold text-muted-foreground">{t('currency')}</Label>
                    <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                      <SelectTrigger className={cn('h-11', hasCost && expenseCategories.length > 0 && 'w-24')} aria-label={t('currency')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tk-notes" className="text-[13px] font-semibold text-muted-foreground">{t('notes')} <span className="font-normal">({t('optional')})</span></Label>
                  <Textarea id="tk-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} placeholder={t('tkNotesPlaceholder')} className="min-h-[72px]" />
                </div>
              </div>
            )}
          </div>

          <div className="sheet-actions flex gap-2 md:pt-1">
            {editing && onDelete && (
              <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={t('tkDeleteTask')} className="h-12 w-12 shrink-0 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving} className="h-12 flex-1 rounded-2xl text-[15px] font-semibold">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-12 flex-[1.4] rounded-2xl text-[15px] font-bold">
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('tkCreate')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
