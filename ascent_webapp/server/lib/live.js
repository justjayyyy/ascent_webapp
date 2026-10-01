import Workspace from '../models/Workspace.js';

// Every successful write to a workspace's data bumps its dataRev. Open apps poll the counter
// (GET /api/workspaces?action=pulse) and refetch when it moves, so changes show up on the other
// person's screen within seconds without websockets (the API runs serverless).
export function markChanged(workspaceId) {
  if (!workspaceId) return Promise.resolve();
  return Workspace.updateOne({ _id: workspaceId }, { $inc: { dataRev: 1 } }, { timestamps: false })
    .then(() => undefined)
    .catch((err) => console.error('[live] Failed to mark workspace changed:', err.message));
}

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Holds a successful write's response until the change is recorded, so the counter has moved by the
// time the writer (or anyone polling) hears back. Serverless functions may freeze once the response
// is out, which is why this can't happen afterwards. The workspace comes from the auth middleware
// (req.workspace) or, for token-authenticated automation, from req.liveWorkspaceId.
export function trackChanges(req, res) {
  if (!WRITES.has(req.method)) return () => Promise.resolve();
  const json = res.json.bind(res);
  let pending = null;
  res.json = (body) => {
    const workspaceId = req.liveWorkspaceId || req.workspace?._id;
    if (pending || res.statusCode >= 400 || !workspaceId) return json(body);
    pending = markChanged(workspaceId).then(() => { json(body); });
    return res;
  };
  return () => pending || Promise.resolve();
}
