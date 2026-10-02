import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isCoarsePointer } from '@/lib/pointer';
import { useTheme } from '../ThemeProvider';
import { localeOf, moneyIn } from '../plans/PlanParts';
import { newEntryId } from './savingsUtils';

const roundUp = (v) => (v >= 100 ? Math.ceil(v / 10) * 10 : Math.ceil(v));

/**
 * Put money into a goal or take some out. New entries offer the amounts that matter for this goal:
 * the monthly plan, what a month needs to stay on track, and what is left to reach the target.
 */
export default function EntryDialog({ open, onClose, goal, totals, entry, initialMode = 'in', onSave, onDelete }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const money = moneyIn(loc, goal?.currency);
  const editing = !!entry;
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (entry) {
      setMode(entry.amount < 0 ? 'out' : 'in');
      setAmount(String(Math.abs(entry.amount)));
      setDate(entry.date);
      setNote(entry.note || '');
    } else {
      setMode(initialMode);
      setAmount('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setNote('');
    }
  }, [open, entry, initialMode]);

  const quick = useMemo(() => {
    if (!totals || editing || mode !== 'in') return [];
    const seen = new Set();
    return [
      totals.monthly > 0 && { key: 'svQuickMonthly', value: totals.monthly },
      totals.needPerMonth > 0 && { key: 'svQuickOnTrack', value: roundUp(totals.needPerMonth) },
      totals.remaining > 0 && { key: 'svQuickRest', value: Math.round(totals.remaining * 100) / 100 },
    ].filter((q) => q && !seen.has(q.value) && seen.add(q.value));
  }, [totals, editing, mode]);

  // What can come out: everything saved, without this entry when it is being edited
  const available = (totals?.saved || 0) - (entry?.amount || 0);

  const submit = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) { setError(t('amountGreaterThanZero')); return; }
    if (mode === 'out' && value > available + 0.005) {
      setError(t('svOutTooMuch', { amount: money(Math.max(0, available)) }));
      return;
    }
    onSave({
      ...(entry || { id: newEntryId() }),
      date: date || format(new Date(), 'yyyy-MM-dd'),
      amount: mode === 'out' ? -value : value,
      note: note.trim(),
    });
  };

  const title = editing ? t('svEditEntry') : mode === 'out' ? t('svTakeOut') : t('svAddMoney');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-[95vw] p-4 sm:w-full sm:max-w-sm sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-pretty">
            {goal?.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-1 space-y-4">
          <div role="radiogroup" aria-label={t('type')} className="grid grid-cols-2 gap-1 rounded-2xl bg-foreground/[0.05] p-1">
            {['in', 'out'].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => { setMode(m); setError(''); }}
                className={cn(
                  'min-h-10 rounded-xl text-sm font-medium transition-colors',
                  mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(m === 'in' ? 'svDeposit' : 'svWithdrawal')}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sv-entry-amount" className="text-sm text-muted-foreground">{t('amount')} ({goal?.currency})</Label>
            <Input
              id="sv-entry-amount" type="number" inputMode="decimal" min="0" step="any"
              autoFocus={!isCoarsePointer()}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); if (error) setError(''); }}
              placeholder="0"
              aria-invalid={!!error}
              aria-describedby={error ? 'sv-entry-error' : undefined}
              className="h-12 text-xl font-semibold tabular-nums"
            />
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => { setAmount(String(q.value)); setError(''); }}
                    className="min-h-9 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary transition-[background-color,transform] hover:bg-primary/15 active:scale-95"
                  >
                    {t(q.key)} · <span dir="ltr" className="tabular-nums">{money(q.value)}</span>
                  </button>
                ))}
              </div>
            )}
            {mode === 'out' && !editing && totals?.saved > 0 && (
              <p className="text-xs text-muted-foreground">{t('svAvailable', { amount: money(totals.saved) })}</p>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="sv-entry-date" className="text-sm text-muted-foreground">{t('date')}</Label>
              <Input id="sv-entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-40" />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="sv-entry-note" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
              <Input id="sv-entry-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-11" placeholder={t(mode === 'out' ? 'svNoteOutPlaceholder' : 'svNoteInPlaceholder')} />
            </div>
          </div>

          {error && <p id="sv-entry-error" role="alert" className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            {editing && onDelete && (
              <Button type="button" variant="ghost" onClick={() => onDelete(entry)} aria-label={t('delete')} className="h-11 w-11 shrink-0 p-0 text-danger hover:bg-danger/10 hover:text-danger">
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
