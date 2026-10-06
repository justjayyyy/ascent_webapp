// The household's kitchen check: how often everyone is reminded, when it was last done and by whom, and
// whether it is due. Whoever finishes it finishes it for everyone (server/lib/kitchenReminders.js).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { localDay } from '@/lib/localDay';
import { daysBetween } from './groceryUtils';

const addDays = (day, n) => localDay(new Date(Date.parse(`${day}T12:00:00`) + n * 86_400_000));

/**
 * { check, dueOn, due, setEvery, finish }: `check` is { everyDays, since, lastAt, lastBy }; `dueOn` the day
 * the next check is due (null without a reminder); `due` whether that day has come.
 */
export function useKitchenCheck() {
  const { t } = useTheme();
  const { currentWorkspace, refreshWorkspaces } = useAuth();
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const saved = currentWorkspace?.kitchenCheck;
  // What was just changed here, shown until the household's copy comes back with it
  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [saved?.everyDays, saved?.lastAt, saved?.since]);
  const check = { everyDays: null, since: null, lastAt: null, lastBy: '', ...(saved || {}), ...(local || {}) };

  const today = localDay();
  const from = check.lastAt || check.since;
  const dueOn = check.everyDays && from ? addDays(localDay(new Date(from)), check.everyDays) : null;
  const due = !!dueOn && daysBetween(dueOn, today) >= 0;

  const send = useCallback(async (body, optimistic) => {
    if (!workspaceId) return false;
    setLocal((l) => ({ ...(l || {}), ...optimistic }));
    try {
      await ascent.workspaces.kitchenCheck(workspaceId, body);
      await refreshWorkspaces();
      return true;
    } catch {
      setLocal(null);
      toast.error(t('grSaveFailed'));
      return false;
    }
  }, [workspaceId, refreshWorkspaces, t]);

  const setEvery = useCallback((everyDays) => send({ everyDays }, { everyDays, since: everyDays ? new Date().toISOString() : null }), [send]);
  const finish = useCallback((by) => send({ done: true }, { lastAt: new Date().toISOString(), lastBy: by }), [send]);

  return { check, dueOn, due, setEvery, finish };
}
