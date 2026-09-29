import React from 'react';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import ItemChip from './ItemChip';
import { dayKey } from './calendarUtils';

const MAX_CHIPS = 3;

export default function MonthGrid({
  days, currentDate, selectedDate, dayMap, lang, locale, t, onSelect, onOpen, onOpenDay,
}) {
  const today = new Date();
  const weeks = days.length / 7;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-7 pb-2" aria-hidden="true">
        {days.slice(0, 7).map((d) => (
          <div key={dayKey(d)} className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {format(d, 'EEE', { locale })}
          </div>
        ))}
      </div>

      <div
        role="grid"
        className="grid min-h-[26rem] flex-1 grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/50"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const items = dayMap.get(dayKey(day)) || [];
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const selected = isSameDay(day, selectedDate);
          const label = format(day, 'EEEE, d MMMM', { locale });
          return (
            <div
              key={dayKey(day)}
              role="gridcell"
              aria-selected={selected}
              onClick={() => onSelect(day)}
              onDoubleClick={() => onOpenDay(day)}
              className={cn(
                'group relative flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 p-1 transition-colors sm:p-1.5',
                inMonth ? 'bg-card' : 'bg-popover',
                selected ? 'bg-primary/[0.09]' : 'hover:bg-foreground/[0.04]',
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={(e) => { e.stopPropagation(); onSelect(day); }}
                  className={cn(
                    'tabular grid h-7 min-w-7 place-items-center rounded-full px-1 text-[13px] font-semibold leading-none transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isToday
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--glow)/0.7)]'
                      : selected ? 'bg-primary/20 text-primary'
                      : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {format(day, 'd')}
                </button>
                {day.getDate() === 1 && (
                  <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                    {format(day, 'MMM', { locale })}
                  </span>
                )}
              </div>

              {/* Desktop: labelled chips */}
              <div className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
                {items.slice(0, MAX_CHIPS).map((item) => (
                  <ItemChip key={item.id} item={item} lang={lang} onOpen={onOpen} untitled={t('calUntitled')} className={cn(!inMonth && 'opacity-60')} />
                ))}
                {items.length > MAX_CHIPS && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenDay(day); }}
                    className="shrink-0 px-1 py-0.5 text-start text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t('calMoreCount').replace('{n}', items.length - MAX_CHIPS)}
                  </button>
                )}
              </div>

              {/* Phones: colour dots, details live in the agenda below */}
              {items.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden="true">
                  {items.slice(0, 4).map((item) => (
                    <span key={item.id} className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
