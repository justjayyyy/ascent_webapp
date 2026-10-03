// The oldest revision of a household's data that any list read since the last change check started from
// (the API sends it as X-Data-Rev). The first check after opening compares the household's current revision with
// it: anything written after the page loaded its lists, and before that first check, is then fetched too.
const oldest = new Map();

export function noteDataRev(workspaceId, rev) {
  if (!workspaceId || !Number.isFinite(rev)) return;
  const key = String(workspaceId);
  if (!oldest.has(key) || rev < oldest.get(key)) oldest.set(key, rev);
}

/** The oldest revision read since the last call, and forget it (undefined if nothing was read) */
export function takeOldestDataRev(workspaceId) {
  const key = String(workspaceId);
  const rev = oldest.get(key);
  oldest.delete(key);
  return rev;
}
