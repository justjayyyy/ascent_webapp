import React, { useState } from 'react';
import { toast } from 'sonner';
import { Scale, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MemberAvatar from '@/components/workspace/MemberAvatar';
import { useListWrites } from '@/lib/offline/listWrites';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useHousehold } from '@/hooks/useHousehold';
import { useMoneyFormat, localDay } from './useInsights';

const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);

/** Who owes whom for split expenses, and a one-tap way to record paying it back. */
export default function HouseholdBalanceCard({ balances }) {
  const { t } = useTheme();
  const { hasPermission } = useAuth();
  const { byEmail, meEmail } = useHousehold();
  const { money, currency, blur } = useMoneyFormat();
  const settlementsApi = useListWrites('settlements');
  const [settling, setSettling] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const m = (v) => (blur ? '••••' : money(v));
  const nameOf = (email) => (email === meEmail ? t('hhYou') : byEmail[email]?.name || email.split('@')[0]);

  // The viewer's own debts first
  const debts = [...balances.debts].sort((a, b) => ((b.from === meEmail || b.to === meEmail) - (a.from === meEmail || a.to === meEmail)));
  const headline = (d) => {
    if (d.to === meEmail) return fill(t('hhOwesYou'), { name: nameOf(d.from) });
    if (d.from === meEmail) return fill(t('hhYouOwe'), { name: nameOf(d.to) });
    return fill(t('hhOwes'), { from: nameOf(d.from), to: nameOf(d.to) });
  };

  const openSettle = (d) => {
    setSettling(d);
    setAmount(String(d.amount));
    setNote('');
  };

  const record = async (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return;
    setSaving(true);
    try {
      const { outcome } = await settlementsApi.create({ from: settling.from, to: settling.to, amount: value, currency, date: localDay(), note: note.trim() });
      if (outcome === 'queued') toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
      else toast.success(t('hhSettled'));
      setSettling(null);
    } catch {
      toast.error(t('hhSettleFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold"><Scale className="h-4 w-4 text-primary" aria-hidden />{t('hhTitle')}</h2>
      {debts.length === 0 ? (
        <div className="mt-4">
          <p className="text-2xl font-semibold tracking-tight text-success">{t('hhEven')}</p>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">{t('hhEvenHint')}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {debts.map((d) => {
            const other = d.to === meEmail ? d.from : d.to;
            const member = byEmail[other];
            return (
              <li key={`${d.from}-${d.to}`} className="space-y-3">
                <div className="flex items-center gap-3">
                  {member && <MemberAvatar member={member} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground text-pretty">{headline(d)}</p>
                    <p className={`text-2xl font-semibold tracking-tight tabular-nums ${d.to === meEmail ? 'text-success' : ''}`}>{m(d.amount)}</p>
                  </div>
                </div>
                {hasPermission('editExpenses') && (
                  <Button type="button" variant="outline" className="h-11 w-full rounded-full sm:h-10" onClick={() => openSettle(d)}>
                    {t('hhSettleUp')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!settling} onOpenChange={(o) => !o && setSettling(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('hhSettleTitle')}</DialogTitle>
            {settling && <DialogDescription>{fill(t('hhSettleDesc'), { from: nameOf(settling.from), to: nameOf(settling.to) })}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={record} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">{t('amount')}</Label>
              <Input id="settle-amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} className="h-12 text-2xl font-semibold tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-note">{t('hhNote')}</Label>
              <Input id="settle-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setSettling(null)}>{t('cancel')}</Button>
              <Button type="submit" className="h-11 flex-1" disabled={saving || !(parseFloat(amount) > 0)}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('hhSettleUp')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
