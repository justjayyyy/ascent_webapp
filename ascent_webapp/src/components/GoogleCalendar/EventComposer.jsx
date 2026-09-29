import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMinutes, format, parseISO, differenceInMinutes } from 'date-fns';
import { AlignLeft, Check, Clock, Loader2, MapPin, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { GOOGLE_EVENT_COLORS } from './calendarUtils';

const DT = "yyyy-MM-dd'T'HH:mm";
const D = 'yyyy-MM-dd';

const fieldBase = 'w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm';

/** Build the initial form from the composer request. */
function initialForm(req) {
  const item = req.item;
  if (item && item.kind === 'event') {
    const inclusiveEnd = item.allDay ? item.lastDay : item.end;
    return {
      kind: 'event', title: item.title, location: item.location || '', description: item.notes || '',
      allDay: item.allDay, colorId: item.colorId || '',
      start: item.allDay ? format(item.start, D) : format(item.start, DT),
      end: item.allDay ? format(inclusiveEnd, D) : format(item.end, DT),
      due: '',
    };
  }
  const base = req.start || new Date();
  const end = req.end || addMinutes(base, 60);
  return {
    kind: req.kind || 'event', title: '', location: '', description: '', allDay: !!req.allDay, colorId: '',
    start: req.allDay ? format(base, D) : format(base, DT),
    end: req.allDay ? format(base, D) : format(end, DT),
    due: format(base, D),
  };
}

export default function EventComposer({ request, onClose, onSave, onDelete, onToggleTask, saving, t, lang, locale, isRTL }) {
  const item = request.item;
  const readOnly = !!item && !item.editable;
  const editing = !!item && item.editable;
  const [form, setForm] = useState(() => initialForm(request));
  const titleRef = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => { if (!readOnly) titleRef.current?.focus(); }, [readOnly]);

  const accent = useMemo(() => {
    if (item) return item.color;
    if (form.kind === 'task') return 'hsl(var(--chart-4))';
    return GOOGLE_EVENT_COLORS[form.colorId] || 'hsl(var(--primary))';
  }, [item, form.kind, form.colorId]);

  // Keep the end after the start: moving the start shifts the end by the same amount.
  const onStartChange = (value) => {
    setForm((f) => {
      if (!value) return { ...f, start: value };
      try {
        const oldS = parseISO(f.start), oldE = parseISO(f.end), newS = parseISO(value);
        const shifted = f.allDay ? addDays(newS, differenceInMinutes(oldE, oldS) / 1440) : addMinutes(newS, differenceInMinutes(oldE, oldS));
        return { ...f, start: value, end: format(shifted, f.allDay ? D : DT) };
      } catch { return { ...f, start: value }; }
    });
  };

  const onAllDayChange = (checked) => {
    setForm((f) => {
      const s = f.start ? parseISO(f.start) : new Date();
      if (checked) return { ...f, allDay: true, start: format(s, D), end: format(f.end ? parseISO(f.end) : s, D) };
      const st = new Date(s); st.setHours(9, 0, 0, 0);
      return { ...f, allDay: false, start: format(st, DT), end: format(addMinutes(st, 60), DT) };
    });
  };

  const submit = (e) => {
    e?.preventDefault();
    if (saving || readOnly) return;
    onSave(form, item);
  };

  const dateLabel = item && (item.allDay
    ? format(item.start, 'EEEE, d MMMM yyyy', { locale })
    : `${format(item.start, 'EEEE, d MMMM', { locale })} · ${format(item.start, lang === 'en' ? 'h:mm a' : 'HH:mm')}`);

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm animate-in fade-in-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(e); }}
        role="dialog"
        aria-modal="true"
        aria-label={readOnly ? (item.title || t('calUntitled')) : editing ? t('editEvent') : (form.kind === 'task' ? t('newTask') : t('newEvent'))}
        dir={isRTL ? 'rtl' : 'ltr'}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-popover shadow-[0_30px_80px_-20px_hsl(0_0%_0%/0.7)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 sm:rounded-3xl"
      >
        <div className="h-1.5 shrink-0 transition-colors" style={{ background: accent }} />

        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {!editing && !readOnly ? (
            <div className="inline-flex rounded-xl bg-foreground/[0.06] p-1" role="tablist">
              {['event', 'task'].map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={form.kind === k}
                  onClick={() => set({ kind: k })}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    form.kind === k ? 'bg-popover text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k === 'event' ? t('calEvent') : t('calTask')}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">
              {readOnly ? (item.kind === 'task' ? t('calTask') : t('calHolidays')) : t('editEvent')}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {readOnly ? (
            <div className="space-y-3">
              <h2 className={cn('text-xl font-bold leading-tight tracking-tight text-foreground', item.done && 'line-through opacity-70')}>
                {item.title || t('calUntitled')}
              </h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" aria-hidden="true" />{dateLabel}</p>
              {item.notes && <p className="flex items-start gap-2 whitespace-pre-wrap text-sm text-foreground/80"><AlignLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{item.notes}</p>}
            </div>
          ) : (
            <>
              <input
                ref={titleRef}
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder={form.kind === 'task' ? t('taskTitlePlaceholder') : t('eventTitlePlaceholder')}
                aria-label={form.kind === 'task' ? t('taskTitle') : t('eventTitle')}
                className="w-full border-0 border-b border-border/70 bg-transparent pb-2 text-xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
              />

              {form.kind === 'event' ? (
                <>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">{t('startTime')}</span>
                        <input type={form.allDay ? 'date' : 'datetime-local'} value={form.start} onChange={(e) => onStartChange(e.target.value)} className={fieldBase} required />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">{t('endTime')}</span>
                        <input type={form.allDay ? 'date' : 'datetime-local'} value={form.end} min={form.start} onChange={(e) => set({ end: e.target.value })} className={fieldBase} required />
                      </label>
                      <label className="flex items-center gap-2 sm:col-span-2">
                        <Switch checked={form.allDay} onCheckedChange={onAllDayChange} aria-label={t('allDayEvent')} />
                        <span className="text-sm text-foreground">{t('allDayEvent')}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder={t('addLocation')} aria-label={t('location')} className={fieldBase} />
                  </div>

                  <div className="flex items-start gap-3">
                    <AlignLeft className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('addDescription')} aria-label={t('description')} rows={3} className={cn(fieldBase, 'resize-none')} />
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" />
                    <div role="radiogroup" aria-label={t('calColor')} className="flex flex-wrap gap-1.5">
                      {['', ...Object.keys(GOOGLE_EVENT_COLORS)].map((id) => {
                        const c = id ? GOOGLE_EVENT_COLORS[id] : 'hsl(var(--primary))';
                        const on = form.colorId === id;
                        return (
                          <button
                            key={id || 'default'}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={`${t('calColor')} ${id || 1}`}
                            onClick={() => set({ colorId: id })}
                            className={cn(
                              'grid h-6 w-6 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
                              on && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-popover',
                            )}
                            style={{ background: c }}
                          >
                            {on && <Check className="h-3 w-3 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <label className="block flex-1">
                      <span className="sr-only">{t('dueDate')}</span>
                      <input type="date" value={form.due} onChange={(e) => set({ due: e.target.value })} className={fieldBase} />
                    </label>
                  </div>
                  <div className="flex items-start gap-3">
                    <AlignLeft className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('addNotes')} aria-label={t('notes')} rows={3} className={cn(fieldBase, 'resize-none')} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-5 py-3">
          {editing && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />{t('delete')}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {readOnly ? t('close') : t('cancel')}
          </button>
          {readOnly && item.kind === 'task' && (
            <button
              type="button"
              onClick={() => onToggleTask(item)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Check className="h-4 w-4" />{item.done ? t('calMarkNotDone') : t('calMarkDone')}
            </button>
          )}
          {!readOnly && (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--glow)/0.55)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? t('save') : t('create')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
