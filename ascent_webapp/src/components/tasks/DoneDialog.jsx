import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { localDay } from '@/lib/localDay';
import { translateCategory } from '@/lib/translations';
import { useTheme } from '../ThemeProvider';
import { formatDay, localeOf } from '../plans/PlanParts';
import { nextDue, taskEmoji } from './taskUtils';

/**
 * Ticking off a task that costs money: what it cost this time, and whether that goes in as an expense.
 * A repeating task says when it comes round next.
 */
export default function DoneDialog({ task, open, onClose, onDone, canLog, saving }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDay());
  const [log, setLog] = useState(true);

  useEffect(() => {
    if (!open || !task) return;
    setAmount(task.amount ? String(task.amount) : '');
    setDate(localDay());
    setLog(canLog && task.amount > 0);
  }, [open, task, canLog]);

  if (!task) return null;
  const value = Math.max(0, parseFloat(amount) || 0);
  let next = nextDue(task.dueDate, task.repeat);
  while (next && next <= date) next = nextDue(next, task.repeat);

  const submit = (e) => {
    e.preventDefault();
    onDone({ amount: value, date: date || localDay(), log: canLog && log && value > 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] p-5 sm:max-w-sm sm:p-6">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success/15 text-2xl">{taskEmoji(task)}</span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl font-bold tracking-tight">{task.title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {next ? t('tkNextTimeOn', { date: formatDay(next, loc, true) }) : t('tkDoneHint')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="tk-done-amount" className="text-sm text-muted-foreground">{t('tkItCost', { currency: task.currency || '' })}</Label>
              <Input
                id="tk-done-amount" type="number" inputMode="decimal" min="0" step="any" autoFocus
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="h-12 text-xl font-bold tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tk-done-date" className="text-sm text-muted-foreground">{t('tkDoneOn')}</Label>
              <Input id="tk-done-date" type="date" value={date} max={localDay()} onChange={(e) => setDate(e.target.value)} className="h-12" />
            </div>
          </div>

          {canLog && (
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] p-3.5">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t('tkLogExpense')}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {task.category ? translateCategory(task.category, language) : t('tkLogExpenseHint')}
                </span>
              </span>
              <Switch checked={log && value > 0} disabled={!(value > 0)} onCheckedChange={setLog} aria-label={t('tkLogExpense')} />
            </label>
          )}

          <div className="sheet-actions flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1 bg-success text-background hover:bg-success/90">
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Check className="me-2 h-4 w-4" strokeWidth={3} />}
              {t('tkMarkDone')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
