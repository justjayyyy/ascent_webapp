// Plan items and loan payments are changed one entry at a time (PATCH ?list=), so two people editing the
// same list at once keep both changes. applyEntryChange makes the same change to a local copy, for the
// optimistic update before the server answers.

/** The list after `change`: { op: 'put', item, at? } | { op: 'patch', id, changes } | { op: 'remove', id }. */
export function applyEntryChange(list = [], change) {
  const { op } = change;
  if (op === 'put') {
    const { item, at } = change;
    if (list.some((e) => e.id === item.id)) return list.map((e) => (e.id === item.id ? item : e));
    if (Number.isInteger(at) && at >= 0) return [...list.slice(0, at), item, ...list.slice(at)];
    return [...list, item];
  }
  if (op === 'patch') return list.map((e) => (e.id === change.id ? { ...e, ...change.changes } : e));
  if (op === 'remove') return list.filter((e) => e.id !== change.id);
  return list;
}

/** The change that undoes removing `entry` from `list`: put it back where it was. */
export const restoreEntry = (list, entry) => ({ op: 'put', item: entry, at: Math.max(0, list.findIndex((e) => e.id === entry.id)) });
