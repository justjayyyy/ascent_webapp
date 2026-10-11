import React, { memo, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from '@/lib/motion';
import {
  Archive, ArchiveRestore, BellRing, Check, CheckCircle2, Copy, LogOut, Paperclip, MoreVertical, Pin, PinOff, Repeat, Share2, Trash2, Undo2, Users,
  XCircle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LinkChips, PeopleStack, PersonDot } from './NoteParts';
import { CardPhotos, LinePicture, placedPictures, useNearView } from './NoteExtras';
import {
  extractLinks, fmt, formatAmount, formatReminder, hasAmount, highlight, isOverdue, isPreviewable, isTicked, lastEditor, lineKind, resolveColor,
  textDir, timeAgo,
} from './noteUtils';
import { amountTotals, lineNumbers } from './noteDocument';

const PREVIEW_ITEMS = 5;
// A long note shows a short preview; open it to read the rest
const LONG_TEXT = 280;
const PREVIEW_CHARS = 600;
const LONG_PRESS = 450;
const SWIPE = 110;
const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** A picture among the lines of a card, at the width it was given, loaded as the card comes near the screen. */
function CardLinePicture({ noteId, fileId, online, alt, width, query }) {
  const ref = useRef(null);
  const near = useNearView(ref);
  return (
    <span ref={ref} className="block" style={width ? { width: `${width}%` } : undefined}>
      <LinePicture noteId={noteId} fileId={fileId} load={near && online} alt={alt} className="max-h-40" />
      {alt && <span className="mt-0.5 block text-center text-xs text-muted-foreground line-clamp-1">{highlight(alt, query)}</span>}
    </span>
  );
}

const CardAmount = ({ item, currency, language }) => (
  <span className="ms-auto shrink-0 ps-2 text-sm font-medium tabular-nums text-foreground/85">
    {formatAmount(item.amount, item.currency || currency, language)}
  </span>
);

// A line with details under its first line (a numbered entry, an amount line): the name, then the small print
function Lined({ text, query }) {
  const [first, ...rest] = String(text || '').split('\n');
  return (
    <span className="min-w-0 break-words">
      <span className="text-foreground/90">{highlight(first, query)}</span>
      {rest.length > 0 && <span className="block text-xs leading-snug text-muted-foreground line-clamp-2">{highlight(rest.join(' '), query)}</span>}
    </span>
  );
}

function NoteCard({ note, people, query, onOpen, actions, t, canCreate, language, selected, selecting, onToggleSelect, online = true, currency }) {
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

  const editorPerson = lastEditor(note, people);
  const isShared = note.isShared || (note.collaborators || []).length > 0 || !isOwner;

  // Continuous text shows its ticked items in their place; a list counts them under it
  const flow = !!note.flow;
  const openItems = (note.items || []).filter(i => (flow || !isTicked(i)) && (i.text || ['item', 'image'].includes(lineKind(i)) || hasAmount(i)));
  const doneCount = flow ? 0 : (note.items || []).filter(isTicked).length;
  const previewItems = openItems.slice(0, PREVIEW_ITEMS);
  const hiddenItems = openItems.length - previewItems.length;
  const numbers = lineNumbers(openItems);
  const totals = amountTotals(openItems, currency);
  const hasBody = note.type === 'checklist' ? (note.items || []).length > 0 : !!note.content?.trim();
  const text = note.content?.trim() || '';
  const longText = text.length > LONG_TEXT || text.split(/\r?\n/).length > 6;

  const placed = placedPictures(note);
  const photoCount = (note.attachments || []).filter(a => isPreviewable(a.type) && !placed.has(a.id)).length;
  // Buttons over a photo get their own backing to read against it
  const onPhoto = photoCount > 0 && 'bg-background/75 backdrop-blur';
  const fileCount = (note.attachments || []).length - photoCount;

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

  const activate = (e) => {
    // The tap that ends a long press or a swipe is not a click
    if (press.current?.fired || dragged.current) { press.current = null; dragged.current = false; return; }
    press.current = null;
    // Ctrl / Cmd / Shift + click selects, as in a file list
    if (selecting || (onToggleSelect && (e.ctrlKey || e.metaKey || e.shiftKey))) onToggleSelect(note.id);
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

      {/* Select tick: while selecting (start it from the menu, a long press, or Ctrl / Shift + click) */}
      {onToggleSelect && selecting && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(note.id); }}
          aria-label={selected ? t('ntDeselect') : t('ntSelect')}
          aria-pressed={!!selected}
          className={cn(
            'absolute end-2 top-2 z-[3] grid h-7 w-7 place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-foreground/40 bg-background/80 text-transparent backdrop-blur hover:border-foreground/70'
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
      )}

      <div className="pointer-events-none relative z-[1] space-y-2">
        <CardPhotos note={note} online={online} />
        {/* Room for the pin and menu in the top corner: the title stops short of them, other text flows around them */}
        {!note.title && !photoCount && hasBody && (
          <div aria-hidden className={cn('float-end -mt-2 h-8 w-14 [@media(pointer:coarse)]:h-10', !note.isPinned && '[@media(pointer:coarse)]:w-7')} />
        )}
        {(note.title || (!hasBody && !photoCount)) && (
          <h3
            dir={textDir(note.title)}
            className={cn(
              'pe-14 text-[15px] font-semibold leading-snug tracking-tight break-words line-clamp-3',
              // On touch there is only the menu, and the pin's mark beside it on a pinned note
              note.isPinned ? '[@media(pointer:coarse)]:pe-[3.25rem]' : '[@media(pointer:coarse)]:pe-6',
              !note.title && 'text-muted-foreground'
            )}
          >
            {note.title ? highlight(note.title, query) : (hasBody ? '' : t('ntEmptyNote'))}
          </h3>
        )}

        {note.type === 'checklist' ? (
          <ul dir={textDir(note.title || note.items?.[0]?.text)} className="space-y-1">
            {previewItems.map((item, i) => {
              const kind = lineKind(item);
              const total = totals.get(i) && (
                <li key={`${item.id}-total`} className="flex justify-end gap-2 border-t border-dashed border-foreground/20 pt-1 text-xs">
                  <span className="text-muted-foreground">{t('ntTotal')}</span>
                  <span className="font-semibold tabular-nums">{totals.get(i).map(s => formatAmount(s.amount, s.currency, language)).join(' + ')}</span>
                </li>
              );
              let line;
              if (kind === 'image') {
                line = (
                  <li key={item.id} className="-mx-1">
                    <CardLinePicture noteId={note.id} fileId={item.fileId} online={online} alt={item.text} width={item.width} query={query} />
                  </li>
                );
              } else if (kind === 'item') {
                line = (
                  <li key={item.id} dir={textDir(item.text)} className="flex items-start gap-2 text-sm leading-snug">
                    <Checkbox
                      checked={!!item.done}
                      disabled={!canEdit || trashed}
                      onCheckedChange={(v) => toggleItem(item.id, !!v)}
                      aria-label={item.text}
                      className="pointer-events-auto relative z-[2] mt-[1px] h-4 w-4 rounded-[5px]"
                    />
                    <span className={cn('min-w-0 break-words text-foreground/90 line-clamp-2', item.done && 'text-muted-foreground line-through')}>{highlight(item.text, query)}</span>
                    {hasAmount(item) && <CardAmount item={item} currency={currency} language={language} />}
                  </li>
                );
              } else if (kind === 'number' || hasAmount(item)) {
                line = (
                  <li key={item.id} dir={textDir(item.text)} className="flex items-start gap-1.5 text-sm leading-snug">
                    {kind === 'number' && <span className="shrink-0 tabular-nums text-muted-foreground">{numbers[i]}.</span>}
                    <Lined text={item.text} query={query} />
                    {hasAmount(item) && <CardAmount item={item} currency={currency} language={language} />}
                  </li>
                );
              } else {
                // Text, titles and boxes between the items, without a checkbox
                line = (
                  <li
                    key={item.id}
                    dir={textDir(item.text)}
                    className={cn(
                      'min-w-0 break-words',
                      kind === 'title' && 'pt-1 text-[13px] font-semibold text-foreground line-clamp-1',
                      kind === 'text' && 'whitespace-pre-wrap text-sm leading-snug text-foreground/80 line-clamp-3',
                      kind === 'callout' && 'whitespace-pre-wrap rounded-lg border-s-[3px] border-foreground/25 bg-foreground/[0.06] px-2 py-1 text-sm leading-snug text-foreground/85 line-clamp-4'
                    )}
                  >
                    {highlight(item.text, query)}
                  </li>
                );
              }
              return total ? [line, total] : line;
            })}
            {hiddenItems > 0 && (
              <li className="ps-6 text-xs text-muted-foreground">{fmt(t('ntMoreItems'), { n: hiddenItems })}</li>
            )}
            {doneCount > 0 && (
              <li className="ps-6 text-xs text-muted-foreground">{fmt(t('ntCompletedCount'), { n: doneCount })}</li>
            )}
          </ul>
        ) : (
          text && (
            <p
              dir={textDir(text)}
              className={cn(
                'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85',
                longText ? 'line-clamp-5' : 'line-clamp-6'
              )}
            >
              {highlight(text.slice(0, PREVIEW_CHARS), query)}
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

        {(note.reminder || fileCount > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            {note.reminder && (
              <span className={cn('inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium', isOverdue(note.reminder) ? 'text-danger' : 'text-foreground/80')}>
                <BellRing className="h-3 w-3" /> {formatReminder(note.reminder, language)}
                {note.reminderRepeat && note.reminderRepeat !== 'none' && <Repeat className="h-3 w-3" aria-label={t(`ntRepeat_${note.reminderRepeat}`)} />}
              </span>
            )}
            {fileCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground/80">
                <Paperclip className="h-3 w-3" /> {fileCount}
              </span>
            )}
          </div>
        )}

        {/* Who it is shared with and who changed it last, on one line (wrapping when it is long) */}
        {(isShared || involved.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
            {involved.length > 0 ? <PeopleStack people={involved} max={3} size={24} /> : <Users className="h-3.5 w-3.5 shrink-0" />}
            {!isOwner && (
              <span className="truncate">
                {fmt(t('ntFromName'), { name: people.byId[note.createdBy]?.name || '' })}
              </span>
            )}
            {note.myAccess === 'view' && <span>· {t('ntViewOnly')}</span>}
            {isShared && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {editorPerson && !editorPerson.isMe && involved.length === 0 && <PersonDot person={editorPerson} size={16} />}
                <span className="min-w-0 break-words">
                  {editorPerson && !editorPerson.isMe
                    ? fmt(t('ntEditedBy'), { name: editorPerson.name, time: timeAgo(note.updated_date, language) })
                    : editorPerson
                      ? fmt(t('ntEditedByYou'), { time: timeAgo(note.updated_date, language) })
                      : fmt(t('ntEditedAt'), { time: timeAgo(note.updated_date, language) })}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Menu + pin: on hover / focus with a mouse, the pin in the corner; on touch the menu in the corner, always.
          Over a photo each one has its own backing, so nothing shows until the buttons do. */}
      <div className={cn('pointer-events-none absolute end-1.5 top-1.5 z-[3] flex items-center gap-1', selecting && 'hidden')}>
        {!trashed && note.isPinned && (
          <span aria-hidden="true" className={cn('hidden h-6 w-6 items-center justify-center rounded-full [@media(pointer:coarse)]:flex', onPhoto)}>
            <Pin className="h-4 w-4 fill-current text-foreground/80" />
          </span>
        )}
        {!trashed && (
          <button
            type="button"
            onClick={() => actions.patch(note.id, { isPinned: !note.isPinned })}
            aria-label={note.isPinned ? t('ntUnpin') : t('ntPin')}
            aria-pressed={note.isPinned}
            className={cn(
              'pointer-events-auto order-last flex h-8 w-8 items-center justify-center rounded-full transition-opacity [@media(pointer:coarse)]:hidden hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              onPhoto,
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
              <MoreVertical className={cn('h-4 w-4', photoCount > 0 && 'h-8 w-8 rounded-full p-2 text-foreground', onPhoto)} />
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
                {onToggleSelect && (
                  <DropdownMenuItem onSelect={() => onToggleSelect(note.id)}>
                    <CheckCircle2 className="me-2 h-4 w-4" /> {t('ntSelect')}
                  </DropdownMenuItem>
                )}
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
