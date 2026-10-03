import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { takeOldestDataRev } from '@/lib/dataRev';

const HEARTBEAT_MS = 60 * 1000;
const PULSE_MS = 4 * 1000;
const PRESENCE_MS = 30 * 1000; // who's online comes from heartbeats, which don't move the counters
const MIN_GAP_MS = 1500;

// Keeps a shared workspace live without websockets (the API runs serverless): a presence heartbeat,
// and a cheap "pulse" poll of the workspace's change counters. When someone else adds an expense,
// edits a note, joins or changes permissions, the on-screen data refetches within a few seconds.
export function useWorkspaceSync() {
  const { user, currentWorkspace, refreshWorkspaces, checkAppState } = useAuth();
  const queryClient = useQueryClient();
  const refreshRef = useRef(refreshWorkspaces);
  refreshRef.current = refreshWorkspaces;
  const recheckRef = useRef(checkAppState);
  recheckRef.current = checkAppState;

  const signedIn = !!user;
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;

  // Cached lists belong to the previous workspace after a switch, or after being removed from one.
  const lastWorkspaceId = useRef(workspaceId);
  useEffect(() => {
    if (workspaceId && lastWorkspaceId.current && lastWorkspaceId.current !== workspaceId) {
      queryClient.invalidateQueries();
    }
    if (workspaceId) lastWorkspaceId.current = workspaceId;
  }, [workspaceId, queryClient]);

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
    const visible = () => document.visibilityState === 'visible';
    let seen = null; // last { dataRev, updated } this device has caught up with
    let inFlight = false;
    let lastCheck = 0;
    let stopped = false;

    const check = async () => {
      if (stopped || inFlight || !visible() || Date.now() - lastCheck < MIN_GAP_MS) return;
      inFlight = true;
      lastCheck = Date.now();
      try {
        // Taken before asking: lists read while this pulse is on its way count for the next one
        const readAt = takeOldestDataRev(workspaceId);
        const pulse = await ascent.workspaces.pulse(workspaceId);
        if (stopped || !pulse) return;
        // First look (or back from the background): catch up on members and settings once, cheaply
        if (!seen || pulse.updated !== seen.updated) refreshRef.current?.();
        // Lists refetch when the data moved since the last check, or since any list on screen was read: a change
        // made between loading a page and the first check would otherwise wait for the next change to show
        const moved = seen && pulse.dataRev !== seen.dataRev;
        const behind = readAt !== undefined && pulse.dataRev > readAt;
        if (moved || behind) queryClient.invalidateQueries({ refetchType: 'active' });
        seen = { dataRev: pulse.dataRev, updated: pulse.updated };
      } catch (err) {
        // Offline or removed from the workspace: the members refresh handles removal, polling continues.
        // Refused as signed out (the session ended elsewhere, or its cookie expired while the app stayed open):
        // check the session, which takes this device to sign in instead of showing old numbers indefinitely. Not when
        // the refusal names a reason: the API client is already taking the device there with it (src/api/client.js)
        if (err?.status === 401 && !err.data?.code) recheckRef.current?.({ silent: true });
      } finally {
        inFlight = false;
      }
    };

    check();
    const timer = setInterval(check, PULSE_MS);
    const presence = setInterval(() => { if (visible()) refreshRef.current?.(); }, PRESENCE_MS);
    const onWake = () => {
      // The counters only move forward, so one check catches up on anything changed while hidden
      if (visible()) check();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(presence);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [signedIn, workspaceId, queryClient]);
}
