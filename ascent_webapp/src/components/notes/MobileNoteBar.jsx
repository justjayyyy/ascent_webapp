import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Image as ImageIcon, ListChecks, Plus } from 'lucide-react';

/**
 * Phones: a thumb-reach bar at the bottom, like the Keep app. "Take a note", a new list or a photo
 * note each open straight into the full-screen editor.
 */
export default function MobileNoteBar({ onNew, onImage, t }) {
  const reduce = useReducedMotion();
  const fileRef = useRef(null);
  return (
    <motion.div
      initial={reduce ? false : { y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-full border border-border/70 bg-popover/95 p-1.5 shadow-[0_18px_50px_-18px_hsl(0_0%_0%/0.7)] backdrop-blur-xl sm:hidden"
    >
      <button
        type="button"
        onClick={() => onNew('text')}
        className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full px-4 text-start text-[15px] text-muted-foreground transition-colors active:bg-foreground/[0.08]"
      >
        <span className="truncate">{t('ntTakeNote')}</span>
      </button>
      <button
        type="button"
        onClick={() => onNew('checklist')}
        aria-label={t('ntNewChecklist')}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors active:bg-foreground/[0.08]"
      >
        <ListChecks className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label={t('ntNewImageNote')}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors active:bg-foreground/[0.08]"
      >
        <ImageIcon className="h-5 w-5" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onImage(e.target.files); e.target.value = ''; }}
      />
      <button
        type="button"
        onClick={() => onNew('text')}
        aria-label={t('ntNewNote')}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--glow)/0.8)] transition-transform active:scale-90"
      >
        <Plus className="h-6 w-6" />
      </button>
    </motion.div>
  );
}
