// The weekly check-in's state: what waits for review, the week in numbers, what this device set aside
// and when the check-in was last finished (both kept on the device, per workspace).
import { useCallback, useMemo, useState } from 'react';
import { useWorkspaceId } from '@/lib/AuthContext';
import { localDay } from '@/lib/localDay';
import { checkinDue, checkinQueue, weekSummary } from '@/lib/checkin';

const MAX_SKIPPED = 300;
const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

/** `rows`: transactions with `_amount` in the viewer's currency. */
export function useCheckin(rows) {
  const workspaceId = useWorkspaceId() || 'none';
  const skipKey = `ascent_checkin_skipped:${workspaceId}`;
  const lastKey = `ascent_checkin_last:${workspaceId}`;
  const [skipped, setSkipped] = useState(() => new Set(read(skipKey, [])));
  const [lastDone, setLastDone] = useState(() => read(lastKey, null));

  // Switching workspace reads that workspace's own memory
  const [forWorkspace, setForWorkspace] = useState(workspaceId);
  if (forWorkspace !== workspaceId) {
    setForWorkspace(workspaceId);
    setSkipped(new Set(read(skipKey, [])));
    setLastDone(read(lastKey, null));
  }

  const queue = useMemo(() => checkinQueue(rows, { skipped }), [rows, skipped]);
  const week = useMemo(() => weekSummary(rows), [rows]);
  const due = checkinDue({ queueLength: queue.length, lastDone });

  const skip = useCallback((id) => {
    setSkipped((prev) => {
      const next = new Set(prev).add(id);
      write(skipKey, [...next].slice(-MAX_SKIPPED));
      return next;
    });
  }, [skipKey]);

  const finish = useCallback(() => {
    const today = localDay();
    setLastDone(today);
    write(lastKey, today);
  }, [lastKey]);

  return { queue, week, due, lastDone, skip, finish };
}
