import { ascent } from '@/api/client';

/** Mark a plan item paid (with the transaction that paid it) or back to planned. */
// `opts` pins the workspace (the offline queue sends it with the change it belongs to).
export async function setPlanItem(planId, itemId, changes, opts) {
  if (!planId || !itemId) return;
  await ascent.entities.Plan.changeEntry(planId, 'items', { op: 'patch', id: itemId, changes }, opts);
}
