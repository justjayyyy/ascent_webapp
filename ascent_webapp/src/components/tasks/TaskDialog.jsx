import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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
import { REPEATS, TASK_KINDS, TEMPLATES, kindEmoji, taskEmoji } from './taskUtils';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const REMIND = [1, 3, 7, 14, 30];
const ANYONE = '__anyone';
const NONE = '__none';

const emptyForm = (currency) => ({
  title: '', kind: 'other', dueDate: '', repeat: 'none', amount: '', currency, category: '', assignee: '', remindDays: 7, notes: '',
});

/** The household's own category for a default key (a template's "insurance"), or ''. */
export const categoryFor = (categories, key) => {
  const c = categories.find((x) => x.nameKey === key || x.name === key);
  return c ? c.name : '';
};

/** Create a household task or edit it. Only the title is required; a template fills in the rest. */
export default function TaskDialog({ open, onClose, task, template = null, categories = [], onSave, onDelete, saving }) {
  const { t, user, language } = useTheme();
  const { members, isShared } = useHousehold();
  const [form, setForm] = useState(() => emptyForm(user?.currency || 'ILS'));
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const editing = !!task;

  useEffect(() => {
    if (!open) return;
    setError('');
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
    } else setForm(blank);
    // Only when the dialog opens, not on every list refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, template, user?.currency]);

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));
  const expenseCategories = useMemo(() => categories.filter((c) => c.type !== 'Income'), [categories]);

  const applyTemplate = ([titleKey, kind, repeat, categoryKey]) => {
    set({ title: t(titleKey), kind, repeat, category: categoryFor(categories, categoryKey) || form.category });
    setError('');
    requestAnimationFrame(() => titleRef.current?.focus());
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-4 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold sm:text-xl">{editing ? t('tkEditTask') : t('tkNewTask')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t('tkDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-1 space-y-4">
          {!editing && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('tkStartFrom')}</Label>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl[0]}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-sm font-medium text-foreground/85 transition-colors hover:bg-primary/10 active:scale-95"
                  >
                    <span aria-hidden>{kindEmoji(tpl[1])}</span>{t(tpl[0])}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tk-title" className="text-sm font-medium text-foreground">{t('tkTitle')}</Label>
            <Input
              id="tk-title"
              ref={titleRef}
              value={form.title}
              onChange={(e) => { set({ title: e.target.value }); if (error) setError(''); }}
              placeholder={t('tkTitlePlaceholder')}
              maxLength={200}
              enterKeyHint="next"
              aria-invalid={!!error}
              aria-describedby={error ? 'tk-title-error' : undefined}
              className={cn('h-11', error && 'border-danger')}
            />
            {error && <p id="tk-title-error" className="text-xs text-danger">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('tkKind')}</Label>
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
                      'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-1.5 text-[11px] font-medium transition-[background-color,border-color,transform] active:scale-95',
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tk-due" className="text-sm text-muted-foreground">{t('tkDueDate')}</Label>
              <Input id="tk-due" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('tkRepeat')}</Label>
              <Select value={form.dueDate ? form.repeat : 'none'} onValueChange={(v) => set({ repeat: v })} disabled={!form.dueDate}>
                <SelectTrigger className="h-11" aria-label={t('tkRepeat')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPEATS.map((r) => <SelectItem key={r} value={r}>{t(`tkRepeat_${r}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="tk-amount" className="text-sm text-muted-foreground">{t('tkUsualCost')} ({t('optional')})</Label>
              <Input
                id="tk-amount" type="number" inputMode="decimal" min="0" step="any"
                value={form.amount} onChange={(e) => set({ amount: e.target.value })}
                placeholder="0" className="h-11 text-lg font-semibold tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('currency')}</Label>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="h-11 w-24" aria-label={t('currency')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {parseFloat(form.amount) > 0 && expenseCategories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('tkCategory')}</Label>
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

          <div className={cn('grid gap-3', isShared ? 'grid-cols-2' : 'grid-cols-1')}>
            {isShared && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t('tkWho')}</Label>
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
              <Label className="text-sm text-muted-foreground">{t('tkRemind')}</Label>
              <Select value={String(form.remindDays)} onValueChange={(v) => set({ remindDays: Number(v) })} disabled={!form.dueDate}>
                <SelectTrigger className="h-11" aria-label={t('tkRemind')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, ...REMIND].map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? t('tkRemindOnDay') : t('tkRemindDaysBefore', { n: d })}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tk-notes" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Textarea id="tk-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} placeholder={t('tkNotesPlaceholder')} className="min-h-[60px]" />
          </div>

          <div className="sheet-actions flex gap-2 md:pt-2">
            {editing && onDelete && (
              <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={t('tkDeleteTask')} className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1">
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('tkCreate')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
