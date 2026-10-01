import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useTheme } from '../ThemeProvider';
import { newPaymentId } from './commitmentUtils';

/**
 * Money paid towards a commitment outside its schedule: an extra payment on a loan, or a repayment
 * of a flexible one. Borrowed money can also be added to Expenses in the same step.
 */
export default function PaymentDialog({ open, onClose, commitment, mode, onSave }) {
  const { t } = useTheme();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [addExpense, setAddExpense] = useState(true);
  const [error, setError] = useState('');
  const lent = commitment?.direction === 'lent';

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNote('');
    setAddExpense(!lent);
    setError('');
  }, [open, lent]);

  const submit = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) { setError(t('amountGreaterThanZero')); return; }
    onSave({ id: newPaymentId(), date, amount: value, note: note.trim() }, !lent && addExpense);
  };

  const title = mode === 'extra' ? t('cmAddExtra') : lent ? t('cmRecordRepaymentLent') : t('cmRecordRepayment');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-[95vw] p-4 sm:w-full sm:max-w-sm sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-pretty">
            {mode === 'extra' ? t('cmExtraHint') : lent ? t('cmRepaymentLentHint') : t('cmRepaymentHint')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-1 space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="cm-pay-amount" className="text-sm text-muted-foreground">{t('amount')} ({commitment?.currency})</Label>
              <Input id="cm-pay-amount" type="number" inputMode="decimal" min="0" step="any" autoFocus value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-12 text-xl font-semibold tabular-nums" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-pay-date" className="text-sm text-muted-foreground">{t('date')}</Label>
              <Input id="cm-pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-40" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cm-pay-note" className="text-sm text-muted-foreground">{t('notes')} ({t('optional')})</Label>
            <Input id="cm-pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-11" />
          </div>
          {!lent && (
            <label htmlFor="cm-pay-expense" className="flex cursor-pointer items-start gap-3 rounded-2xl bg-primary/[0.06] p-3">
              <Checkbox id="cm-pay-expense" checked={addExpense} onCheckedChange={(v) => setAddExpense(!!v)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t('cmAlsoExpense')}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('cmAlsoExpenseHint')}</span>
              </span>
            </label>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1">{t('cancel')}</Button>
            <Button type="submit" className="h-11 flex-1">{t('save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
