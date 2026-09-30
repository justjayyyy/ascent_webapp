import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Archive, ArchiveRestore, CheckCheck, Copy, Palette, Pin, PinOff, Tag, Trash2, Undo2, X, XCircle,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ColorPicker, LabelEditor } from './NoteParts';
import { fmt } from './noteUtils';

const lower = (s) => s.toLowerCase();
const canEditNote = (n) => (n.myAccess === 'owner' || n.myAccess === 'edit') && !n.trashedAt;

/**
 * Bulk actions for the notes you picked (long-press on a phone, the tick on a card with a mouse):
 * pin, colour, labels, archive and trash, like Keep's selection toolbar.
 */
export default function SelectionBar({ notes, labels, view, onClear, onSelectAll, allSelected, actions, t, canCreate }) {
  const editable = useMemo(() => notes.filter(canEditNote), [notes]);
  const owned = useMemo(() => notes.filter(n => n.myAccess === 'owner'), [notes]);
  const inTrash = view === 'trash';
  const allPinned = notes.length > 0 && notes.every(n => n.isPinned);
  const allArchived = notes.length > 0 && notes.every(n => n.isArchived);

  // Labels every selected note already has; toggling one adds it to all or takes it off all
  const common = useMemo(() => {
    if (!editable.length) return [];
    const [first, ...rest] = editable;
    return (first.tags || []).filter(tag => rest.every(n => (n.tags || []).some(x => lower(x) === lower(tag))));
  }, [editable]);

  const setLabels = (next) => {
    const added = next.filter(l => !common.some(c => lower(c) === lower(l)));
    const removed = common.filter(c => !next.some(l => lower(l) === lower(c)));
    editable.forEach(n => {
      let tags = (n.tags || []).filter(x => !removed.some(r => lower(r) === lower(x)));
      added.forEach(a => { if (!tags.some(x => lower(x) === lower(a))) tags = [...tags, a]; });
      actions.patchQuiet(n.id, { tags });
    });
  };

  const done = (fn) => () => { fn(); onClear(); };
  const ib = 'h-11 w-11 shrink-0';

  return (
    <motion.div
      role="toolbar"
      aria-label={fmt(t('ntSelectedCount'), { n: notes.length })}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-xl items-center gap-0.5 overflow-x-auto rounded-full border border-border/70 bg-popover/95 p-1 shadow-[0_18px_50px_-18px_hsl(0_0%_0%/0.7)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Button variant="ghost" size="icon" className={ib} onClick={onClear} aria-label={t('ntClearSelection')}>
        <X />
      </Button>
      <span className="min-w-[3.5rem] shrink-0 px-1 text-sm font-semibold tabular-nums" aria-live="polite">
        {fmt(t('ntSelectedCount'), { n: notes.length })}
      </span>
      <div className="ms-auto flex items-center gap-0.5">
        {!allSelected && (
          <Button variant="ghost" size="icon" className={ib} onClick={onSelectAll} aria-label={t('ntSelectAll')} title={t('ntSelectAll')}>
            <CheckCheck />
          </Button>
        )}
        {inTrash ? (
          <>
            <Button variant="ghost" size="icon" className={ib} disabled={!owned.length} aria-label={t('ntRestore')} title={t('ntRestore')}
              onClick={done(() => owned.forEach(n => actions.patchQuiet(n.id, { trashed: false })))}>
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" className={`${ib} text-destructive hover:text-destructive`} disabled={!owned.length} aria-label={t('ntDeleteForever')} title={t('ntDeleteForever')}
              onClick={() => actions.removeMany(owned.map(n => n.id), onClear)}>
              <XCircle />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className={ib} aria-label={allPinned ? t('ntUnpin') : t('ntPin')} title={allPinned ? t('ntUnpin') : t('ntPin')}
              onClick={done(() => notes.forEach(n => actions.patchQuiet(n.id, { isPinned: !allPinned })))}>
              {allPinned ? <PinOff /> : <Pin />}
            </Button>
            {editable.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={ib} aria-label={t('noteColor')} title={t('noteColor')}><Palette /></Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-auto max-w-[17rem] rounded-2xl p-2.5">
                  <ColorPicker
                    value={editable.every(n => n.color === editable[0].color) ? editable[0].color : null}
                    onChange={(c) => editable.forEach(n => actions.patchQuiet(n.id, { color: c }))}
                    t={t}
                  />
                </PopoverContent>
              </Popover>
            )}
            {editable.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={ib} aria-label={t('ntLabels')} title={t('ntLabels')}><Tag /></Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-72 rounded-2xl p-3">
                  <LabelEditor labels={common} suggestions={labels} onChange={setLabels} t={t} />
                </PopoverContent>
              </Popover>
            )}
            <Button variant="ghost" size="icon" className={ib} aria-label={allArchived ? t('ntUnarchive') : t('ntArchive')} title={allArchived ? t('ntUnarchive') : t('ntArchive')}
              onClick={done(() => actions.archiveMany(notes.map(n => n.id), !allArchived))}>
              {allArchived ? <ArchiveRestore /> : <Archive />}
            </Button>
            {canCreate && (
              <Button variant="ghost" size="icon" className={ib} aria-label={t('ntDuplicate')} title={t('ntDuplicate')}
                onClick={done(() => notes.forEach(n => actions.duplicate(n, { quiet: true })))}>
                <Copy />
              </Button>
            )}
            {owned.length > 0 && (
              <Button variant="ghost" size="icon" className={`${ib} text-destructive hover:text-destructive`} aria-label={t('ntMoveToTrash')} title={t('ntMoveToTrash')}
                onClick={done(() => actions.trashMany(owned.map(n => n.id)))}>
                <Trash2 />
              </Button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
