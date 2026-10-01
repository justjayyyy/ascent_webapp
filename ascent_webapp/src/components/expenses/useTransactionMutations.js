import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { getOutbox } from '@/lib/offline/txOutbox';
import { createOp, updateOp, deleteOp } from '@/lib/offline/outboxModel';
import { uuid } from '@/lib/offline/network';
import { haptic } from '@/lib/haptics';
import { STRIP, expandTransaction } from './transactionRows';

// Saves and deletes go through the offline queue (lib/offline/txOutbox.js): the change shows at once,
// syncs within the same tap when there is signal, and waits on the device when there is none.

const workspaceId = () => {
  try { return localStorage.getItem('ascent_current_workspace_id'); } catch { return null; }
};

function useBox() {
  const { user } = useAuth();
  return getOutbox(user?.id || user?._id);
}

/** Create or update a transaction, including recurring runs, installments and plan payments. */
export function useSaveTransaction() {
  const box = useBox();
  const { t } = useTheme();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (data, existing) => {
    if (!box) return false;
    setSaving(true);
    const isEdit = !!(existing && existing.id);
    try {
      let op;
      let doneKey;
      if (isEdit) {
        const payload = { ...data };
        STRIP.forEach((k) => delete payload[k]);
        delete payload.installmentCount;
        // Saving an automatically added payment after looking at it counts as reviewing it
        if (existing.status === 'pending') payload.status = 'confirmed';
        op = updateOp({ uuid: uuid(), workspaceId: workspaceId(), txId: existing.id, data: payload });
        doneKey = 'transactionUpdatedSuccessfully';
      } else {
        const rows = expandTransaction(data);
        const first = rows[0];
        const plan = rows.length === 1 && first.planId && first.planItemId ? { planId: first.planId, itemId: first.planItemId } : null;
        op = createOp({ rows, uuid: uuid(), workspaceId: workspaceId(), plan });
        doneKey = rows.length > 1 ? (first.installmentGroupId ? 'installmentsCreated' : 'recurringTransactionsCreated') : 'transactionAddedSuccessfully';
        if (rows.length > 1) doneKey = { key: doneKey, count: rows.length };
      }
      const outcome = await box.submit(op);
      haptic('success');
      if (outcome === 'queued') toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
      else if (typeof doneKey === 'object') toast.success(t(doneKey.key).replace('{count}', doneKey.count));
      else toast.success(t(doneKey));
      return true;
    } catch {
      haptic('error');
      toast.error(isEdit ? t('failedToUpdateTransaction') : t('failedToAddTransaction'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [box, t]);

  return { save, saving };
}

/** Mark an automatically added payment as reviewed. */
export function useConfirmTransaction() {
  const box = useBox();
  const { t } = useTheme();
  return useCallback(async (tx) => {
    if (!box) return;
    try {
      const outcome = await box.submit(updateOp({ uuid: uuid(), workspaceId: workspaceId(), txId: tx.id, data: { status: 'confirmed' } }));
      toast.success(outcome === 'queued' ? t('offSavedOnDevice') : t('transactionConfirmed'));
    } catch {
      toast.error(t('failedToConfirm'));
    }
  }, [box, t]);
}

/** Delete one transaction, or every installment of a big purchase. Paid plan items go back to planned. */
export function useDeleteTransactions() {
  const box = useBox();
  const { t } = useTheme();

  return useCallback(async (list) => {
    if (!box) return;
    try {
      const outcomes = await Promise.all(list.map((tx) => box.submit(deleteOp({
        uuid: uuid(),
        workspaceId: workspaceId(),
        txId: tx.id,
        plan: tx.planId && tx.planItemId ? { planId: tx.planId, itemId: tx.planItemId } : null,
      }))));
      haptic('success');
      if (outcomes.includes('queued')) toast(t('offDeletedOnDevice'));
      else toast.success(list.length > 1 ? t('installmentsDeleted').replace('{count}', list.length) : t('transactionDeletedSuccessfully'));
    } catch {
      haptic('error');
      toast.error(t('failedToDeleteTransaction'));
    }
  }, [box, t]);
}
