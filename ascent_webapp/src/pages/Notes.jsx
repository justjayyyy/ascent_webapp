import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react';
import {
  Archive, Bell, CloudOff, Keyboard, Lightbulb, Loader2, Pin, RefreshCw, Rows3, LayoutGrid, Search, SlidersHorizontal, Trash2, Users, X,
  ListChecks, Image as ImageIcon, StickyNote as NoteIcon,
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
import SelectionBar from '@/components/notes/SelectionBar';
import EditLabelsDialog from '@/components/notes/EditLabelsDialog';
import SearchFilters from '@/components/notes/SearchFilters';
import ShortcutsDialog from '@/components/notes/ShortcutsDialog';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import { useReminders } from '@/components/notes/useReminders';
import { buildPeople } from '@/components/notes/NoteParts';
import {
  NOTE_COLORS, NOTE_FILTERS, blankItem, distribute, fmt, matchesFilter, newItemId, noteToText, resolveColor, searchableText, useColumnCount,
} from '@/components/notes/noteUtils';

const VIEW_KEY = 'ascent_notes_view';
const VIEWS = ['notes', 'shared', 'reminders', 'archive', 'trash'];
const lower = (s) => s.toLowerCase();

function readLayoutPref() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

const isWide = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 640px)').matches;
const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};
const canEditNote = (n) => n.myAccess === 'owner' || n.myAccess === 'edit';

function Notes() {
  const { user, t, language, isRTL } = useTheme();
  const { currentWorkspace, hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const {
    notes, isLoading, isFetching, online, pending, userId,
    createNote, patchNote, deleteNote, emptyTrash, refetch, addFiles, removeFile, uploading,
  } = useNotes();

  const canCreate = hasPermission('editNotes');
  const view = VIEWS.includes(params.get('f')) ? params.get('f') : 'notes';
  const label = params.get('label') || '';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(null);
  const [colorFilter, setColorFilter] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState(readLayoutPref);
  const [openId, setOpenId] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'empty' | 'deleteMany', id?, ids?, done? }
  const [composerRequest, setComposerRequest] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef(null);
  const gridRef = useRef(null);

  const people = useMemo(() => buildPeople(currentWorkspace, user), [currentWorkspace, user]);
  const listView = layout === 'list';
  const columnCount = useColumnCount(gridRef, listView);

  // ---- new notes: straight into the full editor; left empty, they are thrown away on close ----
  const newNote = useCallback((type = 'text', extra = {}) => {
    const id = createNote({
      type,
      items: type === 'checklist' ? [blankItem()] : [],
      tags: label ? [label] : [],
      ...extra,
    });
    setFreshId(id);
    setOpenId(id);
    return id;
  }, [createNote, label]);

  const newImageNote = useCallback((files) => {
    const id = newNote('text');
    addFiles(id, files);
  }, [newNote, addFiles]);

  // Phones: the dock's + starts a note; a long press offers a list or a photo note
  const photoInput = useRef(null);
  usePageCreateAction(canCreate && view !== 'trash' ? () => newNote('text') : null, [
    { id: 'note', label: t('ntNewNote'), icon: NoteIcon, run: () => newNote('text') },
    { id: 'list', label: t('ntNewChecklist'), icon: ListChecks, run: () => newNote('checklist') },
    { id: 'photo', label: t('ntNewImageNote'), icon: ImageIcon, run: () => photoInput.current?.click() },
  ]);

  // ---- entry points: install shortcut (?new=1) and text shared to the app (?share=1) ----
  useEffect(() => {
    const openParam = params.get('open');
    if (openParam) {
      setOpenId(openParam);
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
      return;
    }
    const isNew = params.get('new') === '1' || params.get('share') === '1';
    // Wait for this device's notes to load, so a new note has somewhere to go
    if (!isNew || isLoading) return;
    if (canCreate) {
      const sharedText = [params.get('text'), params.get('url')].filter(Boolean).join('\n');
      const request = {
        title: params.get('title') || '',
        content: sharedText,
        type: params.get('type') === 'checklist' ? 'checklist' : 'text',
      };
      // Wide screens fill the inline composer; phones open the full editor
      if (isWide()) setComposerRequest(request);
      else newNote(request.type, { title: request.title, content: request.content });
    }
    const next = new URLSearchParams(params);
    ['new', 'share', 'title', 'text', 'url', 'type'].forEach(k => next.delete(k));
    setParams(next, { replace: true });
  }, [params, setParams, canCreate, newNote, isLoading]);

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
      reminders: visible.filter(n => !n.trashedAt && n.reminder).length,
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

  // What the search filters can offer: only kinds and colours some note actually has
  const { availableFilters, colorsInUse } = useMemo(() => {
    const live = visible.filter(n => !n.trashedAt);
    const kinds = new Set(NOTE_FILTERS.filter(k => live.some(n => matchesFilter(n, k))));
    const used = new Set(live.map(n => resolveColor(n.color)));
    return { availableFilters: kinds, colorsInUse: NOTE_COLORS.filter(c => used.has(c)) };
  }, [visible]);

  const filtering = !!filter || !!colorFilter;
  const searching = query.trim().length > 0 || filtering;

  const shown = useMemo(() => {
    let list;
    if (searching) {
      const q = query.trim().toLowerCase();
      list = visible.filter(n => !n.trashedAt
        && (!q || searchableText(n).includes(q))
        && matchesFilter(n, filter)
        && (!colorFilter || resolveColor(n.color) === colorFilter));
    } else if (label) {
      list = visible.filter(n => !n.trashedAt && (n.tags || []).some(tag => tag.toLowerCase() === label.toLowerCase()));
    } else if (view === 'trash') {
      list = visible.filter(n => n.trashedAt);
    } else if (view === 'archive') {
      list = visible.filter(n => !n.trashedAt && n.isArchived);
    } else if (view === 'reminders') {
      list = visible.filter(n => !n.trashedAt && n.reminder);
    } else if (view === 'shared') {
      list = visible.filter(n => !n.trashedAt && !n.isArchived && isSharedNote(n));
    } else {
      list = visible.filter(n => !n.trashedAt && !n.isArchived);
    }
    if (view === 'reminders' && !searching && !label) {
      return [...list].sort((a, b) => new Date(a.reminder) - new Date(b.reminder));
    }
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updated_date) - new Date(a.updated_date);
    });
  }, [visible, view, label, query, searching, filter, colorFilter]);

  const splitPins = !searching && view !== 'trash' && view !== 'archive' && view !== 'reminders';
  const pinned = splitPins ? shown.filter(n => n.isPinned) : [];
  const others = splitPins ? shown.filter(n => !n.isPinned) : shown;

  // ---- selection ----
  const selecting = selected.size > 0;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-dock-hidden', selecting);
    return () => document.documentElement.removeAttribute('data-dock-hidden');
  }, [selecting]);
  const selectedNotes = useMemo(() => shown.filter(n => selected.has(n.id)), [shown, selected]);
  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => setSelected(new Set(shown.map(n => n.id))), [shown]);

  // A different list means a different selection
  useEffect(() => { clearSelection(); }, [view, label, clearSelection]);
  // Notes that left the list (archived, deleted elsewhere) drop out of the selection
  useEffect(() => {
    if (!selected.size) return;
    const ids = new Set(shown.map(n => n.id));
    if ([...selected].some(id => !ids.has(id))) setSelected(prev => new Set([...prev].filter(id => ids.has(id))));
  }, [shown, selected]);

  // ---- actions ----
  const actions = useMemo(() => {
    const archiveToast = (ids, archived) => toast(
      ids.length > 1 ? fmt(t(archived ? 'ntArchivedMany' : 'ntUnarchivedMany'), { n: ids.length }) : (archived ? t('ntArchived') : t('ntUnarchived')),
      { action: { label: t('ntUndo'), onClick: () => ids.forEach(id => patchNote(id, { isArchived: !archived })) } }
    );
    const trashToast = (ids) => toast(
      ids.length > 1 ? fmt(t('ntTrashedMany'), { n: ids.length }) : t('ntTrashed'),
      { action: { label: t('ntUndo'), onClick: () => ids.forEach(id => patchNote(id, { trashed: false })) } }
    );
    return {
      meId: userId,
      patch: (id, changes) => {
        patchNote(id, changes);
        if (typeof changes.isArchived === 'boolean') archiveToast([id], changes.isArchived);
      },
      patchQuiet: (id, changes) => patchNote(id, changes),
      archiveMany: (ids, archived) => {
        ids.forEach(id => patchNote(id, { isArchived: archived }));
        archiveToast(ids, archived);
      },
      swipeArchive: (n) => {
        patchNote(n.id, { isArchived: !n.isArchived });
        archiveToast([n.id], !n.isArchived);
      },
      trash: (id) => {
        patchNote(id, { trashed: true });
        trashToast([id]);
      },
      trashMany: (ids) => {
        ids.forEach(id => patchNote(id, { trashed: true }));
        trashToast(ids);
      },
      remove: (id) => {
        const n = notes.find(x => x.id === id);
        if (n && n.myAccess === 'owner') setConfirm({ kind: 'delete', id });
        else { deleteNote(id); toast.success(t('ntLeft')); }
      },
      removeMany: (ids, done) => setConfirm({ kind: 'deleteMany', ids, done }),
      discard: (id) => deleteNote(id),
      share: (id) => setShareId(id),
      addFiles,
      removeFile,
      copy: async (n) => {
        try { await navigator.clipboard.writeText(noteToText(n)); toast.success(t('ntCopied')); }
        catch { toast.error(t('ntCopyFailed')); }
      },
      duplicate: (n, { quiet } = {}) => {
        createNote({
          title: n.title ? `${n.title} (${t('ntCopySuffix')})` : '',
          content: n.content, type: n.type, color: n.color, tags: n.tags || [],
          items: (n.items || []).map(i => ({ ...i, id: newItemId() })),
        });
        if (!quiet) toast.success(t('noteCreated'));
      },
    };
  }, [patchNote, deleteNote, createNote, addFiles, removeFile, notes, t, userId]);

  // ---- labels: rename or remove everywhere ----
  const renameLabel = useCallback((from, to) => {
    notes.forEach(n => {
      if (!canEditNote(n) || !(n.tags || []).some(x => lower(x) === lower(from))) return;
      const seen = new Set();
      const tags = n.tags.map(x => (lower(x) === lower(from) ? to : x)).filter(x => !seen.has(lower(x)) && seen.add(lower(x)));
      patchNote(n.id, { tags });
    });
    if (label && lower(label) === lower(from)) select('label', to);
    toast.success(t('ntLabelRenamed'));
  }, [notes, patchNote, label, select, t]);

  const deleteLabel = useCallback((name) => {
    const before = [];
    notes.forEach(n => {
      if (!canEditNote(n) || !(n.tags || []).some(x => lower(x) === lower(name))) return;
      before.push([n.id, n.tags]);
      patchNote(n.id, { tags: n.tags.filter(x => lower(x) !== lower(name)) });
    });
    if (label && lower(label) === lower(name)) select('notes');
    toast(fmt(t('ntLabelDeleted'), { label: name }), {
      action: { label: t('ntUndo'), onClick: () => before.forEach(([id, tags]) => patchNote(id, { tags })) },
    });
  }, [notes, patchNote, label, select, t]);

  useReminders(notes, {
    t,
    onOpen: setOpenId,
    onDismiss: (id) => patchNote(id, { reminder: null, reminderRepeat: 'none' }),
    onRepeat: (id, next, repeat) => patchNote(id, { reminder: next, reminderRepeat: repeat }),
  });

  const onCreate = useCallback((data) => {
    createNote(data);
    toast.success(t('noteCreated'));
  }, [createNote, t]);

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const shareNote = shareId ? notes.find(n => n.id === shareId) : null;

  // The note was deleted or unshared while it was open
  useEffect(() => {
    if (openId && !isLoading && !openNote) { setOpenId(null); setFreshId(null); }
  }, [openId, openNote, isLoading]);

  const showComposer = canCreate && !searching && (view === 'notes' || view === 'shared' || !!label);

  // ---- keyboard (Keep's shortcuts): c, l, /, ?, and actions on the selection ----
  const keys = useRef({});
  keys.current = { selecting, selectedNotes, shown, showComposer, canCreate, actions, view };
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      if (e.key === 'Escape' && k.selecting) { e.preventDefault(); clearSelection(); return; }
      if (isTyping() || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      // Letters by physical key too, so the shortcuts work with Hebrew and Russian layouts
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if (mod && letter === 'a' && k.shown.length) { e.preventDefault(); setSelected(new Set(k.shown.map(n => n.id))); return; }
      if (mod) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); return; }
      if ((letter === 'c' || letter === 'l') && !e.shiftKey && k.canCreate && !k.selecting) {
        e.preventDefault();
        const type = letter === 'l' ? 'checklist' : 'text';
        if (k.showComposer && isWide()) setComposerRequest({ type });
        else newNote(type);
        return;
      }
      if (!k.selecting || k.view === 'trash') return;
      const list = k.selectedNotes;
      if (letter === 'e') { e.preventDefault(); k.actions.archiveMany(list.map(n => n.id), !list.every(n => n.isArchived)); clearSelection(); }
      else if (e.key === '#') {
        e.preventDefault();
        const owned = list.filter(n => n.myAccess === 'owner').map(n => n.id);
        if (owned.length) { k.actions.trashMany(owned); clearSelection(); }
      } else if (letter === 'f') {
        e.preventDefault();
        const pin = !list.every(n => n.isPinned);
        list.forEach(n => k.actions.patchQuiet(n.id, { isPinned: pin }));
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, newNote]);

  const heading = searching ? t('ntSearchResults') : label ? label : view === 'notes' ? t('notes')
    : view === 'shared' ? t('ntShared') : view === 'reminders' ? t('ntReminders') : view === 'archive' ? t('ntArchiveNav') : t('ntTrashNav');

  const emptyCopy = (() => {
    if (searching) return { icon: Search, title: t('ntNoResults'), hint: t('ntNoResultsHint') };
    if (label) return { icon: Lightbulb, title: t('ntEmptyLabel'), hint: '' };
    if (view === 'shared') return { icon: Users, title: t('ntEmptyShared'), hint: t('ntEmptySharedHint') };
    if (view === 'reminders') return { icon: Bell, title: t('ntEmptyReminders'), hint: t('ntEmptyRemindersHint') };
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
                language={language}
                canCreate={canCreate}
                selected={selected.has(n.id)}
                selecting={selecting}
                onToggleSelect={toggleSelect}
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

  const showFilters = filtersOpen || filtering;
  const clearSearch = () => { setQuery(''); setFilter(null); setColorFilter(null); setFiltersOpen(false); };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-28 md:p-8 md:pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Header */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight text-balance md:text-4xl">{heading}</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t('notesDescription')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {statusPill}
            <Button
              variant="ghost" size="icon"
              onClick={() => setHelpOpen(true)}
              aria-label={t('ntShortcuts')}
              title={`${t('ntShortcuts')} (?)`}
              className="hidden md:inline-flex"
            >
              <Keyboard />
            </Button>
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
        <div className="space-y-3">
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { clearSearch(); e.currentTarget.blur(); } }}
              placeholder={t('searchNotes')}
              aria-label={t('searchNotes')}
              enterKeyHint="search"
              className="h-11 rounded-2xl border-border/70 bg-card/60 ps-10 pe-20 [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center">
              {(query || filtering) && (
                <button
                  type="button"
                  onClick={() => { clearSearch(); searchRef.current?.focus(); }}
                  aria-label={t('ntClearSearch')}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltersOpen(v => !v)}
                aria-expanded={showFilters}
                aria-label={t('ntFilterBy')}
                title={t('ntFilterBy')}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
                  showFilters ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showFilters && (
            <SearchFilters
              available={availableFilters}
              colors={colorsInUse}
              filter={filter}
              color={colorFilter}
              onFilter={setFilter}
              onColor={setColorFilter}
              t={t}
            />
          )}
        </div>

        <div className="lg:flex lg:items-start lg:gap-8">
          {/* Side rail (large screens) */}
          <aside className="sticky top-6 hidden w-56 shrink-0 lg:block">
            <NotesNav view={view} label={label} labels={labelList} counts={counts} onSelect={select} onEditLabels={() => setLabelsOpen(true)} t={t} variant="rail" />
          </aside>

          <div className="min-w-0 flex-1 space-y-5">
            {!searching && (
              <div className="lg:hidden">
                <NotesNav view={view} label={label} labels={labelList} counts={counts} onSelect={select} onEditLabels={() => setLabelsOpen(true)} t={t} variant="chips" />
              </div>
            )}

            {showComposer && (
              <div className="hidden sm:block">
                <NoteComposer
                  t={t}
                  labels={labelNames}
                  defaultTag={label}
                  onCreate={onCreate}
                  onImage={newImageNote}
                  request={composerRequest}
                  onRequestHandled={() => setComposerRequest(null)}
                />
              </div>
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

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { if (e.target.files?.length) newImageNote(e.target.files); e.target.value = ''; }}
        />

        {/* While selecting, the selection bar takes the dock's place at the bottom */}
        <AnimatePresence>
          {selecting && (
            <SelectionBar
              key="selection"
              notes={selectedNotes}
              labels={labelNames}
              view={view}
              onClear={clearSelection}
              onSelectAll={selectAll}
              allSelected={selectedNotes.length === shown.length}
              actions={actions}
              t={t}
              canCreate={canCreate}
            />
          )}
        </AnimatePresence>

        {/* Editor */}
        <AnimatePresence>
          {openNote && (
            <NoteEditor
              key={openNote.id}
              note={openNote}
              people={people}
              labels={labelNames}
              actions={actions}
              onClose={() => { setOpenId(null); setFreshId(null); }}
              onShare={(id) => setShareId(id)}
              t={t}
              language={language}
              online={online}
              pending={pending}
              uploading={uploading}
              canCreate={canCreate}
              fresh={freshId === openNote.id}
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

        <EditLabelsDialog
          open={labelsOpen}
          onOpenChange={setLabelsOpen}
          labels={labelList}
          onRename={renameLabel}
          onDelete={deleteLabel}
          t={t}
        />

        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} t={t} />

        <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === 'empty' ? t('ntEmptyTrash') : t('ntDeleteForever')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === 'empty'
                  ? t('ntEmptyTrashConfirm')
                  : confirm?.kind === 'deleteMany'
                    ? fmt(t('ntDeleteManyConfirm'), { n: confirm.ids.length })
                    : t('ntDeleteForeverConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirm?.kind === 'empty') emptyTrash();
                  else if (confirm?.kind === 'deleteMany') {
                    confirm.ids.forEach(id => deleteNote(id));
                    confirm.done?.();
                    toast.success(t('ntDeleted'));
                  } else if (confirm?.id) { deleteNote(confirm.id); toast.success(t('ntDeleted')); }
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
