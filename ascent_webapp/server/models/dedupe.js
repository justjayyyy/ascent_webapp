// Rows a device saved while offline carry an "app:<uuid>" dedupeKey (see entityHandler). If the upload
// reached the server but the answer was lost, the device sends it again; the unique key turns that second
// copy into the stored row instead of a duplicate. Partial, so rows without a key never collide.
export function addDedupeKey(schema) {
  schema.add({ dedupeKey: { type: String } });
  schema.index({ workspaceId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
}
