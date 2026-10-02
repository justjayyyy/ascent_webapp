import React from 'react';
import { motion } from '@/lib/motion';
import { Bell, FileText, Image as ImageIcon, Link2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTE_FILTERS } from './noteUtils';

const ICONS = { lists: ListChecks, images: ImageIcon, links: Link2, reminders: Bell, files: FileText };

/**
 * Narrow the notes by kind (lists, photos, links, reminders, files) or colour, like the chips on
 * Keep's search screen. Only kinds and colours that some note actually has are offered.
 */
export default function SearchFilters({ available, colors, filter, color, onFilter, onColor, t }) {
  const kinds = NOTE_FILTERS.filter(k => available.has(k));
  if (!kinds.length && colors.length < 2) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0"
      role="group"
      aria-label={t('ntFilterBy')}
    >
      {kinds.map(key => {
        const Icon = ICONS[key];
        const active = filter === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onFilter(active ? null : key)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
              active ? 'border-transparent bg-primary text-primary-foreground' : 'border-border/70 bg-card/60 text-foreground/80 hover:bg-accent'
            )}
          >
            <Icon className="h-4 w-4" /> {t(`ntFilter_${key}`)}
          </button>
        );
      })}
      {colors.length > 1 && (
        <span className="flex shrink-0 items-center gap-1.5 ps-1" role="radiogroup" aria-label={t('noteColor')}>
          {colors.map(key => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={t(`ntColor_${key}`)}
              title={t(`ntColor_${key}`)}
              onClick={() => onColor(color === key ? null : key)}
              data-note-color={key === 'default' ? undefined : key}
              className={cn(
                'h-8 w-8 shrink-0 rounded-full border transition-transform hover:scale-110 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
                key === 'default' ? 'border-border bg-card' : 'note-swatch border-transparent',
                color === key && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
            />
          ))}
        </span>
      )}
    </motion.div>
  );
}
