import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { getNotesSync } from './notesSync';
import { MAX_FILES, newNoteId, prepareUpload, useOnlineStatus } from './noteUtils';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const CONTENT_KEYS = ['title', 'content', 'type', 'items', 'tags', 'color'];
const FILE_ERRORS = { 'too-large': 'ntFileTooLarge' };

/**
 * The signed-in person's notes for the current workspace: a live list that refreshes
 * itself (so shared notes stay current), plus optimistic, offline-safe actions.
 */
export function useNotes() {
  const { user, t } = useTheme();
  const { currentWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [uploading, setUploading] = useState(0);

  const userId = user?.id || user?._id;
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const scope = userId && workspaceId ? `${userId}:${workspaceId}` : null;
  const queryKey = useMemo(() => ['notes', scope], [scope]);

  const sync = useMemo(
    () => (scope ? getNotesSync(scope, queryClient, queryKey) : null),
    [scope, queryClient, queryKey]
  );

  const pending = useSyncExternalStore(
    useCallback((cb) => (sync ? sync.subscribe(cb) : () => {}), [sync]),
    () => (sync ? sync.pending() : 0)
  );

  // Show this device's copy immediately, before (or without) the network
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRestored(false);
    if (!sync) return undefined;
    sync.readCache().then((cached) => {
      if (cancelled) return;
      if (Array.isArray(cached) && queryClient.getQueryData(queryKey) === undefined) {
        queryClient.setQueryData(queryKey, cached, { updatedAt: 0 });
      }
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [sync, queryClient, queryKey]);

  useEffect(() => {
    if (!sync) return undefined;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryHash === JSON.stringify(queryKey)) {
        const data = event.query.state.data;
        if (Array.isArray(data)) sync.writeCache(data);
      }
    });
  }, [sync, queryClient, queryKey]);

  useEffect(() => {
    if (!sync) return;
    sync.onRejected(() => {
      toast.error(t('ntNoLongerAvailable'));
      queryClient.invalidateQueries({ queryKey });
    });
  }, [sync, queryClient, queryKey, t]);

  // Send whatever is queued as soon as the connection is back
  useEffect(() => {
    if (!online || !sync) return;
    const hadPending = sync.pending() > 0;
    sync.flush().then(() => {
      if (hadPending && !sync.pending()) queryClient.invalidateQueries({ queryKey });
    });
  }, [online, sync, queryClient, queryKey]);

  const query = useQuery({
    queryKey,
    enabled: !!scope && restored,
    staleTime: 5000,
    gcTime: WEEK,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Shared notes change under you, so poll gently while the app is in front
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    networkMode: 'always',
    retry: 1,
    queryFn: async () => {
      await sync.flush();
      // Unsent local edits are newer than the server; keep them rather than overwrite
      if (sync.pending()) return queryClient.getQueryData(queryKey) ?? [];
      const rev = sync.rev;
      const fetched = await ascent.entities.Note.list('-updated_date', 2000);
      const list = Array.isArray(fetched) ? fetched : [];
      // An edit was made while this request was in flight: the response predates it
      if (sync.rev !== rev || sync.pending()) return queryClient.getQueryData(queryKey) ?? list;
      return list;
    },
  });

  const update = useCallback((fn) => {
    queryClient.setQueryData(queryKey, (list = []) => fn(list));
  }, [queryClient, queryKey]);

  const createNote = useCallback((data) => {
    const id = newNoteId();
    const now = new Date().toISOString();
    const note = {
      title: '', content: '', type: 'text', items: [], color: 'default', tags: [],
      isShared: false, collaborators: [], isPinned: false, isArchived: false,
      ...data,
      id,
      trashedAt: null,
      createdBy: userId,
      myAccess: 'owner',
      attachments: [],
      reminder: null,
      updatedByEmail: user?.email,
      created_date: now,
      updated_date: now,
    };
    update(list => [note, ...list]);
    sync.enqueue({
      type: 'create',
      id,
      data: {
        title: note.title, content: note.content, type: note.type, items: note.items,
        color: note.color, tags: note.tags, isShared: note.isShared,
        collaborators: note.collaborators.map(c => ({ userId: c.userId, role: c.role })),
        isPinned: note.isPinned, isArchived: note.isArchived,
      },
    });
    return id;
  }, [update, sync, userId, user?.email]);

  const patchNote = useCallback((id, changes) => {
    const local = { ...changes };
    if ('trashed' in local) {
      local.trashedAt = local.trashed ? new Date().toISOString() : null;
      delete local.trashed;
    }
    if (CONTENT_KEYS.some(k => k in changes)) {
      local.updated_date = new Date().toISOString();
      local.updatedByEmail = user?.email;
    }
    if (Array.isArray(local.collaborators)) {
      local.collaborators = local.collaborators.map(c => ({ email: '', ...c }));
    }
    update(list => list.map(n => (n.id === id ? { ...n, ...local } : n)));
    sync.enqueue({ type: 'patch', id, data: changes });
  }, [update, sync, user?.email]);

  const deleteNote = useCallback((id) => {
    update(list => list.filter(n => n.id !== id));
    sync.enqueue({ type: 'delete', id });
  }, [update, sync]);

  const emptyTrash = useCallback(() => {
    update(list => list.filter(n => !(n.trashedAt && n.createdBy === userId)));
    sync.enqueue({ type: 'empty-trash', id: '*' });
  }, [update, sync, userId]);

  // Files go straight to the server (not through the offline outbox), so they need a connection
  const applyAttachments = useCallback((saved) => {
    update(list => list.map(n => (n.id === saved.id
      ? { ...n, attachments: saved.attachments, updatedByEmail: saved.updatedByEmail, updated_date: saved.updated_date }
      : n)));
  }, [update]);

  const addFiles = useCallback(async (noteId, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!online) { toast.error(t('ntNeedOnline')); return; }
    await sync.flush();
    if (sync.pendingFor(noteId)) { toast.error(t('ntNeedOnline')); return; }
    const existing = (queryClient.getQueryData(queryKey) || []).find(n => n.id === noteId)?.attachments?.length || 0;
    if (existing + files.length > MAX_FILES) toast.error(t('ntTooManyFiles'));
    setUploading(c => c + 1);
    try {
      for (const file of files.slice(0, Math.max(0, MAX_FILES - existing))) {
        try {
          const payload = await prepareUpload(file);
          const saved = await ascent.entities.Note.uploadFile(noteId, payload);
          applyAttachments(saved);
        } catch (e) {
          toast.error(t(FILE_ERRORS[e.message] || (e.status === 413 ? 'ntFileTooLarge' : 'ntUploadFailed')));
        }
      }
    } finally {
      setUploading(c => c - 1);
    }
  }, [online, sync, queryClient, queryKey, applyAttachments, t]);

  const removeFile = useCallback(async (noteId, fileId) => {
    if (!online) { toast.error(t('ntNeedOnline')); return; }
    update(list => list.map(n => (n.id === noteId
      ? { ...n, attachments: (n.attachments || []).filter(a => a.id !== fileId) } : n)));
    try {
      applyAttachments(await ascent.entities.Note.deleteFile(noteId, fileId));
    } catch {
      toast.error(t('ntUploadFailed'));
      queryClient.invalidateQueries({ queryKey });
    }
  }, [online, update, applyAttachments, queryClient, queryKey, t]);

  return {
    notes: query.data ?? [],
    isLoading: !!scope && (!restored || (query.isPending && query.data === undefined)),
    isFetching: query.isFetching,
    isError: query.isError,
    online,
    pending,
    userId,
    refetch: query.refetch,
    createNote,
    patchNote,
    deleteNote,
    emptyTrash,
    addFiles,
    removeFile,
    uploading,
  };
}
