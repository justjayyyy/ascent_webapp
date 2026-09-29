import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay, startOfDay, differenceInMinutes, addMinutes } from 'date-fns';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import ItemChip from './ItemChip';
import {
  HOUR_HEIGHT as HH, SNAP_MINUTES, dayKey, chipStyle, fmtClock, fmtHourLabel, layoutTimed, minutesOfDay,
} from './calendarUtils';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TimeGrid({ days, dayMap, lang, locale, t, onCreate, onOpen, onCommit, onDayClick }) {
  const scrollRef = useRef(null);
  const colRefs = useRef([]);
  const dragRef = useRef(null);
  const justDragged = useRef(false);
  const cleanupRef = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [drag, setDrag] = useState(null); // { id, mode, dayIndex, startMin, durMin }

  const n = days.length;
  const multi = n > 1;
  const cols = `3.5rem repeat(${n}, minmax(0, 1fr))`;
  const todayIndex = days.findIndex((d) => isSameDay(d, now));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => cleanupRef.current?.(), []);

  // Open scrolled to the working day (or just before "now" when today is visible)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = todayIndex >= 0 ? Math.max(0, new Date().getHours() - 2) : 7;
    el.scrollTop = hour * HH;
  }, []);

  const perDay = useMemo(() => days.map((day) => {
    const all = dayMap.get(dayKey(day)) || [];
    return {
      allDay: all.filter((i) => i.allDay),
      timed: all.filter((i) => !i.allDay),
    };
  }), [days, dayMap]);
  const hasAllDay = perDay.some((d) => d.allDay.length > 0);

  const columnIndexAt = (clientX) => {
    for (let i = 0; i < colRefs.current.length; i++) {
      const r = colRefs.current[i]?.getBoundingClientRect();
      if (r && clientX >= r.left && clientX <= r.right) return i;
    }
    return null;
  };

  const beginDrag = (e, item, mode, dayIndex) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!item.editable || e.pointerType === 'touch') return; // touch users tap to edit
    dragRef.current = {
      item, mode, x0: e.clientX, y0: e.clientY, moved: false,
      startMin: minutesOfDay(item.start),
      durMin: Math.max(differenceInMinutes(item.end, item.start), SNAP_MINUTES),
      dayIndex, cur: null,
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      cleanupRef.current = null;
    };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = ev.clientY - d.y0;
      if (!d.moved && Math.hypot(ev.clientX - d.x0, dy) < 4) return;
      d.moved = true;
      const delta = Math.round((dy / HH) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
      let { startMin, durMin, dayIndex: di } = d;
      if (d.mode === 'move') {
        startMin = clamp(d.startMin + delta, 0, 1440 - d.durMin);
        di = columnIndexAt(ev.clientX) ?? d.cur?.dayIndex ?? d.dayIndex;
      } else {
        durMin = clamp(d.durMin + delta, SNAP_MINUTES, 1440 - d.startMin);
      }
      d.cur = { id: d.item.id, mode: d.mode, dayIndex: di, startMin, durMin };
      setDrag(d.cur);
    };
    const onUp = () => {
      const d = dragRef.current;
      cleanup();
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.moved || !d.cur) { onOpen(d.item); return; }
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      const { dayIndex: di, startMin, durMin } = d.cur;
      const start = addMinutes(startOfDay(days[di]), startMin);
      const changed = +start !== +d.item.start || durMin !== differenceInMinutes(d.item.end, d.item.start);
      if (changed) onCommit(d.item, start, addMinutes(start, durMin));
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); cleanup(); dragRef.current = null; setDrag(null); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
    cleanupRef.current = cleanup;
  };

  const createAt = (e, day, i) => {
    if (justDragged.current) return;
    const rect = colRefs.current[i].getBoundingClientRect();
    const minutes = clamp(Math.floor(((e.clientY - rect.top) / HH) * 2) * 30, 0, 23 * 60 + 30);
    onCreate(addMinutes(startOfDay(day), minutes));
  };

  const renderEvent = (item, i, col, colCount) => {
    const startMin = minutesOfDay(item.start);
    const dur = Math.max(differenceInMinutes(item.end, item.start), SNAP_MINUTES);
    const height = Math.max((dur / 60) * HH - 2, 20);
    const dragging = drag?.id === item.id;
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        aria-label={`${item.title || t('calUntitled')}, ${fmtClock(item.start, lang)} – ${fmtClock(item.end, lang)}`}
        onPointerDown={(e) => beginDrag(e, item, 'move', i)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } }}
        className={cn(
          'group/ev absolute select-none overflow-hidden rounded-lg px-2 py-1 text-foreground',
          'transition-[filter,opacity] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          item.editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          dragging && 'opacity-30',
        )}
        style={{
          ...chipStyle(item.color),
          top: (startMin / 60) * HH + 1,
          height,
          insetInlineStart: `calc(${(col / colCount) * 100}% + 2px)`,
          width: `calc(${100 / colCount}% - 4px)`,
          zIndex: 1,
          touchAction: 'pan-y',
        }}
      >
        <p className="truncate text-xs font-semibold leading-tight">{item.title || t('calUntitled')}</p>
        {height >= 38 && (
          <p className="tabular truncate text-[11px] leading-tight text-muted-foreground">
            {fmtClock(item.start, lang)} – {fmtClock(item.end, lang)}
          </p>
        )}
        {height >= 62 && item.location && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />{item.location}
          </p>
        )}
        {item.editable && (
          <span
            onPointerDown={(e) => beginDrag(e, item, 'resize', i)}
            className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-0.5"
            aria-hidden="true"
          >
            <span className="h-[3px] w-6 rounded-full bg-foreground/30 opacity-0 transition-opacity group-hover/ev:opacity-100" />
          </span>
        )}
      </div>
    );
  };

  const ghost = drag && (() => {
    const item = perDay.flatMap((d) => d.timed).find((x) => x.id === drag.id);
    if (!item) return null;
    const start = addMinutes(startOfDay(days[drag.dayIndex]), drag.startMin);
    const end = addMinutes(start, drag.durMin);
    return (
      <div
        className="pointer-events-none absolute inset-x-0.5 z-[3] overflow-hidden rounded-lg px-2 py-1 text-foreground shadow-[0_14px_34px_-10px_hsl(0_0%_0%/0.55)] ring-1 ring-[var(--ev)]"
        style={{
          ...chipStyle(item.color, 34),
          top: (drag.startMin / 60) * HH + 1,
          height: Math.max((drag.durMin / 60) * HH - 2, 20),
        }}
      >
        <p className="truncate text-xs font-semibold leading-tight">{item.title || t('calUntitled')}</p>
        <p className="tabular text-[11px] leading-tight text-foreground/80">{fmtClock(start, lang)} – {fmtClock(end, lang)}</p>
      </div>
    );
  })();

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto overscroll-contain">
      <div className={cn(multi && 'min-w-[640px] sm:min-w-0')}>
        {/* Day headers + all-day strip */}
        <div className="sticky top-0 z-30 border-b border-border/60 bg-popover/95 backdrop-blur-md">
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <div className="sticky start-0 bg-popover/95" />
            {days.map((day) => {
              const today = isSameDay(day, now);
              const Tag = onDayClick ? 'button' : 'div';
              return (
                <Tag
                  key={dayKey(day)}
                  {...(onDayClick ? { type: 'button', onClick: () => onDayClick(day) } : {})}
                  className={cn('flex flex-col items-center gap-1 py-2.5 transition-colors', onDayClick && 'hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring')}
                >
                  <span className={cn('text-[11px] font-medium uppercase tracking-wider', today ? 'text-primary' : 'text-muted-foreground')}>
                    {format(day, 'EEE', { locale })}
                  </span>
                  <span
                    className={cn(
                      'tabular grid h-9 min-w-9 place-items-center rounded-full px-1 text-lg font-semibold leading-none',
                      today ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_-6px_hsl(var(--glow)/0.7)]' : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </Tag>
              );
            })}
          </div>

          {hasAllDay && (
            <div className="grid border-t border-border/40" style={{ gridTemplateColumns: cols }}>
              <div className="sticky start-0 flex items-start justify-end bg-popover/95 pe-2 pt-2 text-[11px] text-muted-foreground">
                {t('allDay')}
              </div>
              {perDay.map((d, i) => (
                <div key={i} className="min-w-0 space-y-0.5 border-s border-border/40 p-1">
                  {d.allDay.slice(0, multi ? 3 : d.allDay.length).map((item) => (
                    <ItemChip key={item.id} item={item} lang={lang} onOpen={onOpen} untitled={t('calUntitled')} />
                  ))}
                  {multi && d.allDay.length > 3 && (
                    <button
                      type="button"
                      onClick={() => (onDayClick ? onDayClick(days[i]) : onOpen(d.allDay[3]))}
                      className="w-full px-1 py-0.5 text-start text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {t('calMoreCount').replace('{n}', d.allDay.length - 3)}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Time grid */}
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HH }}>
          <div className="sticky start-0 z-10 isolate bg-popover/95">
            <div className="relative h-full">
              {HOURS.slice(1).map((h) => (
                <span
                  key={h}
                  className="tabular absolute end-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
                  style={{ top: h * HH }}
                >
                  {fmtHourLabel(h, lang)}
                </span>
              ))}
              {todayIndex >= 0 && (
                <span
                  className="tabular absolute end-1.5 z-10 -translate-y-1/2 whitespace-nowrap rounded bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                  style={{ top: (minutesOfDay(now) / 60) * HH }}
                >
                  {fmtClock(now, lang)}
                </span>
              )}
            </div>
          </div>

          {days.map((day, i) => {
            const today = i === todayIndex;
            const laid = layoutTimed(perDay[i].timed.filter((x) => x.id !== drag?.id));
            return (
              <div
                key={dayKey(day)}
                ref={(el) => { colRefs.current[i] = el; }}
                onClick={(e) => createAt(e, day, i)}
                className={cn('relative cursor-cell border-s border-border/40', today && 'bg-primary/[0.035]')}
                style={{
                  backgroundImage: 'linear-gradient(to bottom, hsl(var(--border) / 0.6) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.2) 1px, transparent 1px)',
                  backgroundSize: `100% ${HH}px, 100% ${HH / 2}px`,
                }}
              >
                {laid.map(({ item, col, cols: cc }) => renderEvent(item, i, col, cc))}
                {drag && drag.dayIndex === i && ghost}
                {today && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[2]"
                    style={{ top: (minutesOfDay(now) / 60) * HH }}
                    aria-hidden="true"
                  >
                    <div className="h-0.5 -translate-y-1/2 bg-primary shadow-[0_0_10px_hsl(var(--glow)/0.8)]" />
                    <span className="absolute -start-1 top-0 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
