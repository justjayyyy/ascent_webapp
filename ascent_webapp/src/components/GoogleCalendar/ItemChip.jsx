import React from 'react';
import { CheckCircle2, Circle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chipStyle, fmtClockShort } from './calendarUtils';

/** Small leading glyph so tasks and holidays are recognisable without relying on colour. */
export function KindGlyph({ item, className }) {
  if (item.kind === 'task') {
    const Icon = item.done ? CheckCircle2 : Circle;
    return <Icon className={cn('h-3 w-3 shrink-0', className)} aria-hidden="true" />;
  }
  if (item.kind === 'holiday') return <Star className={cn('h-3 w-3 shrink-0', className)} aria-hidden="true" />;
  return null;
}

/** A single-line item pill used in the month grid and the all-day strip. */
export default function ItemChip({ item, lang, onOpen, showTime = true, className, untitled }) {
  const title = item.title || untitled;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(item); }}
      title={title}
      className={cn(
        'flex h-5 w-full min-w-0 items-center gap-1 rounded-md ps-2 pe-1.5 text-start text-xs leading-none text-foreground',
        'transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        item.done && 'opacity-60',
        className,
      )}
      style={chipStyle(item.color)}
    >
      <KindGlyph item={item} className="text-[var(--ev)]" />
      {showTime && !item.allDay && (
        <span className="tabular shrink-0 text-muted-foreground">{fmtClockShort(item.start, lang)}</span>
      )}
      <span className={cn('truncate font-medium', item.done && 'line-through')}>{title}</span>
    </button>
  );
}
