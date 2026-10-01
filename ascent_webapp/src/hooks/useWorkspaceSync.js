import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';

const HEARTBEAT_MS = 60 * 1000;
const MEMBERS_MS = 60 * 1000;
const DATA_MS = 45 * 1000;
const MIN_GAP_MS = 5 * 1000;

// Keeps a shared workspace feeling live without websockets (the API runs serverless):
// presence heartbeat, member/permission sync, and a refetch of on-screen data while others are around.
export function useWorkspaceSync() {
  const { user, currentWorkspace, refreshWorkspaces } = useAuth();
  const queryClient = useQueryClient();
  const refreshRef = useRef(refreshWorkspaces);
  refreshRef.current = refreshWorkspaces;

  const signedIn = !!user;
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const isShared = (currentWorkspace?.members || []).filter((m) => m.status === 'accepted').length > 1;

  useEffect(() => {
    if (!signedIn || !workspaceId) return undefined;
    const visible = () => document.visibilityState === 'visible';
    const beat = () => { if (visible()) ascent.workspaces.heartbeat(workspaceId).catch(() => {}); };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (visible()) beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [signedIn, workspaceId]);

  useEffect(() => {
    if (!signedIn || !workspaceId) return undefined;
    let lastMembers = Date.now();
    let lastData = Date.now();
    const visible = () => document.visibilityState === 'visible';

    const syncMembers = () => {
      if (!visible() || Date.now() - lastMembers < MIN_GAP_MS) return;
      lastMembers = Date.now();
      refreshRef.current?.();
    };
    const syncData = () => {
      if (!isShared || !visible() || Date.now() - lastData < MIN_GAP_MS) return;
      lastData = Date.now();
      // Transactions refresh on their own timer (txOutbox.js); everything else on screen is refreshed here
      queryClient.invalidateQueries({ refetchType: 'active', predicate: (q) => q.queryKey[0] !== 'transactions' });
    };

    const membersTimer = setInterval(syncMembers, MEMBERS_MS);
    const dataTimer = setInterval(syncData, DATA_MS);
    const onWake = () => {
      if (!visible()) return;
      syncMembers();
      if (Date.now() - lastData > MEMBERS_MS) syncData();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(membersTimer);
      clearInterval(dataTimer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [signedIn, workspaceId, isShared, queryClient]);
}
