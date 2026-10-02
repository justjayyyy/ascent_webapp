import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { getOutbox } from '@/lib/offline/txOutbox';
import { createOp, updateOp, deleteOp } from '@/lib/offline/outboxModel';
import { uuid } from '@/lib/offline/network';
import { haptic } from '@/lib/haptics';
import { STRIP, expandTransaction, newGroupId } from './transactionRows';

// Saves and deletes go through the offline queue (lib/offline/txOutbox.js): the change shows at once,
// syncs within the same tap when there is signal, and waits on the device when there is none.

function useBox() {
  const { user } = useAuth();
  return getOutbox(user?.id || user?._id);
}

/**
 * Create or update a transaction, including recurring runs, installments and plan payments.
 * Pass `series` (every row of a monthly recurring run) to apply an edit to all of them; each keeps its own date.
 */
export function useSaveTransaction() {
  const box = useBox();
  const workspaceId = useWorkspaceId();
  const { t } = useTheme();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (data, existing, series = null) => {
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
        if (series?.length > 1) {
          // One id for the whole run from now on, so it stays together even if a row is later edited alone
          const recurringGroupId = existing.recurringGroupId || series.find((x) => x.recurringGroupId)?.recurringGroupId || newGroupId();
          const { date, status, ...shared } = payload;
          const outcomes = await Promise.all(series.map((tx) => box.submit(updateOp({
            uuid: uuid(),
            workspaceId,
            txId: tx.id,
            data: tx.id === existing.id ? { ...payload, recurringGroupId } : { ...shared, recurringGroupId },
          }))));
          haptic('success');
          if (outcomes.includes('queued')) toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
          else toast.success(t('recurringSeriesUpdated').replace('{count}', series.length));
          return true;
        }
        op = updateOp({ uuid: uuid(), workspaceId, txId: existing.id, data: payload });
        doneKey = 'transactionUpdatedSuccessfully';
      } else {
        const rows = expandTransaction(data);
        const first = rows[0];
        const plan = rows.length === 1 && first.planId && first.planItemId ? { planId: first.planId, itemId: first.planItemId } : null;
        op = createOp({ rows, uuid: uuid(), workspaceId, plan });
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
  }, [box, workspaceId, t]);

  return { save, saving };
}

/** Mark an automatically added payment as reviewed. */
export function useConfirmTransaction() {
  const box = useBox();
  const workspaceId = useWorkspaceId();
  const { t } = useTheme();
  return useCallback(async (tx) => {
    if (!box) return;
    try {
      const outcome = await box.submit(updateOp({ uuid: uuid(), workspaceId, txId: tx.id, data: { status: 'confirmed' } }));
      toast.success(outcome === 'queued' ? t('offSavedOnDevice') : t('transactionConfirmed'));
    } catch {
      toast.error(t('failedToConfirm'));
    }
  }, [box, workspaceId, t]);
}

/** Delete one transaction, every installment of a big purchase or a whole recurring run. Paid plan items go back to planned. */
export function useDeleteTransactions() {
  const box = useBox();
  const workspaceId = useWorkspaceId();
  const { t } = useTheme();

  return useCallback(async (list) => {
    if (!box) return;
    try {
      const outcomes = await Promise.all(list.map((tx) => box.submit(deleteOp({
        uuid: uuid(),
        workspaceId,
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
  }, [box, workspaceId, t]);
}
