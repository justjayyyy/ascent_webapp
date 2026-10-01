import { ascent } from '@/api/client';

/** Mark a plan item paid (with the transaction that paid it) or back to planned. */
// `opts` pins the workspace (the offline queue sends it with the change it belongs to).
export async function setPlanItem(planId, itemId, changes, opts) {
  if (!planId || !itemId) return;
  const plan = await ascent.entities.Plan.get(planId, opts);
  if (!plan?.items?.some((i) => i.id === itemId)) return;
  await ascent.entities.Plan.update(planId, {
    items: plan.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
  }, opts);
}
