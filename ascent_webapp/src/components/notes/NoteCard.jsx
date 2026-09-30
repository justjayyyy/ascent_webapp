import React, { memo, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import {
  Archive, ArchiveRestore, BellRing, Check, Copy, LogOut, Paperclip, MoreVertical, Pin, PinOff, Repeat, Share2, Trash2, Undo2, Users, XCircle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LinkChips, PeopleStack, PersonDot } from './NoteParts';
import { extractLinks, fmt, formatReminder, highlight, isOverdue, resolveColor, timeAgo } from './noteUtils';

const PREVIEW_ITEMS = 6;
const LONG_PRESS = 450;
const SWIPE = 110;
const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

function NoteCard({ note, people, query, onOpen, actions, t, canCreate, language, selected, selecting, onToggleSelect }) {
  const color = resolveColor(note.color);
  const isOwner = note.myAccess === 'owner';
  const canEdit = isOwner || note.myAccess === 'edit';
  const trashed = !!note.trashedAt;

  const involved = useMemo(() => {
    const ids = new Set();
    if (note.createdBy && !people.byId[note.createdBy]?.isMe) ids.add(note.createdBy);
    (note.collaborators || []).forEach(c => ids.add(c.userId));
    return [...ids].map(id => people.byId[id]).filter(p => p && !p.isMe);
  }, [note.createdBy, note.collaborators, people]);

  const editorPerson = note.updatedByEmail ? people.list.find(p => p.email === note.updatedByEmail) : null;
  const isShared = note.isShared || (note.collaborators || []).length > 0 || !isOwner;

  const openItems = (note.items || []).filter(i => !i.done);
  const doneCount = (note.items || []).length - openItems.length;
  const previewItems = openItems.slice(0, PREVIEW_ITEMS);
  const hiddenItems = openItems.length - previewItems.length;
  const hasBody = note.type === 'checklist' ? (note.items || []).length > 0 : !!note.content?.trim();

  const toggleItem = (id, done) =>
    actions.patch(note.id, { items: note.items.map(i => (i.id === id ? { ...i, done } : i)) });

  const links = useMemo(() => extractLinks(note), [note.title, note.content, note.items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch: hold to start selecting, swipe sideways to archive (Keep's gestures)
  const coarse = useMemo(isCoarse, []);
  const press = useRef(null);
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const swipeOpacity = useTransform(x, [-220, -SWIPE, 0, SWIPE, 220], [0.2, 0.55, 1, 0.55, 0.2]);
  const swipeable = coarse && !trashed && !selecting && !!actions.swipeArchive;

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch' || !onToggleSelect) return;
    const start = { x: e.clientX, y: e.clientY, fired: false };
    start.timer = setTimeout(() => {
      start.fired = true;
      if (navigator.vibrate) navigator.vibrate(15);
      onToggleSelect(note.id);
    }, LONG_PRESS);
    press.current = start;
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.timer); press.current = null; }
  };
  const endPress = () => { if (press.current) clearTimeout(press.current.timer); };

  const activate = () => {
    // The tap that ends a long press or a swipe is not a click
    if (press.current?.fired || dragged.current) { press.current = null; dragged.current = false; return; }
    press.current = null;
    if (selecting) onToggleSelect(note.id);
    else onOpen(note.id);
  };

  return (
    <motion.article
      layout="position"
      layoutId={`note-${note.id}`}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      data-note-color={color === 'default' ? undefined : color}
      drag={swipeable ? 'x' : false}
      dragSnapToOrigin
      dragDirectionLock
      dragElastic={0.55}
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => { dragged.current = true; endPress(); }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > SWIPE || Math.abs(info.velocity.x) > 700) {
          if (navigator.vibrate) navigator.vibrate(10);
          actions.swipeArchive(note);
        }
        setTimeout(() => { dragged.current = false; }, 50);
      }}
      style={swipeable ? { x, opacity: swipeOpacity } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => { if (coarse) e.preventDefault(); }}
      className={cn(
        'note-surface group relative overflow-hidden rounded-2xl border p-4 text-foreground [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none',
        'shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-16px_hsl(0_0%_0%/0.5)]',
        'transition-shadow hover:shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06),0_14px_36px_-14px_hsl(0_0%_0%/0.6)]',
        color === 'default' && 'border-border/60 bg-card/75 backdrop-blur-xl',
        trashed && !selected && 'opacity-80',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      {/* Whole-card hit area sits underneath the real controls */}
      <button
        type="button"
        onClick={activate}
        aria-label={note.title || t('ntUntitled')}
        aria-pressed={selecting ? !!selected : undefined}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Select tick: on hover with a mouse, always while selecting */}
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(note.id); }}
          aria-label={selected ? t('ntDeselect') : t('ntSelect')}
          aria-pressed={!!selected}
          className={cn(
            'absolute top-1.5 z-[3] grid h-7 w-7 place-items-center rounded-full border-2 transition-[opacity,transform,background-color] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selecting ? 'end-2 top-2' : 'start-1.5',
            selected
              ? 'border-primary bg-primary text-primary-foreground opacity-100 scale-100'
              : 'border-foreground/40 bg-background/80 text-transparent backdrop-blur',
            !selected && (selecting ? 'opacity-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 [@media(pointer:coarse)]:hidden')
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
      )}

      <div className="pointer-events-none relative z-[1] space-y-2">
        {(note.title || !hasBody) && (
          <h3 className={cn('pe-8 text-[15px] [@media(pointer:coarse)]:pe-11 font-semibold leading-snug tracking-tight break-words line-clamp-3', !note.title && 'text-muted-foreground')}>
            {note.title ? highlight(note.title, query) : (hasBody ? '' : t('ntEmptyNote'))}
          </h3>
        )}

        {note.type === 'checklist' ? (
          <ul className="space-y-1">
            {previewItems.map(item => (
              <li key={item.id} className="flex items-start gap-2 text-sm leading-snug">
                <Checkbox
                  checked={false}
                  disabled={!canEdit || trashed}
                  onCheckedChange={() => toggleItem(item.id, true)}
                  aria-label={item.text}
                  className="pointer-events-auto relative z-[2] mt-[1px] h-4 w-4 rounded-[5px]"
                />
                <span className="min-w-0 break-words text-foreground/90">{highlight(item.text, query)}</span>
              </li>
            ))}
            {hiddenItems > 0 && (
              <li className="ps-6 text-xs text-muted-foreground">{fmt(t('ntMoreItems'), { n: hiddenItems })}</li>
            )}
            {doneCount > 0 && (
              <li className="ps-6 text-xs text-muted-foreground">{fmt(t('ntCompletedCount'), { n: doneCount })}</li>
            )}
          </ul>
        ) : (
          note.content?.trim() && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85 line-clamp-[9]">
              {highlight(note.content, query)}
            </p>
          )
        )}

        {links.length > 0 && <LinkChips links={links} compact className="pt-1" />}

        {note.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {note.tags.slice(0, 3).map(tag => (
              <span key={tag} className="note-chip max-w-full truncate rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/80" data-note-color={color === 'default' ? undefined : color}>
                {highlight(tag, query)}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="rounded-full px-1.5 py-0.5 text-xs text-muted-foreground">+{note.tags.length - 3}</span>
            )}
          </div>
        )}

        {(note.reminder || note.attachments?.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            {note.reminder && (
              <span className={cn('inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium', isOverdue(note.reminder) ? 'text-danger' : 'text-foreground/80')}>
                <BellRing className="h-3 w-3" /> {formatReminder(note.reminder, language)}
                {note.reminderRepeat && note.reminderRepeat !== 'none' && <Repeat className="h-3 w-3" aria-label={t(`ntRepeat_${note.reminderRepeat}`)} />}
              </span>
            )}
            {note.attachments?.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground/80">
                <Paperclip className="h-3 w-3" /> {note.attachments.length}
              </span>
            )}
          </div>
        )}

        {(isShared || involved.length > 0) && (
          <div className="flex items-center gap-2 pt-1 text-muted-foreground">
            {involved.length > 0 ? <PeopleStack people={involved} max={3} size={24} /> : <Users className="h-3.5 w-3.5" />}
            {!isOwner && (
              <span className="truncate text-xs">
                {fmt(t('ntFromName'), { name: people.byId[note.createdBy]?.name || '' })}
              </span>
            )}
            {note.myAccess === 'view' && <span className="text-xs">· {t('ntViewOnly')}</span>}
          </div>
        )}
        {isShared && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {editorPerson && !editorPerson.isMe && <PersonDot person={editorPerson} size={16} />}
            <span className="min-w-0 break-words">
              {editorPerson && !editorPerson.isMe
                ? fmt(t('ntEditedBy'), { name: editorPerson.name, time: timeAgo(note.updated_date, language) })
                : fmt(t('ntEditedByYou'), { time: timeAgo(note.updated_date, language) })}
            </span>
          </p>
        )}
      </div>

      {/* Pin + menu: on hover / focus with a mouse, always visible on touch */}
      <div className={cn('pointer-events-none absolute end-1.5 top-1.5 z-[3] flex items-center gap-0.5', selecting && 'hidden')}>
        {!trashed && note.isPinned && (
          <Pin aria-hidden="true" className="hidden h-4 w-4 fill-current text-foreground/80 [@media(pointer:coarse)]:block" />
        )}
        {!trashed && (
          <button
            type="button"
            onClick={() => actions.patch(note.id, { isPinned: !note.isPinned })}
            aria-label={note.isPinned ? t('ntUnpin') : t('ntPin')}
            aria-pressed={note.isPinned}
            className={cn(
              'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full transition-opacity [@media(pointer:coarse)]:hidden hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              note.isPinned ? 'text-foreground opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70'
            )}
          >
            {note.isPinned ? <Pin className="h-4 w-4 fill-current" /> : <Pin className="h-4 w-4" />}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('ntMore')}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-70"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13rem]">
            {trashed ? (
              <>
                {isOwner && (
                  <DropdownMenuItem onSelect={() => actions.patch(note.id, { trashed: false })}>
                    <Undo2 className="me-2 h-4 w-4" /> {t('ntRestore')}
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.remove(note.id)}>
                    <XCircle className="me-2 h-4 w-4" /> {t('ntDeleteForever')}
                  </DropdownMenuItem>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => actions.patch(note.id, { isPinned: !note.isPinned })}>
                  {note.isPinned ? <PinOff className="me-2 h-4 w-4" /> : <Pin className="me-2 h-4 w-4" />}
                  {note.isPinned ? t('ntUnpin') : t('ntPin')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.patch(note.id, { isArchived: !note.isArchived })}>
                  {note.isArchived ? <ArchiveRestore className="me-2 h-4 w-4" /> : <Archive className="me-2 h-4 w-4" />}
                  {note.isArchived ? t('ntUnarchive') : t('ntArchive')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.share(note.id)}>
                  <Share2 className="me-2 h-4 w-4" /> {t('ntShare')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.copy(note)}>
                  <Copy className="me-2 h-4 w-4" /> {t('ntCopyText')}
                </DropdownMenuItem>
                {canCreate && (
                  <DropdownMenuItem onSelect={() => actions.duplicate(note)}>
                    <Copy className="me-2 h-4 w-4" /> {t('ntDuplicate')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {isOwner ? (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.trash(note.id)}>
                    <Trash2 className="me-2 h-4 w-4" /> {t('ntMoveToTrash')}
                  </DropdownMenuItem>
                ) : (note.collaborators || []).some(c => c.userId === actions.meId) && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.remove(note.id)}>
                    <LogOut className="me-2 h-4 w-4" /> {t('ntLeaveNote')}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.article>
  );
}

export default memo(NoteCard);
