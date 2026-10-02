import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from '@/lib/motion';
import {
  Archive, ArchiveRestore, ArrowLeft, Bell, BellRing, Cloud, CloudOff, Copy, ListChecks, LogOut, MoreVertical,
  Camera, ImagePlus, Images, Palette, Paperclip, Pin, Share2, Tag, Trash2, Type, Undo2, Redo2, XCircle, Loader2, Check, Send, SquareCheck, Eraser, Repeat,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ChecklistEditor from './ChecklistEditor';
import { AutoTextarea, ColorPicker, LabelEditor, LinkChips, PersonDot } from './NoteParts';
import { AttachmentPanel, ReminderPicker } from './NoteExtras';
import { askNotificationPermission } from './useReminders';
import { DictateButton, useDictation } from './useDictation';
import {
  extractLinks, fmt, formatReminder, isEmptyNote, isOverdue, isTicked, itemsToText, lastEditor, noteToText, resolveColor, textToItems, timeAgo, blankItem,
} from './noteUtils';

const ib = 'h-11 w-11 sm:h-9 sm:w-9 [@media(pointer:coarse)]:before:hidden';
const CONTENT_KEYS = ['title', 'content', 'type', 'items', 'tags', 'color'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (note) => Object.fromEntries(CONTENT_KEYS.map(k => [k, note[k]]));
const HISTORY_GAP = 700; // keystrokes closer together than this are one undo step
const HISTORY_MAX = 100;

/** Height of the visible area, so the sheet shrinks above the on-screen keyboard on phones. */
function useVisualViewport() {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return box;
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function NoteEditor({
  note, people, labels, itemSuggestions, actions, onClose, onShare, t, language, online, pending, canCreate, uploading, fresh,
}) {
  const reduce = useReducedMotion();
  const vv = useVisualViewport();
  const isOwner = note.myAccess === 'owner';
  const trashed = !!note.trashedAt;
  const canEdit = (isOwner || note.myAccess === 'edit') && !trashed;

  const [draft, setDraft] = useState(() => pick(note));
  const draftRef = useRef(draft);
  const history = useRef({ stack: [pick(note)], index: 0, last: 0 });
  const [, setHistoryTick] = useState(0);
  const [hasDirty, setHasDirty] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const photosRef = useRef(null);
  const dirty = useRef({});
  const timer = useRef(null);
  const bodyRef = useRef(null);
  const noteId = note.id;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const changes = dirty.current;
    if (!Object.keys(changes).length) return;
    dirty.current = {};
    setHasDirty(false);
    actions.patch(noteId, changes);
  }, [actions, noteId]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const apply = useCallback((next, changes) => {
    draftRef.current = next;
    setDraft(next);
    dirty.current = { ...dirty.current, ...changes };
    setHasDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 600);
  }, []);

  const change = useCallback((changes) => {
    const next = { ...draftRef.current, ...changes };
    // Undo history: a burst of typing is one step, anything else is its own
    const h = history.current;
    const now = Date.now();
    h.stack = h.stack.slice(0, h.index + 1);
    if (now - h.last < HISTORY_GAP && h.index > 0) h.stack[h.index] = next;
    else {
      h.stack.push(next);
      if (h.stack.length > HISTORY_MAX) h.stack.shift();
      h.index = h.stack.length - 1;
    }
    h.last = now;
    setHistoryTick(n => n + 1);
    apply(next, changes);
  }, [apply]);

  const travel = useCallback((step) => {
    const h = history.current;
    const to = h.index + step;
    if (to < 0 || to >= h.stack.length) return;
    h.index = to;
    h.last = 0;
    const snap = h.stack[to];
    const changes = Object.fromEntries(CONTENT_KEYS.filter(k => !same(snap[k], draftRef.current[k])).map(k => [k, snap[k]]));
    setHistoryTick(n => n + 1);
    if (Object.keys(changes).length) apply({ ...draftRef.current, ...snap }, changes);
  }, [apply]);
  const canUndo = history.current.index > 0;
  const canRedo = history.current.index < history.current.stack.length - 1;

  // Pick up edits other people make while this is open, without touching what you're typing
  useEffect(() => {
    let next = draftRef.current;
    for (const k of CONTENT_KEYS) {
      if (!(k in dirty.current) && !same(next[k], note[k])) next = { ...next, [k]: note[k] };
    }
    if (next !== draftRef.current) {
      draftRef.current = next;
      setDraft(next);
    }
  }, [note]);

  const close = useCallback(() => {
    // A brand-new note you left empty is thrown away, as in Keep
    if (fresh && isOwner && isEmptyNote(draftRef.current) && !(note.attachments || []).length && !uploading) {
      clearTimeout(timer.current);
      dirty.current = {};
      actions.discard(noteId);
      onClose();
      return;
    }
    flush();
    onClose();
  }, [flush, onClose, fresh, isOwner, note.attachments, uploading, actions, noteId]);

  const dictation = useDictation({
    language,
    t,
    onText: (text) => {
      if (!text) return;
      const d = draftRef.current;
      if (d.type === 'checklist') {
        const items = (d.items || []).filter(i => i.text.trim() || i.done);
        change({ items: [...items, { ...blankItem(), text }] });
      } else {
        const content = d.content || '';
        const sep = content && !/\s$/.test(content) ? ' ' : '';
        change({ content: content + sep + text });
      }
    },
  });

  const share = async () => {
    try { await navigator.share({ title: draft.title || undefined, text: noteToText({ ...note, ...draft }, { withTitle: false }) }); }
    catch { /* dismissed */ }
  };
  const canSend = typeof navigator !== 'undefined' && !!navigator.share;

  const onKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'enter') { e.preventDefault(); close(); return; }
    if (!canEdit) return;
    if (e.shiftKey && (e.code === 'Digit8' || key === '8' || key === '*')) { e.preventDefault(); toggleType(); return; }
    if (key === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }
    if (key === 'y') { e.preventDefault(); travel(1); }
  };

  const isChecklist = draft.type === 'checklist';
  const color = resolveColor(draft.color);

  const toggleType = () => {
    if (isChecklist) {
      change({ type: 'text', content: itemsToText(draft.items) || draft.content || '' });
    } else {
      change({ type: 'checklist', items: textToItems(draft.content) });
    }
  };

  const doneCount = isChecklist ? (draft.items || []).filter(isTicked).length : 0;
  const uncheckAll = () => change({ items: (draft.items || []).map(i => ({ ...i, done: false })) });
  const deleteChecked = () => change({ items: (draft.items || []).filter(i => !isTicked(i)) });
  const links = extractLinks(draft);

  const meId = actions.meId;
  const editor = lastEditor(note, people);
  const status = !online ? 'offline' : (hasDirty || pending > 0 ? 'saving' : 'saved');

  const isMobileSheet = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;
  // On iPhone the keyboard scrolls the page under a fixed sheet; pin it to the visible area instead
  // Only when the keyboard is actually up: on an installed iPhone app the viewport values can be off
  // by the status-bar height otherwise, which pushes the top bar under the notch.
  const keyboardUp = vv && typeof window !== 'undefined' && window.innerHeight - vv.height > 120;
  const style = isMobileSheet && keyboardUp ? { height: vv.height, maxHeight: vv.height, marginTop: vv.top } : undefined;
  const isShared = note.isShared || (note.collaborators || []).length > 0 || !isOwner;
  const overdue = isOverdue(note.reminder);
  const pickFiles = (e) => { actions.addFiles(noteId, e.target.files); e.target.value = ''; };

  const transition = reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay asChild forceMount>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content
          forceMount
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (canEdit && (!isTouch() || fresh)) bodyRef.current?.focus();
          }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex items-stretch justify-center focus:outline-none sm:items-center sm:p-6"
        >
          <DialogPrimitive.Title className="sr-only">{draft.title || t('ntUntitled')}</DialogPrimitive.Title>

          <motion.div
            layoutId={`note-${noteId}`}
            transition={transition}
            data-note-color={color === 'default' ? undefined : color}
            style={style}
            className={cn(
              'note-surface relative flex w-full min-h-0 flex-col overflow-hidden border text-foreground shadow-2xl',
              'h-dvh sm:h-auto sm:max-h-[min(44rem,88dvh)] sm:max-w-2xl sm:rounded-3xl',
              'pt-[max(var(--safe-top),env(safe-area-inset-top),0px)] sm:pt-0',
              color === 'default' && 'border-border/60 bg-popover'
            )}
          >
            {/* Top bar */}
            <div className="flex items-center gap-1 px-2 pt-2 sm:px-3 sm:pt-3">
              <Button variant="ghost" size="icon" onClick={close} aria-label={t('ntClose')} className={cn(ib, 'sm:hidden')}>
                <ArrowLeft className="rtl:rotate-180" />
              </Button>
              <div className="min-w-0 flex-1 px-1 text-xs text-muted-foreground" aria-live="polite">
                <span className="inline-flex items-center gap-1.5">
                  {status === 'offline' && <><CloudOff className="h-3.5 w-3.5" /> {t('ntOfflineShort')}</>}
                  {status === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('ntSaving')}</>}
                  {status === 'saved' && <><Cloud className="h-3.5 w-3.5" /> {t('ntSaved')}</>}
                </span>
              </div>
              {!trashed && (
                <Button
                  variant="ghost" size="icon" className={ib}
                  onClick={() => actions.patch(noteId, { isPinned: !note.isPinned })}
                  aria-label={note.isPinned ? t('ntUnpin') : t('ntPin')}
                  aria-pressed={note.isPinned}
                >
                  <Pin className={cn(note.isPinned && 'fill-current')} />
                </Button>
              )}
              {!trashed && (
                <Button variant="ghost" size="icon" className={ib} onClick={() => onShare(noteId)} aria-label={t('ntShare')}>
                  <Share2 />
                </Button>
              )}
              {!trashed && (
                <Button
                  variant="ghost" size="icon" className={ib}
                  onClick={() => { actions.patch(noteId, { isArchived: !note.isArchived }); close(); }}
                  aria-label={note.isArchived ? t('ntUnarchive') : t('ntArchive')}
                >
                  {note.isArchived ? <ArchiveRestore /> : <Archive />}
                </Button>
              )}
            </div>

            {/* Notices */}
            {trashed && (
              <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                <span className="flex-1">{t('ntInTrash')}</span>
                {isOwner && (
                  <Button size="sm" variant="outline" onClick={() => { actions.patch(noteId, { trashed: false }); close(); }}>
                    <Undo2 /> {t('ntRestore')}
                  </Button>
                )}
              </div>
            )}
            {!canEdit && !trashed && (
              <div className="mx-4 mt-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                {t('ntViewOnlyHint')}
              </div>
            )}

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3 sm:px-6">
              <AttachmentPanel
                kind="photos"
                note={note}
                canEdit={canEdit}
                online={online}
                uploading={uploading}
                onRemove={(fileId) => actions.removeFile(noteId, fileId)}
                t={t}
              />
              <AutoTextarea
                value={draft.title}
                readOnly={!canEdit}
                onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); }
                }}
                placeholder={t('noteTitle')}
                aria-label={t('noteTitle')}
                maxLength={500}
                className="text-xl font-semibold leading-snug tracking-tight"
              />

              <div className="mt-2">
                {isChecklist ? (
                  <ChecklistEditor
                    items={draft.items?.length ? draft.items : (canEdit ? [blankItem()] : [])}
                    onChange={(items) => change({ items })}
                    readOnly={!canEdit}
                    autoFocus={fresh}
                    suggestions={itemSuggestions}
                    t={t}
                  />
                ) : (
                  <AutoTextarea
                    ref={bodyRef}
                    value={draft.content}
                    readOnly={!canEdit}
                    onChange={(e) => change({ content: e.target.value })}
                    placeholder={t('ntTakeNote')}
                    aria-label={t('noteContent')}
                    maxLength={100000}
                    className="min-h-[9rem] text-base leading-relaxed sm:min-h-[12rem] sm:text-[15px]"
                  />
                )}
                {dictation.listening && (
                  <p className="mt-2 flex items-center gap-2 text-sm italic text-muted-foreground" aria-live="polite">
                    <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />
                    {dictation.interim || t('ntListening')}
                  </p>
                )}
              </div>

              {links.length > 0 && <LinkChips links={links} className="mt-4" />}

              {draft.tags?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {draft.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/85">
                      <Tag className="h-3 w-3" /> {tag}
                    </span>
                  ))}
                </div>
              )}

              <AttachmentPanel
                kind="files"
                note={note}
                canEdit={canEdit}
                online={online}
                uploading={uploading}
                onRemove={(fileId) => actions.removeFile(noteId, fileId)}
                t={t}
              />

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {note.reminder && (
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1 font-medium', overdue && 'text-danger')}>
                    <BellRing className="h-3.5 w-3.5" /> {formatReminder(note.reminder, language)}
                    {note.reminderRepeat && note.reminderRepeat !== 'none' && <><Repeat className="h-3.5 w-3.5" /> {t(`ntRepeat_${note.reminderRepeat}`)}</>}
                  </span>
                )}
                <span className="ms-auto inline-flex items-center gap-1.5">
                  {isShared && editor && !editor.isMe && <PersonDot person={editor} size={20} />}
                  {isShared && editor && !editor.isMe
                    ? fmt(t('ntEditedBy'), { name: editor.name, time: timeAgo(note.updated_date, language) })
                    : isShared && editor
                      ? fmt(t('ntEditedByYou'), { time: timeAgo(note.updated_date, language) })
                      : fmt(t('ntEditedAt'), { time: timeAgo(note.updated_date, language) })}
                </span>
              </div>
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center gap-1 border-t border-foreground/10 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-3 sm:pb-3">
              {canEdit && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className={ib} aria-label={t('noteColor')}><Palette /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto max-w-[17rem] rounded-2xl p-2.5">
                      <ColorPicker value={draft.color} onChange={(c) => change({ color: c })} t={t} />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className={ib} aria-label={t('ntLabels')}><Tag /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 rounded-2xl p-3">
                      <LabelEditor
                        labels={draft.tags || []}
                        suggestions={labels}
                        onChange={(tags) => change({ tags })}
                        t={t}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    variant="ghost" size="icon" className={ib} onClick={toggleType}
                    aria-label={isChecklist ? t('ntHideCheckboxes') : t('ntShowCheckboxes')}
                    title={isChecklist ? t('ntHideCheckboxes') : t('ntShowCheckboxes')}
                  >
                    {isChecklist ? <Type /> : <ListChecks />}
                  </Button>
                </>
              )}

              <Popover open={reminderOpen} onOpenChange={setReminderOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn(ib, note.reminder && (overdue ? 'text-danger' : 'text-primary'))} aria-label={t('ntReminder')}>
                    {note.reminder ? <BellRing /> : <Bell />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-2">
                  <ReminderPicker
                    value={note.reminder}
                    repeat={note.reminderRepeat}
                    onChange={(iso, repeat) => {
                      if (iso) askNotificationPermission();
                      actions.patch(noteId, { reminder: iso, reminderRepeat: iso ? (repeat || 'none') : 'none' });
                    }}
                    onDone={() => setReminderOpen(false)}
                    t={t}
                    language={language}
                  />
                </PopoverContent>
              </Popover>

              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className={ib} aria-label={t('ntAddPhotoOrFile')} title={t('ntAddPhotoOrFile')}>
                      <ImagePlus />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[12rem]">
                    <DropdownMenuItem onSelect={() => cameraRef.current?.click()}>
                      <Camera className="me-2 h-4 w-4" /> {t('ntTakePhoto')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => photosRef.current?.click()}>
                      <Images className="me-2 h-4 w-4" /> {t('ntChoosePhotos')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                      <Paperclip className="me-2 h-4 w-4" /> {t('ntAttachFile')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canEdit && <DictateButton dictation={dictation} t={t} className={ib} />}
              <input ref={fileRef} type="file" multiple className="hidden" tabIndex={-1} aria-hidden onChange={pickFiles} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden onChange={pickFiles} />
              <input ref={photosRef} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden onChange={pickFiles} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className={ib} aria-label={t('ntMore')}><MoreVertical /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[13rem]">
                  {canEdit && isChecklist && doneCount > 0 && (
                    <>
                      <DropdownMenuItem onSelect={uncheckAll}>
                        <SquareCheck className="me-2 h-4 w-4" /> {t('ntUncheckAll')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={deleteChecked}>
                        <Eraser className="me-2 h-4 w-4" /> {fmt(t('ntDeleteChecked'), { n: doneCount })}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {canSend && (
                    <DropdownMenuItem onSelect={share}>
                      <Send className="me-2 h-4 w-4" /> {t('ntSend')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => actions.copy({ ...note, ...draft })}>
                    <Copy className="me-2 h-4 w-4" /> {t('ntCopyText')}
                  </DropdownMenuItem>
                  {canCreate && (
                    <DropdownMenuItem onSelect={() => { flush(); actions.duplicate({ ...note, ...draft }); }}>
                      <Copy className="me-2 h-4 w-4" /> {t('ntDuplicate')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {trashed && isOwner && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { actions.remove(noteId); onClose(); }}>
                      <XCircle className="me-2 h-4 w-4" /> {t('ntDeleteForever')}
                    </DropdownMenuItem>
                  )}
                  {!trashed && isOwner && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { actions.trash(noteId); onClose(); }}>
                      <Trash2 className="me-2 h-4 w-4" /> {t('ntMoveToTrash')}
                    </DropdownMenuItem>
                  )}
                  {!isOwner && (note.collaborators || []).some(c => c.userId === meId) && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { actions.remove(noteId); onClose(); }}>
                      <LogOut className="me-2 h-4 w-4" /> {t('ntLeaveNote')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="ms-auto flex min-w-0 items-center gap-0.5 sm:gap-2">
                {canEdit && (
                  <>
                    <Button variant="ghost" size="icon" className={ib} onClick={() => travel(-1)} disabled={!canUndo} aria-label={t('ntUndo')} title={t('ntUndo')}>
                      <Undo2 />
                    </Button>
                    <Button variant="ghost" size="icon" className={cn(ib, 'hidden min-[380px]:inline-flex')} onClick={() => travel(1)} disabled={!canRedo} aria-label={t('ntRedo')} title={t('ntRedo')}>
                      <Redo2 />
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={close} className="hidden sm:inline-flex">
                  <Check /> {t('ntDone')}
                </Button>
              </div>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
