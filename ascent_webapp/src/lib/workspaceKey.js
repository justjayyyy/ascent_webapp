/** The query key of a workspace list: [name, workspaceId]. Invalidate with the first part, e.g. ['plans']. */
export const workspaceKey = (name, workspaceId) => [name, workspaceId ?? null];
