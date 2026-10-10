// Merging checklist edits. The app sends the whole list it now shows (`mine`) together with the list it
// started from (`base`); the server applies only what this person changed to the list as it is now
// (`current`), so two people ticking, adding or removing different items at the same time keep both changes.
// Without a base (an older app) the sent list simply replaces the stored one, as before.

const byId = (list) => new Map(list.map((item) => [item.id, item]));
const FIELDS = ['text', 'done', 'kind', 'amount', 'currency', 'fileId'];

/** The ids `list` keeps in the same relative order as `reference` (both filtered to shared ids). */
function sameOrder(a, b) {
  const inB = new Set(b);
  const inA = new Set(a);
  const left = a.filter((id) => inB.has(id));
  const right = b.filter((id) => inA.has(id));
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

/** Inserts `id` into `order` right after the nearest earlier id of `source` that `order` has, else first. */
function insertAfterPredecessor(order, id, source) {
  const at = source.indexOf(id);
  for (let i = at - 1; i >= 0; i -= 1) {
    const pos = order.indexOf(source[i]);
    if (pos !== -1) { order.splice(pos + 1, 0, id); return; }
  }
  order.unshift(id);
}

export function mergeChecklist(base, mine, current) {
  if (!Array.isArray(base)) return mine;
  const baseMap = byId(base);
  const mineMap = byId(mine);
  const result = byId(current.map((item) => ({ ...item })));

  // What this person removed goes, whatever else changed meanwhile
  for (const id of baseMap.keys()) if (!mineMap.has(id)) result.delete(id);

  // Fields this person changed win; fields they left alone keep anyone else's change
  for (const [id, item] of mineMap) {
    const before = baseMap.get(id);
    const now = result.get(id);
    if (!before || !now) continue; // new here, or removed by someone else (their removal stands)
    for (const f of FIELDS) if (item[f] !== before[f]) now[f] = item[f];
  }

  const mineIds = mine.map((i) => i.id);
  const currentIds = current.map((i) => i.id).filter((id) => result.has(id));
  let order;
  if (sameOrder(base.map((i) => i.id), mineIds)) {
    order = currentIds;
  } else {
    // This person reordered: their order, with items others added meanwhile kept next to their neighbours
    order = mineIds.filter((id) => result.has(id));
    for (const id of currentIds) if (!order.includes(id)) insertAfterPredecessor(order, id, currentIds);
  }
  // Items this person added, where they put them
  for (const id of mineIds) {
    if (!baseMap.has(id) && !result.has(id)) {
      result.set(id, { ...mineMap.get(id) });
      insertAfterPredecessor(order, id, mineIds);
    }
  }
  return order.map((id) => result.get(id));
}
