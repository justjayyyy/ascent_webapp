import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, MotionConfig } from '@/lib/motion';
import {
  Archive, Bell, CloudOff, Keyboard, Lightbulb, Loader2, Pin, Plus, RefreshCw, Rows3, LayoutGrid, Search, SlidersHorizontal, Trash2, Users, X,
  ListChecks, Image as ImageIcon, StickyNote as NoteIcon, FileUp, ArrowDownUp, CalendarDays, Tag, AlignLeft, Folder, GripVertical,
} from 'lucide-react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import FolderDialog from '@/components/notes/FolderDialog';
import SearchFilters from '@/components/notes/SearchFilters';
import ShortcutsDialog from '@/components/notes/ShortcutsDialog';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import { useReminders } from '@/components/notes/useReminders';
import { buildPeople } from '@/components/notes/NoteParts';
import ImportDocumentDialog from '@/components/notes/ImportDocumentDialog';
import { noteToHtml } from '@/components/notes/noteDocument';
import { useAssistStatus } from '@/hooks/useWorkspaceData';
import { ascent } from '@/api/client';
import {
  NOTE_COLORS, NOTE_FILTERS, NOTE_GROUPS, NOTE_SORTS, blankItem, fmt, groupNotes, lineKind, matchesFilter, newItemId, noteToText,
  reorderPositions, resolveColor, searchableText, sortNotes, useColumnCount,
} from '@/components/notes/noteUtils';

const VIEW_KEY = 'ascent_notes_view';
const SORT_KEY = 'ascent_notes_sort';
const GROUP_KEY = 'ascent_notes_group';
const VIEWS = ['notes', 'shared', 'reminders', 'archive', 'trash'];
const lower = (s) => s.toLowerCase();

function readLayoutPref() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

function readPref(key, allowed) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : allowed[0];
  } catch { return allowed[0]; }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}


const isWide = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 640px)').matches;
const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};
const canEditNote = (n) => n.myAccess === 'owner' || n.myAccess === 'edit';
const sameName = (a, b) => !!a && !!b && lower(a) === lower(b);

/**
 * A card in your own order: it can be dragged by its handle (or moved with the keyboard: Space, the arrows, Space).
 * `children` makes the card from the handle, or from null when it can't be moved.
 */
function SortableNote({ id, enabled, label, children }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: !enabled });
  // The handle stays the same element while the card is dragged, so the card itself doesn't redraw on every move
  const handle = useMemo(() => (enabled ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      // Not the card's own long press (select) or swipe (archive)
      onPointerDown={(e) => { listeners?.onPointerDown?.(e); e.stopPropagation(); }}
      aria-label={label}
      title={label}
      className="pointer-events-auto flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100 [@media(hover:none)]:opacity-70 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ) : null), [enabled, attributes, listeners, setActivatorNodeRef, label]);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative min-w-0', isDragging && 'z-20 opacity-90 [&>article]:shadow-2xl')}
    >
      {children(handle)}
    </div>
  );
}

function Notes() {
  const { user, t, language, isRTL } = useTheme();
  const { currentWorkspace, hasPermission, isWorkspaceOwner } = useAuth();
  const [params, setParams] = useSearchParams();
  const {
    notes, isLoading, isFetching, online, pending, userId,
    createNote, patchNote, deleteNote, emptyTrash, refetch, addFiles, removeFile, uploading, addImage, importDocument, createFromLines,
  } = useNotes();
  const currency = user?.currency || 'ILS';
  const { data: assistStatus } = useAssistStatus();
  const aiOff = !!assistStatus && !(assistStatus.ai?.configured && assistStatus.ai?.enabled);
  const importRef = useRef(null);

  const canCreate = hasPermission('editNotes');
  const view = VIEWS.includes(params.get('f')) ? params.get('f') : 'notes';
  const label = params.get('label') || '';
  const folder = label ? '' : params.get('folder') || '';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(null);
  const [colorFilter, setColorFilter] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState(readLayoutPref);
  const [sort, setSort] = useState(() => readPref(SORT_KEY, NOTE_SORTS));
  const [group, setGroup] = useState(() => readPref(GROUP_KEY, NOTE_GROUPS));
  const [openId, setOpenId] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'empty' | 'deleteMany', id?, ids?, done? }
  const [composerRequest, setComposerRequest] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [folderFor, setFolderFor] = useState(null); // { ids, done } while choosing a folder for notes
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
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
      ...(folder ? { folder } : {}),
      ...extra,
    });
    setFreshId(id);
    setOpenId(id);
    return id;
  }, [createNote, label, folder]);

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
    { id: 'import', label: t('ntImportDocument'), icon: FileUp, run: () => importRef.current?.start() },
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
    writePref(VIEW_KEY, value);
  };
  const setSortPref = (value) => { setSort(value); writePref(SORT_KEY, value); };
  const setGroupPref = (value) => { setGroup(value); writePref(GROUP_KEY, value); };

  const select = useCallback((key, name) => {
    const next = new URLSearchParams(params);
    next.delete('f');
    next.delete('label');
    next.delete('folder');
    if (key === 'label') next.set('label', name);
    else if (key === 'folder') next.set('folder', name);
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

  // Your folders (a folder is there while a note is in it), and the one being looked at, even while it is empty
  const folderList = useMemo(() => {
    const map = new Map();
    visible.filter(n => !n.trashedAt && n.folder).forEach(n => {
      const key = lower(n.folder);
      const entry = map.get(key) || { name: n.folder, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    });
    if (folder && !map.has(lower(folder))) map.set(lower(folder), { name: folder, count: 0 });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, language));
  }, [visible, language, folder]);
  const usesFolders = folderList.some(f => f.count > 0);

  // Everything already written on a checklist, newest notes first, offered while typing a new item
  const itemSuggestions = useMemo(() => {
    const seen = new Set();
    const out = [];
    visible.forEach(n => {
      if (n.trashedAt || n.type !== 'checklist') return;
      (n.items || []).forEach(({ text, kind }) => {
        if (kind === 'text' || kind === 'title') return;
        const clean = text?.trim();
        const key = clean?.toLowerCase();
        if (clean && clean.length <= 200 && !seen.has(key)) { seen.add(key); out.push(clean); }
      });
    });
    return out.slice(0, 1000);
  }, [visible]);

  // What the search filters can offer: only kinds and colours some note actually has
  const { availableFilters, colorsInUse } = useMemo(() => {
    const live = visible.filter(n => !n.trashedAt);
    const kinds = new Set(NOTE_FILTERS.filter(k => live.some(n => matchesFilter(n, k))));
    const used = new Set(live.map(n => resolveColor(n.color)));
    return { availableFilters: kinds, colorsInUse: NOTE_COLORS.filter(c => used.has(c)) };
  }, [visible]);

  const filtering = !!filter || !!colorFilter;
  const searching = query.trim().length > 0 || filtering;
  // The reminders list is in the order the reminders come, whatever the chosen sort
  const byReminder = view === 'reminders' && !searching && !label && !folder;

  // While a note is open its card stays where it was, and moves up (or to the pinned ones) once it is closed.
  // A card that moves to another column is made again there, and the new one would take the open note's place
  // in their shared open-and-close animation: the note would vanish into its card while you edit it.
  const held = useRef({ id: null });
  if (held.current.id !== openId) {
    const open = openId ? notes.find(n => n.id === openId) : null;
    held.current = open ? { id: openId, updated_date: open.updated_date, isPinned: open.isPinned } : { id: openId };
  }
  const heldAt = held.current;
  const placeOf = useCallback((n) => (n.id === heldAt.id && 'isPinned' in heldAt ? heldAt : n), [heldAt]);

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
    } else if (folder) {
      list = visible.filter(n => !n.trashedAt && sameName(n.folder, folder));
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
    if (byReminder) {
      return [...list].sort((a, b) => new Date(a.reminder) - new Date(b.reminder));
    }
    return sortNotes(list, sort, { language, placeOf });
  }, [visible, view, label, folder, query, searching, filter, colorFilter, placeOf, sort, language, byReminder]);

  const splitPins = !searching && view !== 'trash' && view !== 'archive' && view !== 'reminders';
  const pinned = splitPins ? shown.filter(n => placeOf(n).isPinned) : [];
  const others = splitPins ? shown.filter(n => !placeOf(n).isPinned) : shown;

  // The notes below the pinned ones, in headed groups (reminders keep their own order). By folder until you have
  // folders, or inside one, it is by label; inside a label, the other labels
  const activeGroup = (() => {
    if (byReminder) return 'none';
    if (group === 'folder' && (!usesFolders || (folder && !searching))) return 'label';
    return group;
  })();
  const groups = useMemo(
    () => groupNotes(others, activeGroup, { language, sort, placeOf, skipLabel: searching ? '' : label }),
    [others, activeGroup, language, sort, placeOf, searching, label]
  );
  // One group of notes with no label (or no folder) is no grouping at all
  const grouped = !(groups.length === 1 && (groups[0].kind === 'none'
    || (groups[0].kind === 'label' && !groups[0].label) || (groups[0].kind === 'folder' && !groups[0].folder)));

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
  useEffect(() => { clearSelection(); }, [view, label, folder, clearSelection]);
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
      chooseFolder: (ids, done) => setFolderFor({ ids, done }),
      addFiles,
      addImage,
      removeFile,
      // The whole note: as HTML (titles, tasks, numbers, boxes, amounts and its pictures) for documents and other
      // notes, and as text for everything else. The pictures are fetched while the copy is being written.
      copy: async (n) => {
        const text = noteToText(n);
        const html = async () => {
          const images = {};
          for (const it of (n.items || []).filter(i => lineKind(i) === 'image' && i.fileId)) {
            try {
              const file = await ascent.entities.Note.getFile(n.id, it.fileId);
              images[it.fileId] = `data:${file.type};base64,${file.data}`;
            } catch { /* copied without that picture */ }
          }
          return new Blob([noteToHtml(n, { images, language, currency, totalLabel: t('ntTotal') })], { type: 'text/html' });
        };
        try {
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([new ClipboardItem({
              'text/plain': new Blob([text], { type: 'text/plain' }),
              'text/html': html(),
            })]);
          } else {
            await navigator.clipboard.writeText(text);
          }
          toast.success(t('ntCopied'));
        } catch {
          try { await navigator.clipboard.writeText(text); toast.success(t('ntCopied')); }
          catch { toast.error(t('ntCopyFailed')); }
        }
      },
      duplicate: (n, { quiet } = {}) => {
        createNote({
          title: n.title ? `${n.title} (${t('ntCopySuffix')})` : '',
          content: n.content, type: n.type, color: n.color, tags: n.tags || [],
          // Pictures belong to the note they were added to; the copy keeps everything else
          items: (n.items || []).filter(i => lineKind(i) !== 'image').map(i => ({ ...i, id: newItemId() })),
        });
        if (!quiet) toast.success(t('noteCreated'));
      },
    };
  }, [patchNote, deleteNote, createNote, addFiles, addImage, removeFile, notes, t, userId, language, currency]);

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

  // ---- folders: a note's folder is yours alone, so any note you can see can be filed ----
  const moveToFolder = useCallback((ids, name) => {
    const before = ids.map(id => [id, notes.find(n => n.id === id)?.folder || '']);
    ids.forEach(id => patchNote(id, { folder: name }));
    const message = name
      ? (ids.length > 1 ? fmt(t('ntMovedManyToFolder'), { n: ids.length, folder: name }) : fmt(t('ntMovedToFolder'), { folder: name }))
      : t('ntRemovedFromFolder');
    toast(message, { action: { label: t('ntUndo'), onClick: () => before.forEach(([id, f]) => patchNote(id, { folder: f })) } });
  }, [notes, patchNote, t]);

  const renameFolder = useCallback((from, to) => {
    notes.forEach(n => { if (sameName(n.folder, from)) patchNote(n.id, { folder: to }); });
    if (sameName(folder, from)) select('folder', to);
    toast.success(t('ntFolderRenamed'));
  }, [notes, patchNote, folder, select, t]);

  const deleteFolder = useCallback((name) => {
    const ids = notes.filter(n => sameName(n.folder, name)).map(n => n.id);
    ids.forEach(id => patchNote(id, { folder: '' }));
    if (sameName(folder, name)) select('notes');
    toast(fmt(t('ntFolderDeleted'), { folder: name }), {
      action: { label: t('ntUndo'), onClick: () => ids.forEach(id => patchNote(id, { folder: name })) },
    });
  }, [notes, patchNote, folder, select, t]);

  const folderNotes = folderFor ? notes.filter(n => folderFor.ids.includes(n.id)) : [];
  const commonFolder = folderNotes.length && folderNotes.every(n => sameName(n.folder, folderNotes[0].folder)) ? folderNotes[0].folder || '' : '';

  // ---- your own order: drag a card by its handle within its section ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useReminders(notes, {
    t,
    onOpen: setOpenId,
    onDismiss: (id) => patchNote(id, { reminder: null, reminderRepeat: 'none' }),
    onRepeat: (id, next, repeat) => patchNote(id, { reminder: next, reminderRepeat: repeat }),
  });

  const onCreate = useCallback((data) => {
    createNote(folder ? { ...data, folder } : data);
    toast.success(t('noteCreated'));
  }, [createNote, t, folder]);

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const shareNote = shareId ? notes.find(n => n.id === shareId) : null;

  // The note was deleted or unshared while it was open
  useEffect(() => {
    if (openId && !isLoading && !openNote) { setOpenId(null); setFreshId(null); }
  }, [openId, openNote, isLoading]);

  const showComposer = canCreate && !searching && (view === 'notes' || view === 'shared' || !!label || !!folder);

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

  const heading = searching ? t('ntSearchResults') : label ? label : folder ? folder : view === 'notes' ? t('notes')
    : view === 'shared' ? t('ntShared') : view === 'reminders' ? t('ntReminders') : view === 'archive' ? t('ntArchiveNav') : t('ntTrashNav');

  const emptyCopy = (() => {
    if (searching) return { icon: Search, title: t('ntNoResults'), hint: t('ntNoResultsHint') };
    if (label) return { icon: Lightbulb, title: t('ntEmptyLabel'), hint: '' };
    if (folder) return { icon: Folder, title: t('ntEmptyFolder'), hint: canCreate ? t('ntEmptyFolderHint') : '' };
    if (view === 'shared') return { icon: Users, title: t('ntEmptyShared'), hint: t('ntEmptySharedHint') };
    if (view === 'reminders') return { icon: Bell, title: t('ntEmptyReminders'), hint: t('ntEmptyRemindersHint') };
    if (view === 'archive') return { icon: Archive, title: t('ntEmptyArchive'), hint: t('ntEmptyArchiveHint') };
    if (view === 'trash') return { icon: Trash2, title: t('ntTrashEmpty'), hint: t('ntTrashHint') };
    return { icon: Lightbulb, title: t('ntEmptyNotes'), hint: canCreate ? t('ntEmptyNotesHint') : t('ntEmptyNotesReadOnly') };
  })();

  // Cards in rows that read across, as tall as the tallest card in their row; in your own order, each can be dragged
  const canDrag = sort === 'manual' && !byReminder && !selecting && view !== 'trash';
  const renderGrid = (list) => (
    <SortableContext items={list.map(n => n.id)} strategy={rectSortingStrategy}>
      <div
        className={cn('grid items-stretch gap-3', listView && 'mx-auto max-w-2xl')}
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {list.map(n => (
          <SortableNote key={n.id} id={n.id} enabled={canDrag} label={t('ntDragToReorder')}>
            {(handle) => (
              <NoteCard
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
                online={online}
                currency={currency}
                dragHandle={handle}
              />
            )}
          </SortableNote>
        ))}
      </div>
    </SortableContext>
  );

  // A card dropped in its own section takes its new place there; dropped in another section, it goes back
  const sections = [pinned, ...(grouped ? groups.map(g => g.notes) : [others])];
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const section = sections.find(list => list.some(n => n.id === active.id));
    const to = section ? section.findIndex(n => n.id === over.id) : -1;
    if (to < 0) return;
    reorderPositions(section, active.id, to).forEach(([id, position]) => patchNote(id, { position }));
  };

  // A group's heading: "Today", "March 2025", a label, a colour, or the kind of note
  const groupHeading = (g) => {
    if (g.kind === 'date') {
      const { bucket } = g;
      if (bucket.year === undefined) return { icon: CalendarDays, text: t(`ntDate_${bucket.key}`) };
      const text = new Date(bucket.year, bucket.month, 1).toLocaleDateString(language || 'en', {
        month: 'long', year: bucket.year === new Date().getFullYear() ? undefined : 'numeric',
      });
      return { icon: CalendarDays, text };
    }
    if (g.kind === 'label') return { icon: Tag, text: g.label || t('ntNoLabel') };
    if (g.kind === 'folder') return { icon: Folder, text: g.folder || t('ntNoFolder') };
    if (g.kind === 'color') return { swatch: g.color, text: g.color === 'default' ? t('ntNoColor') : t(`ntColor_${g.color}`) };
    if (g.kind === 'type') return { icon: g.type === 'checklist' ? ListChecks : AlignLeft, text: t(g.type === 'checklist' ? 'ntGroupLists' : 'ntGroupText') };
    return null;
  };

  const sectionTitle = 'mb-2.5 flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground';

  const sortMenu = !byReminder && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          aria-label={t('ntSortGroup')}
          title={t('ntSortGroup')}
          className={cn((sort !== NOTE_SORTS[0] || group !== NOTE_GROUPS[0]) && 'text-primary')}
        >
          <ArrowDownUp />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('ntSortBy')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort} onValueChange={setSortPref}>
          {NOTE_SORTS.map(key => (
            <DropdownMenuRadioItem key={key} value={key}>{t(`ntSort_${key}`)}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('ntGroupBy')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={group} onValueChange={setGroupPref}>
          {NOTE_GROUPS.map(key => (
            <DropdownMenuRadioItem key={key} value={key}>{t(`ntGroup_${key}`)}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {/* Phones: the grid and list buttons are left out of the header, so the choice is here */}
        <div className="sm:hidden">
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('ntLayout')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={layout} onValueChange={setLayoutPref}>
            <DropdownMenuRadioItem value="grid">{t('ntGridView')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="list">{t('ntListView')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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

  const navProps = {
    view, label, labels: labelList, folder, folders: folderList, counts, onSelect: select, t,
    onEditLabels: () => setLabelsOpen(true),
    onEditFolders: () => setFoldersOpen(true),
    onNewFolder: () => setNewFolderOpen(true),
  };

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
            {canCreate && (
              <Button
                variant="ghost" size="icon"
                onClick={() => importRef.current?.start()}
                aria-label={t('ntImportDocument')}
                title={t('ntImportDocument')}
              >
                <FileUp />
              </Button>
            )}
            {/* Phones: the inline composer is hidden, so a + opens a new note */}
            {showComposer && (
              <Button
                size="icon"
                onClick={() => newNote('text')}
                aria-label={t('ntNewNote')}
                className="h-11 w-11 rounded-full sm:hidden"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
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
            {sortMenu}
            <div role="group" aria-label={t('ntLayout')} className={cn('rounded-xl border border-border/70 bg-card/60 p-0.5', byReminder ? 'inline-flex' : 'hidden sm:inline-flex')}>
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
                  className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-0.5 [@media(pointer:coarse)]:before:content-['']"
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
                  'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-0.5 [@media(pointer:coarse)]:before:content-[\'\']',
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
            <NotesNav {...navProps} variant="rail" />
          </aside>

          <div className="min-w-0 flex-1 space-y-5">
            {!searching && (
              <div className="lg:hidden">
                <NotesNav {...navProps} variant="chips" />
              </div>
            )}

            {showComposer && (
              <div className="hidden sm:block">
                <NoteComposer
                  t={t}
                  labels={labelNames}
                  itemSuggestions={itemSuggestions}
                  defaultTag={label}
                  onCreate={onCreate}
                  onImage={newImageNote}
                  onDocument={(data) => { const id = createFromLines(data); setFreshId(null); setOpenId(id); }}
                  currency={currency}
                  language={language}
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <LayoutGroup>
                  {pinned.length > 0 && (
                    <section className="mb-6" aria-label={t('pinned')}>
                      <h2 className={sectionTitle}>
                        <Pin className="h-3.5 w-3.5" /> {t('pinned')}
                      </h2>
                      {renderGrid(pinned)}
                    </section>
                  )}
                  {others.length > 0 && !grouped && (
                    <section aria-label={pinned.length > 0 ? t('others') : heading}>
                      {pinned.length > 0 && <h2 className={sectionTitle}>{t('others')}</h2>}
                      {renderGrid(others)}
                    </section>
                  )}
                  {others.length > 0 && grouped && groups.map(g => {
                    const head = groupHeading(g);
                    return (
                      <section key={g.key} className="mb-6 last:mb-0" aria-label={head.text}>
                        <h2 className={sectionTitle}>
                          {head.swatch ? (
                            <span
                              aria-hidden="true"
                              data-note-color={head.swatch === 'default' ? undefined : head.swatch}
                              className={cn('h-3 w-3 rounded-full border', head.swatch === 'default' ? 'border-border bg-card' : 'note-swatch border-transparent')}
                            />
                          ) : <head.icon className="h-3.5 w-3.5" />}
                          <span className="truncate">{head.text}</span>
                          <span className="tabular-nums opacity-70">{g.notes.length}</span>
                        </h2>
                        {renderGrid(g.notes)}
                      </section>
                    );
                  })}
                </LayoutGroup>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        <ImportDocumentDialog
          ref={importRef}
          importDocument={(files, opts) => importDocument(files, { ...opts, tags: label ? [label] : [] })}
          aiOff={aiOff}
          isOwner={isWorkspaceOwner}
          onImported={(id) => { setFreshId(null); setOpenId(id); }}
          language={language}
          t={t}
        />

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          aria-label={t('ntNewImageNote')}
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
              itemSuggestions={itemSuggestions}
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
              currency={currency}
              assistant={assistStatus?.ai}
              isWorkspaceOwner={isWorkspaceOwner}
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

        <EditLabelsDialog
          kind="folder"
          open={foldersOpen}
          onOpenChange={setFoldersOpen}
          labels={folderList.filter(f => f.count > 0)}
          onRename={renameFolder}
          onDelete={deleteFolder}
          t={t}
        />

        <FolderDialog
          open={!!folderFor}
          onOpenChange={(o) => { if (!o) setFolderFor(null); }}
          folders={folderList.filter(f => f.count > 0)}
          current={commonFolder}
          count={folderFor?.ids.length || 1}
          onPick={(name) => { moveToFolder(folderFor.ids, name); folderFor.done?.(); }}
          t={t}
        />

        <FolderDialog
          mode="new"
          open={newFolderOpen}
          onOpenChange={setNewFolderOpen}
          folders={folderList}
          onPick={(name) => select('folder', name)}
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
