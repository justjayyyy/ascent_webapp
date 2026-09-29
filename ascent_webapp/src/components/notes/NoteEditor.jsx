import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import {
  Archive, ArchiveRestore, ArrowLeft, Bell, BellRing, Cloud, CloudOff, Copy, ListChecks, LogOut, MoreVertical,
  Palette, Paperclip, Pin, Share2, Tag, Trash2, Type, Undo2, XCircle, Loader2, Check,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ChecklistEditor from './ChecklistEditor';
import { AutoTextarea, ColorPicker, LabelEditor, PersonDot } from './NoteParts';
import { AttachmentPanel, ReminderPicker } from './NoteExtras';
import { askNotificationPermission } from './useReminders';
import { fmt, formatReminder, isOverdue, itemsToText, resolveColor, textToItems, timeAgo, blankItem } from './noteUtils';

const ib = 'h-11 w-11 sm:h-9 sm:w-9 [@media(pointer:coarse)]:before:hidden';
const CONTENT_KEYS = ['title', 'content', 'type', 'items', 'tags', 'color'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (note) => Object.fromEntries(CONTENT_KEYS.map(k => [k, note[k]]));

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
  note, people, labels, actions, onClose, onShare, t, language, online, pending, canCreate, uploading,
}) {
  const reduce = useReducedMotion();
  const vv = useVisualViewport();
  const isOwner = note.myAccess === 'owner';
  const trashed = !!note.trashedAt;
  const canEdit = (isOwner || note.myAccess === 'edit') && !trashed;

  const [draft, setDraft] = useState(() => pick(note));
  const [hasDirty, setHasDirty] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const fileRef = useRef(null);
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

  const change = useCallback((changes) => {
    setDraft(d => ({ ...d, ...changes }));
    dirty.current = { ...dirty.current, ...changes };
    setHasDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 600);
  }, []);

  // Pick up edits other people make while this is open, without touching what you're typing
  useEffect(() => {
    setDraft(d => {
      let next = d;
      for (const k of CONTENT_KEYS) {
        if (!(k in dirty.current) && !same(d[k], note[k])) next = { ...next, [k]: note[k] };
      }
      return next;
    });
  }, [note]);

  const close = useCallback(() => { flush(); onClose(); }, [flush, onClose]);

  const isChecklist = draft.type === 'checklist';
  const color = resolveColor(draft.color);

  const toggleType = () => {
    if (isChecklist) {
      change({ type: 'text', content: itemsToText(draft.items) || draft.content || '' });
    } else {
      change({ type: 'checklist', items: textToItems(draft.content) });
    }
  };

  const meId = actions.meId;
  const editor = note.updatedByEmail ? people.list.find(p => p.email === note.updatedByEmail) : null;
  const status = !online ? 'offline' : (hasDirty || pending > 0 ? 'saving' : 'saved');

  const isMobileSheet = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;
  // On iPhone the keyboard scrolls the page under a fixed sheet; pin it to the visible area instead
  const style = isMobileSheet && vv ? { height: vv.height, marginTop: vv.top } : undefined;
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
            if (canEdit && !isTouch()) bodyRef.current?.focus();
          }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
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
              'pt-[var(--safe-top)] sm:pt-0',
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
              </div>

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
                note={note}
                canEdit={canEdit}
                online={online}
                uploading={uploading}
                onRemove={(fileId) => actions.removeFile(noteId, fileId)}
                t={t}
              />

              {(note.reminder || isShared) && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {note.reminder && (
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1 font-medium', overdue && 'text-danger')}>
                      <BellRing className="h-3.5 w-3.5" /> {formatReminder(note.reminder, language)}
                    </span>
                  )}
                  {isShared && (
                    <span className="inline-flex items-center gap-1.5">
                      {editor && !editor.isMe && <PersonDot person={editor} size={20} />}
                      {editor && !editor.isMe
                        ? fmt(t('ntEditedBy'), { name: editor.name, time: timeAgo(note.updated_date, language) })
                        : fmt(t('ntEditedByYou'), { time: timeAgo(note.updated_date, language) })}
                    </span>
                  )}
                </div>
              )}
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
                    onChange={(iso) => {
                      if (iso) askNotificationPermission();
                      actions.patch(noteId, { reminder: iso });
                    }}
                    onDone={() => setReminderOpen(false)}
                    t={t}
                    language={language}
                  />
                </PopoverContent>
              </Popover>

              {canEdit && (
                <Button variant="ghost" size="icon" className={ib} onClick={() => fileRef.current?.click()} aria-label={t('ntAttachFile')} title={t('ntAttachFile')}>
                  <Paperclip />
                </Button>
              )}
              <input ref={fileRef} type="file" multiple className="hidden" onChange={pickFiles} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className={ib} aria-label={t('ntMore')}><MoreVertical /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[13rem]">
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

              <div className="ms-auto flex min-w-0 items-center gap-2">
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
