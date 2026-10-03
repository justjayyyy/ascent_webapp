import React, { useEffect, useMemo, useState } from 'react';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameDay, isSameMonth, format,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dayKey } from './calendarUtils';

export default function MiniMonth({ currentDate, selectedDate, dayMap, locale, weekStartsOn, isRTL, t, onPick }) {
  const [shown, setShown] = useState(() => startOfMonth(currentDate));
  useEffect(() => { setShown(startOfMonth(currentDate)); }, [currentDate]);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(shown), { weekStartsOn }),
    end: endOfWeek(endOfMonth(shown), { weekStartsOn }),
  }), [shown, weekStartsOn]);
  const today = new Date();
  const Prev = isRTL ? ChevronRight : ChevronLeft;
  const Next = isRTL ? ChevronLeft : ChevronRight;
  const navBtn = 'grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-sm font-semibold capitalize text-foreground">{format(shown, 'LLLL yyyy', { locale })}</p>
        <div className="flex">
          <button type="button" className={navBtn} aria-label={t('dashPrevMonth')} onClick={() => setShown(subMonths(shown, 1))}><Prev className="h-4 w-4" /></button>
          <button type="button" className={navBtn} aria-label={t('dashNextMonth')} onClick={() => setShown(addMonths(shown, 1))}><Next className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center" role="grid">
        {days.slice(0, 7).map((d) => (
          <span key={dayKey(d)} className="pb-1 text-[11px] font-medium uppercase text-muted-foreground" aria-hidden="true">
            {format(d, 'EEEEE', { locale })}
          </span>
        ))}
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          const selected = isSameDay(d, selectedDate);
          const has = dayMap.has(dayKey(d));
          return (
            <button
              key={dayKey(d)}
              type="button"
              onClick={() => onPick(d)}
              aria-label={format(d, 'EEEE, d MMMM', { locale })}
              aria-pressed={selected}
              className={cn(
                'tabular relative mx-auto grid h-8 w-8 place-items-center rounded-full text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'bg-primary font-semibold text-primary-foreground'
                  : isToday ? 'font-semibold text-primary ring-1 ring-inset ring-primary/50 hover:bg-primary/10'
                  : isSameMonth(d, shown) ? 'text-foreground hover:bg-foreground/[0.07]' : 'text-muted-foreground/50 hover:bg-foreground/[0.05]',
              )}
            >
              {format(d, 'd')}
              {has && <span className={cn('absolute bottom-[3px] h-[3px] w-[3px] rounded-full', selected ? 'bg-primary-foreground' : 'bg-primary')} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
