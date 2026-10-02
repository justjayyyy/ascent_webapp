// Ticking household tasks off, from the Tasks page or anywhere else: the history entry, the task rolled
// on to its next date (or done), and, when asked, what it cost logged as an expense. Everything goes
// through the offline queue, so it works without signal.
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { useListWrites } from '@/lib/offline/listWrites';
import { getOutbox } from '@/lib/offline/txOutbox';
import { createOp } from '@/lib/offline/outboxModel';
import { uuid } from '@/lib/offline/network';
import { useMoney } from '@/hooks/useWorkspaceData';
import { haptic } from '@/lib/haptics';
import { localDay } from '@/lib/localDay';
import { conversionFields } from '@shared/money';
import { formatDay, localeOf } from '../plans/PlanParts';
import { completeChanges, undoChanges } from './taskUtils';

export function useTaskActions() {
  const { t, user, language } = useTheme();
  const { hasPermission } = useAuth();
  const workspaceId = useWorkspaceId();
  const api = useListWrites('tasks');
  const box = getOutbox(user?.id || user?._id);
  const userCurrency = user?.currency || 'ILS';
  const { rates } = useMoney(userCurrency);
  const canLog = hasPermission('editExpenses');
  const loc = localeOf(language);

  const failed = useCallback(() => toast.error(t('tkSaveFailed')), [t]);

  /** Done: { amount, date, log }. Returns once the task change is queued. */
  const complete = useCallback(async (task, { amount = 0, date = localDay(), log = false } = {}) => {
    const { entry, changes } = completeChanges(task, { date, amount, currency: task.currency, logged: log && canLog, by: user?.email || '' });
    const before = { dueDate: task.dueDate, status: task.status, doneAt: task.doneAt, amount: task.amount };
    haptic('success');
    try {
      await Promise.all([
        api.changeEntry(task.id, 'history', { op: 'put', item: entry }),
        api.update(task.id, changes),
      ]);
    } catch {
      failed();
      return false;
    }
    let logged = false;
    if (log && canLog && amount > 0 && box) {
      const currency = task.currency || userCurrency;
      const row = {
        type: 'Expense',
        amount,
        currency,
        ...conversionFields(amount, currency, userCurrency, rates),
        category: task.category || 'other_expense',
        description: task.title,
        date,
        paymentMethod: '',
      };
      try {
        await box.submit(createOp({ rows: [row], uuid: uuid(), workspaceId }));
        logged = true;
      } catch {
        toast.error(t('failedToAddTransaction'));
      }
    }
    const said = changes.dueDate ? t('tkDoneNext', { date: formatDay(changes.dueDate, loc, true) }) : t('tkDoneToast');
    toast.success(said, {
      description: logged ? t('tkLoggedExpense') : undefined,
      // Undo puts the task back; an expense that was logged stays, and says so
      action: {
        label: t('ntUndo'),
        onClick: () => {
          api.changeEntry(task.id, 'history', { op: 'remove', id: entry.id }).catch(failed);
          api.update(task.id, undoChanges(before)).catch(failed);
          if (logged) toast(t('tkUndoKeptExpense'));
        },
      },
    });
    return true;
  }, [api, box, canLog, failed, loc, rates, t, user?.email, userCurrency, workspaceId]);

  return { complete, canLog, api, failed };
}
