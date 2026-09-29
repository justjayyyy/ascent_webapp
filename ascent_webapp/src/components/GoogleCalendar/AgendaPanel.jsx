import React from 'react';
import { format, isSameDay } from 'date-fns';
import { MapPin, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chipStyle, fmtClock } from './calendarUtils';
import { KindGlyph } from './ItemChip';

export default function AgendaPanel({ date, items, lang, locale, t, onOpen, onNew, className }) {
  const isToday = isSameDay(date, new Date());
  const kindLabel = { event: t('calEvent'), task: t('calTask'), holiday: t('calHolidays') };

  return (
    <section className={cn('flex flex-col', className)} aria-label={t('calAgenda')}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {format(date, 'EEEE', { locale })}
            {isToday && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-primary">
                {t('today')}
              </span>
            )}
          </p>
          <p className="tabular text-2xl font-bold leading-tight tracking-tight text-foreground">
            {format(date, 'd MMMM', { locale })}
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          aria-label={t('newEvent')}
          title={t('newEvent')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{t('noEventsToday')}</p>
          <p className="text-xs text-muted-foreground">{t('calFreeDay')}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className={cn(
                  'flex w-full items-stretch gap-3 rounded-xl p-2.5 text-start transition-[filter]',
                  'hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  item.done && 'opacity-60',
                )}
                style={chipStyle(item.color, 14)}
              >
                <span className="tabular w-[4.25rem] shrink-0 whitespace-nowrap pt-px text-xs leading-tight text-muted-foreground">
                  {item.allDay ? (
                    <span className="font-medium text-foreground/80">{t('allDay')}</span>
                  ) : (
                    <>
                      <span className="block font-semibold text-foreground">{fmtClock(item.start, lang)}</span>
                      <span className="block">{fmtClock(item.end, lang)}</span>
                    </>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('flex items-center gap-1.5 text-sm font-medium leading-snug text-foreground', item.done && 'line-through')}>
                    <KindGlyph item={item} className="text-[var(--ev)]" />
                    <span className="truncate">{item.title || t('calUntitled')}</span>
                  </span>
                  {item.location ? (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />{item.location}
                    </span>
                  ) : item.kind !== 'event' ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{kindLabel[item.kind]}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
