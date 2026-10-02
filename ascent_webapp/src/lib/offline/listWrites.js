// Saving the household lists (budgets, plans, loans, groceries, savings goals) through the offline queue (txOutbox.js):
// the change shows at once, goes out within the same tap when there is signal, and waits on the device
// when there is none. Each call resolves 'synced' or 'queued', and rejects if the server refuses it.
import { useMemo } from 'react';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { getOutbox } from './txOutbox';
import { createOp, deleteOp, entryOp, localIdOf, updateOp } from './outboxModel';
import { uuid } from './network';

export function useListWrites(entity) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const box = getOutbox(user?.id || user?._id);

  return useMemo(() => {
    const submit = (op) => (box ? box.submit(op) : Promise.reject(new Error('Not signed in')));
    return {
      /** Adds a row. `id` is its real id once synced, or the id it has on this device until then. */
      async create(row) {
        const op = createOp({ rows: [row], uuid: uuid(), workspaceId, entity });
        const outcome = await submit(op);
        return { id: box.resolveId(localIdOf(op.rows[0])), outcome };
      },
      update: (id, data) => submit(updateOp({ uuid: uuid(), workspaceId, txId: id, data, entity })),
      /** One entry of a list field (a plan's items, a loan's payments, a goal's deposits); see src/lib/listEntries.js. */
      changeEntry: (id, list, change) => submit(entryOp({ uuid: uuid(), workspaceId, txId: id, list, change, entity })),
      remove: (id) => submit(deleteOp({ uuid: uuid(), workspaceId, txId: id, entity })),
    };
  }, [box, workspaceId, entity]);
}
