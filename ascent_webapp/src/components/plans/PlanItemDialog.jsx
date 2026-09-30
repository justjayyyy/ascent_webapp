import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { translateCategory } from '@/lib/translations';
import { useTheme } from '../ThemeProvider';
import { newPlanItemId } from './planUtils';

const STATUSES = ['planned', 'booked', 'paid'];

/** Add or edit one cost of a plan: what it is, how much, when the money goes out and where it stands. */
export default function PlanItemDialog({ open, onClose, item, currency, categories = [], onSave, onDelete }) {
  const { t, language } = useTheme();
  const [form, setForm] = useState({ name: '', amount: '', dueDate: '', category: '', status: 'planned', note: '' });
  const editing = !!item;
  const expenseCategories = categories.filter((c) => c.type === 'Expense' || c.type === 'Both' || !c.type);
  // Paid through a recorded expense: the expense is the source of truth, so the status stays
  const lockedPaid = item?.status === 'paid' && !!item?.transactionId;

  useEffect(() => {
    if (!open) return;
    setForm(item
      ? { name: item.name || '', amount: item.amount ? String(item.amount) : '', dueDate: item.dueDate || '', category: item.category || '', status: item.status || 'planned', note: item.note || '' }
      : { name: '', amount: '', dueDate: '', category: expenseCategories[0]?.name || '', status: 'planned', note: '' });
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...(item || { id: newPlanItemId(), transactionId: null }),
      name: form.name.trim() || t('planItem'),
      amount: Math.max(0, parseFloat(form.amount) || 0),
      dueDate: form.dueDate || null,
      category: form.category,
      status: form.status,
      note: form.note,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-4 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{editing ? t('editPlanItem') : t('addPlanItem')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t('planItemHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-name" className="text-sm text-muted-foreground">{t('planItemName')}</Label>
            <Input id="item-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('planItemNamePlaceholder')} maxLength={200} className="h-11" autoFocus={!editing} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="item-amount" className="text-sm text-muted-foreground">{t('amount')} ({currency})</Label>
              <Input id="item-amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" className="h-11 text-lg font-semibold tabular-nums" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-due" className="text-sm text-muted-foreground">{t('dueDate')}</Label>
              <Input id="item-due" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-11" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('category')}</Label>
            <Select value={form.category || undefined} onValueChange={(v) => set({ category: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t('category')} /></SelectTrigger>
              <SelectContent>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id || c.name} value={c.name}>{c.icon ? `${c.icon} ` : ''}{translateCategory(c.name, language)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('status')}</Label>
            <div role="radiogroup" aria-label={t('status')} className="grid grid-cols-3 gap-1 rounded-2xl bg-foreground/[0.05] p-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={form.status === s}
                  disabled={lockedPaid && s !== 'paid'}
                  onClick={() => set({ status: s })}
                  className={cn(
                    "min-h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-40",
                    form.status === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`planStatus_${s}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{lockedPaid ? t('planItemPaidLocked') : t(`planStatusHint_${form.status}`)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-note" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Input id="item-note" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} className="h-11" placeholder={t('planItemNotePlaceholder')} />
          </div>
          <div className="flex gap-2 pt-1">
            {editing && onDelete && (
              <Button type="button" variant="ghost" onClick={() => onDelete(item)} aria-label={t('delete')} className="h-11 w-11 shrink-0 p-0 text-danger hover:bg-danger/10 hover:text-danger">
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" className="h-11 flex-1">{t('save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
