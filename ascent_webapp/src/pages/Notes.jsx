import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react';
import {
  Archive, CloudOff, Lightbulb, Loader2, Pin, RefreshCw, Rows3, LayoutGrid, Search, Trash2, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useNotes } from '@/components/notes/useNotes';
import NoteCard from '@/components/notes/NoteCard';
import NoteComposer from '@/components/notes/NoteComposer';
import NoteEditor from '@/components/notes/NoteEditor';
import NotesNav from '@/components/notes/NotesNav';
import ShareNoteDialog from '@/components/notes/ShareNoteDialog';
import { buildPeople } from '@/components/notes/NoteParts';
import {
  distribute, fmt, newItemId, noteToText, searchableText, useColumnCount,
} from '@/components/notes/noteUtils';

const VIEW_KEY = 'ascent_notes_view';
const VIEWS = ['notes', 'shared', 'archive', 'trash'];

function readLayoutPref() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

function Notes() {
  const { user, t, language, isRTL } = useTheme();
  const { currentWorkspace, hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const {
    notes, isLoading, isFetching, online, pending, userId,
    createNote, patchNote, deleteNote, emptyTrash, refetch,
  } = useNotes();

  const canCreate = hasPermission('editNotes');
  const view = VIEWS.includes(params.get('f')) ? params.get('f') : 'notes';
  const label = params.get('label') || '';

  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState(readLayoutPref);
  const [openId, setOpenId] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'empty', id? }
  const [composerRequest, setComposerRequest] = useState(null);
  const searchRef = useRef(null);
  const gridRef = useRef(null);

  const people = useMemo(() => buildPeople(currentWorkspace, user), [currentWorkspace, user]);
  const listView = layout === 'list';
  const columnCount = useColumnCount(gridRef, listView);

  // ---- entry points: install shortcut (?new=1) and text shared to the app (?share=1) ----
  useEffect(() => {
    const isNew = params.get('new') === '1' || params.get('share') === '1';
    if (!isNew) return;
    if (canCreate) {
      const sharedText = [params.get('text'), params.get('url')].filter(Boolean).join('\n');
      setComposerRequest({
        title: params.get('title') || '',
        content: sharedText,
        type: params.get('type') === 'checklist' ? 'checklist' : 'text',
      });
    }
    const next = new URLSearchParams(params);
    ['new', 'share', 'title', 'text', 'url', 'type'].forEach(k => next.delete(k));
    setParams(next, { replace: true });
  }, [params, setParams, canCreate]);

  // ---- keyboard: "/" to search ----
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setLayoutPref = (value) => {
    setLayout(value);
    try { localStorage.setItem(VIEW_KEY, value); } catch { /* private mode */ }
  };

  const select = useCallback((key, name) => {
    const next = new URLSearchParams(params);
    next.delete('f');
    next.delete('label');
    if (key === 'label') next.set('label', name);
    else if (key !== 'notes') next.set('f', key);
    setParams(next, { replace: false });
  }, [params, setParams]);

  // ---- derived lists ----
  const visible = useMemo(
    () => notes.filter(n => !n.trashedAt || n.myAccess === 'owner'),
    [notes]
  );

  const isSharedNote = (n) => n.myAccess !== 'owner' || n.isShared || (n.collaborators || []).length > 0;

  const counts = useMemo(() => {
    const active = visible.filter(n => !n.trashedAt && !n.isArchived);
    return {
      notes: active.length,
      shared: active.filter(isSharedNote).length,
      archive: visible.filter(n => !n.trashedAt && n.isArchived).length,
      trash: visible.filter(n => n.trashedAt).length,
    };
  }, [visible]);

  const labelList = useMemo(() => {
    const map = new Map();
    visible.filter(n => !n.trashedAt).forEach(n => (n.tags || []).forEach(tag => {
      const key = tag.toLowerCase();
      const entry = map.get(key) || { name: tag, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, language));
  }, [visible, language]);
  const labelNames = useMemo(() => labelList.map(l => l.name), [labelList]);

  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    let list;
    if (searching) {
      const q = query.trim().toLowerCase();
      list = visible.filter(n => !n.trashedAt && searchableText(n).includes(q));
    } else if (label) {
      list = visible.filter(n => !n.trashedAt && (n.tags || []).some(tag => tag.toLowerCase() === label.toLowerCase()));
    } else if (view === 'trash') {
      list = visible.filter(n => n.trashedAt);
    } else if (view === 'archive') {
      list = visible.filter(n => !n.trashedAt && n.isArchived);
    } else if (view === 'shared') {
      list = visible.filter(n => !n.trashedAt && !n.isArchived && isSharedNote(n));
    } else {
      list = visible.filter(n => !n.trashedAt && !n.isArchived);
    }
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updated_date) - new Date(a.updated_date);
    });
  }, [visible, view, label, query, searching]);

  const splitPins = !searching && view !== 'trash' && view !== 'archive';
  const pinned = splitPins ? shown.filter(n => n.isPinned) : [];
  const others = splitPins ? shown.filter(n => !n.isPinned) : shown;

  // ---- actions ----
  const actions = useMemo(() => {
    const archiveToast = (id, archived) => toast(archived ? t('ntArchived') : t('ntUnarchived'), {
      action: { label: t('ntUndo'), onClick: () => patchNote(id, { isArchived: !archived }) },
    });
    return {
      meId: userId,
      patch: (id, changes) => {
        patchNote(id, changes);
        if (typeof changes.isArchived === 'boolean') archiveToast(id, changes.isArchived);
      },
      trash: (id) => {
        patchNote(id, { trashed: true });
        toast(t('ntTrashed'), { action: { label: t('ntUndo'), onClick: () => patchNote(id, { trashed: false }) } });
      },
      remove: (id) => {
        const n = notes.find(x => x.id === id);
        if (n && n.myAccess === 'owner') setConfirm({ kind: 'delete', id });
        else { deleteNote(id); toast.success(t('ntLeft')); }
      },
      share: (id) => setShareId(id),
      copy: async (n) => {
        try { await navigator.clipboard.writeText(noteToText(n)); toast.success(t('ntCopied')); }
        catch { toast.error(t('ntCopyFailed')); }
      },
      duplicate: (n) => {
        createNote({
          title: n.title ? `${n.title} (${t('ntCopySuffix')})` : '',
          content: n.content, type: n.type, color: n.color, tags: n.tags || [],
          items: (n.items || []).map(i => ({ ...i, id: newItemId() })),
        });
        toast.success(t('noteCreated'));
      },
    };
  }, [patchNote, deleteNote, createNote, notes, t, userId]);

  const onCreate = useCallback((data) => {
    createNote(data);
    toast.success(t('noteCreated'));
  }, [createNote, t]);

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const shareNote = shareId ? notes.find(n => n.id === shareId) : null;

  // The note was deleted or unshared while it was open
  useEffect(() => {
    if (openId && !isLoading && !openNote) setOpenId(null);
  }, [openId, openNote, isLoading]);

  const heading = label ? label : view === 'notes' ? t('notes')
    : view === 'shared' ? t('ntShared') : view === 'archive' ? t('ntArchiveNav') : t('ntTrashNav');

  const emptyCopy = (() => {
    if (searching) return { icon: Search, title: t('ntNoResults'), hint: t('ntNoResultsHint') };
    if (label) return { icon: Lightbulb, title: t('ntEmptyLabel'), hint: '' };
    if (view === 'shared') return { icon: Users, title: t('ntEmptyShared'), hint: t('ntEmptySharedHint') };
    if (view === 'archive') return { icon: Archive, title: t('ntEmptyArchive'), hint: t('ntEmptyArchiveHint') };
    if (view === 'trash') return { icon: Trash2, title: t('ntTrashEmpty'), hint: t('ntTrashHint') };
    return { icon: Lightbulb, title: t('ntEmptyNotes'), hint: canCreate ? t('ntEmptyNotesHint') : t('ntEmptyNotesReadOnly') };
  })();

  const renderGrid = (list) => {
    const cols = distribute(list, columnCount);
    return (
      <div className={cn('flex items-start gap-3', listView && 'mx-auto max-w-2xl')}>
        {cols.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
            {col.map(n => (
              <NoteCard
                key={n.id}
                note={n}
                people={people}
                query={query}
                onOpen={setOpenId}
                actions={actions}
                t={t}
                canCreate={canCreate}
              />
            ))}
          </div>
        ))}
      </div>
    );
  };

  const statusPill = !online ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium">
      <CloudOff className="h-3.5 w-3.5" />
      {pending > 0 ? fmt(t('ntOfflinePending'), { n: pending }) : t('ntOffline')}
    </span>
  ) : pending > 0 ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {fmt(t('ntSyncing'), { n: pending })}
    </span>
  ) : null;

  const showComposer = canCreate && !searching && (view === 'notes' || view === 'shared' || !!label);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-28 md:p-8 md:pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Header */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">{heading}</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t('notesDescription')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {statusPill}
            <Button
              variant="ghost" size="icon"
              onClick={() => refetch()}
              aria-label={t('ntRefresh')}
              title={t('ntRefresh')}
              disabled={!online}
            >
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
            </Button>
            <div role="group" aria-label={t('ntLayout')} className="inline-flex rounded-xl border border-border/70 bg-card/60 p-0.5">
              {[
                { key: 'grid', icon: LayoutGrid, label: t('ntGridView') },
                { key: 'list', icon: Rows3, label: t('ntListView') },
              ].map(({ key, icon: Icon, label: text }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLayoutPref(key)}
                  aria-pressed={layout === key}
                  aria-label={text}
                  title={text}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                    layout === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Search */}
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            placeholder={t('searchNotes')}
            aria-label={t('searchNotes')}
            enterKeyHint="search"
            className="h-11 rounded-2xl border-border/70 bg-card/60 ps-10 pe-10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              aria-label={t('ntClearSearch')}
              className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="lg:flex lg:items-start lg:gap-8">
          {/* Side rail (large screens) */}
          <aside className="sticky top-6 hidden w-56 shrink-0 lg:block">
            <NotesNav view={view} label={label} labels={labelList} counts={counts} onSelect={select} t={t} variant="rail" />
          </aside>

          <div className="min-w-0 flex-1 space-y-5">
            <div className="lg:hidden">
              <NotesNav view={view} label={label} labels={labelList} counts={counts} onSelect={select} t={t} variant="chips" />
            </div>

            {showComposer && (
              <NoteComposer
                t={t}
                labels={labelNames}
                defaultTag={label}
                onCreate={onCreate}
                request={composerRequest}
                onRequestHandled={() => setComposerRequest(null)}
              />
            )}

            {view === 'trash' && !searching && !label && counts.trash > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
                <p className="text-sm text-muted-foreground">{t('ntTrashHint')}</p>
                <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'empty' })}>
                  <Trash2 /> {t('ntEmptyTrash')}
                </Button>
              </div>
            )}

            <div ref={gridRef}>
              {isLoading ? (
                <div className="flex items-start gap-3" aria-busy="true" aria-label={t('loadingNotes')}>
                  {Array.from({ length: Math.min(columnCount, 3) }).map((_, c) => (
                    <div key={c} className="flex flex-1 flex-col gap-3">
                      {[130, 190, 100].map((h, i) => (
                        <div
                          key={i}
                          className="animate-pulse rounded-2xl border border-border/50 bg-card/50"
                          style={{ height: h + ((c + i) % 2) * 34 }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16 text-center">
                  <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                    <emptyCopy.icon className="h-8 w-8" />
                  </span>
                  <p className="text-base font-semibold">{emptyCopy.title}</p>
                  {emptyCopy.hint && <p className="mt-1 text-sm text-muted-foreground">{emptyCopy.hint}</p>}
                </div>
              ) : (
                <LayoutGroup>
                  {pinned.length > 0 && (
                    <section className="mb-6" aria-label={t('pinned')}>
                      <h2 className="mb-2.5 flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Pin className="h-3.5 w-3.5" /> {t('pinned')}
                      </h2>
                      {renderGrid(pinned)}
                    </section>
                  )}
                  {others.length > 0 && (
                    <section aria-label={pinned.length > 0 ? t('others') : heading}>
                      {pinned.length > 0 && (
                        <h2 className="mb-2.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('others')}</h2>
                      )}
                      {renderGrid(others)}
                    </section>
                  )}
                </LayoutGroup>
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <AnimatePresence>
          {openNote && (
            <NoteEditor
              key={openNote.id}
              note={openNote}
              people={people}
              labels={labelNames}
              actions={actions}
              onClose={() => setOpenId(null)}
              onShare={(id) => setShareId(id)}
              t={t}
              language={language}
              online={online}
              pending={pending}
              canCreate={canCreate}
            />
          )}
        </AnimatePresence>

        <ShareNoteDialog
          open={!!shareNote}
          onOpenChange={(o) => { if (!o) setShareId(null); }}
          note={shareNote}
          people={people}
          workspaceName={currentWorkspace?.name}
          onChange={(changes) => shareNote && patchNote(shareNote.id, changes)}
          t={t}
        />

        <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === 'empty' ? t('ntEmptyTrash') : t('ntDeleteForever')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === 'empty' ? t('ntEmptyTrashConfirm') : t('ntDeleteForeverConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirm?.kind === 'empty') emptyTrash();
                  else if (confirm?.id) { deleteNote(confirm.id); toast.success(t('ntDeleted')); }
                  setConfirm(null);
                }}
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MotionConfig>
  );
}

export default memo(Notes);
