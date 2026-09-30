import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { STRIP, expandTransaction } from './transactionRows';

async function setPlanItem(planId, itemId, changes) {
  if (!planId || !itemId) return;
  const plan = await ascent.entities.Plan.get(planId);
  if (!plan?.items?.some((i) => i.id === itemId)) return;
  await ascent.entities.Plan.update(planId, {
    items: plan.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
  });
}

/** Create or update a transaction, including recurring runs, installments and plan payments. */
export function useSaveTransaction() {
  const queryClient = useQueryClient();
  const { t } = useTheme();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (data, existing) => {
    setSaving(true);
    try {
      const isEdit = !!(existing && existing.id);
      if (isEdit) {
        const payload = { ...data };
        STRIP.forEach((k) => delete payload[k]);
        delete payload.installmentCount;
        // Saving an automatically added payment after looking at it counts as reviewing it
        if (existing.status === 'pending') payload.status = 'confirmed';
        await ascent.entities.ExpenseTransaction.update(existing.id, payload);
        toast.success(t('transactionUpdatedSuccessfully'));
      } else {
        const rows = expandTransaction(data);
        if (rows.length > 1) {
          await ascent.entities.ExpenseTransaction.bulkCreate(rows);
          const key = rows[0].installmentGroupId ? 'installmentsCreated' : 'recurringTransactionsCreated';
          toast.success(t(key).replace('{count}', rows.length));
        } else {
          const created = await ascent.entities.ExpenseTransaction.create(rows[0]);
          if (rows[0].planId && rows[0].planItemId) {
            await setPlanItem(rows[0].planId, rows[0].planItemId, { status: 'paid', transactionId: created?.id || created?._id || null });
          }
          toast.success(t('transactionAddedSuccessfully'));
        }
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      if (data.planId || existing?.planId) queryClient.invalidateQueries({ queryKey: ['plans'] });
      return true;
    } catch {
      toast.error(existing?.id ? t('failedToUpdateTransaction') : t('failedToAddTransaction'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [queryClient, t]);

  return { save, saving };
}

/** Delete one transaction, or every installment of a big purchase. Paid plan items go back to planned. */
export function useDeleteTransactions() {
  const queryClient = useQueryClient();
  const { t } = useTheme();

  return useCallback(async (list) => {
    try {
      await Promise.all(list.map((tx) => ascent.entities.ExpenseTransaction.delete(tx.id)));
      const linked = list.filter((tx) => tx.planId && tx.planItemId);
      await Promise.all(linked.map((tx) => setPlanItem(tx.planId, tx.planItemId, { status: 'planned', transactionId: null }).catch(() => {})));
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      if (linked.length || list.some((tx) => tx.planId)) queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success(list.length > 1 ? t('installmentsDeleted').replace('{count}', list.length) : t('transactionDeletedSuccessfully'));
    } catch {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.error(t('failedToDeleteTransaction'));
    }
  }, [queryClient, t]);
}
