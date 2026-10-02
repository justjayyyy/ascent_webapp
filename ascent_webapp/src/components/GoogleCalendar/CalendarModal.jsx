import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  addDays, addMonths, subMonths, addWeeks, subWeeks, subDays, addMinutes, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, format, parseISO,
} from 'date-fns';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Layers, LogOut, Plus, RefreshCw, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import TimeGrid from './TimeGrid';
import MonthGrid from './MonthGrid';
import MiniMonth from './MiniMonth';
import AgendaPanel from './AgendaPanel';
import EventComposer from './EventComposer';
import { LOCALES, weekStartsOnFor, normalizeItem, buildDayMap, dayKey } from './calendarUtils';
import { CALENDAR_EXPIRY_KEY, CALENDAR_TOKEN_KEY } from '@/lib/storageKeys';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks';
const HOLIDAY_CALENDAR = 'en.jewish#holiday@group.v.calendar.google.com';
const LAYERS_KEY = 'ascent.calendar.layers';
const VIEWS = ['day', 'week', 'month'];

const iconBtn = 'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

const readLayers = () => {
  try { return { event: true, task: true, holiday: true, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || '{}') }; } catch { return { event: true, task: true, holiday: true }; }
};

/** First-run screen: what you get, plus the Google button. */
function ConnectScreen({ t, onConnect }) {
  const perks = [t('calPerk1'), t('calPerk2'), t('calPerk3')];
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div>
          <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <CalendarDays className="h-6 w-6" />
          </span>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground">{t('connectCalendar')}</h2>
          <p className="mt-3 max-w-md text-base text-muted-foreground">{t('connectCalendarDesc')}</p>
          <ul className="mt-6 space-y-2.5">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm text-foreground/90">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success"><Check className="h-3 w-3" /></span>
                {p}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onConnect}
            className="mt-8 inline-flex h-12 items-center gap-3 rounded-xl border border-border bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />
            {t('connectWithGoogle')}
          </button>
        </div>

        {/* Decorative preview */}
        <div aria-hidden="true" className="relative hidden md:block">
          <div className="absolute -inset-6 rounded-[2rem] opacity-70 blur-2xl" style={{ background: 'radial-gradient(60% 60% at 50% 40%, hsl(var(--glow) / 0.28), transparent 70%)' }} />
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-[0_30px_80px_-30px_hsl(0_0%_0%/0.6)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="h-3 w-24 rounded-full bg-foreground/15" />
              <span className="h-6 w-16 rounded-lg bg-primary/25" />
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 21 }, (_, i) => (
                <div key={i} className={cn('h-14 rounded-lg bg-foreground/[0.04] p-1', i === 9 && 'ring-1 ring-primary/50 bg-primary/[0.08]')}>
                  {[2, 5, 9, 11, 16].includes(i) && (
                    <span className="block h-2 rounded-full" style={{ background: ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--primary))', 'hsl(var(--chart-4))', 'hsl(var(--chart-3))'][[2, 5, 9, 11, 16].indexOf(i)] }} />
                  )}
                  {[5, 9].includes(i) && <span className="mt-1 block h-2 w-2/3 rounded-full bg-foreground/15" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarModal({ open, onOpenChange }) {
  const { t, language, isRTL } = useTheme();
  const locale = LOCALES[language] || LOCALES.en;
  const weekStartsOn = weekStartsOnFor(language);

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [view, setView] = useState('month');
  const [layers, setLayers] = useState(readLayers);

  const [accessToken, setAccessToken] = useState(null);
  const [rawEvents, setRawEvents] = useState([]);
  const [rawTasks, setRawTasks] = useState([]);
  const [rawHolidays, setRawHolidays] = useState([]);
  const [colorMap, setColorMap] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [composer, setComposer] = useState(null);
  const [saving, setSaving] = useState(false);

  const tokenRef = useRef(null);
  const loadedRange = useRef(null);
  const isAuthenticated = !!accessToken;

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  // Restore a still-valid token
  useEffect(() => {
    try {
      const token = localStorage.getItem(CALENDAR_TOKEN_KEY);
      const expiry = localStorage.getItem(CALENDAR_EXPIRY_KEY);
      if (token && expiry && Date.now() < parseInt(expiry, 10)) setAccessToken(token);
    } catch { /* storage unavailable */ }
  }, []);

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem(CALENDAR_TOKEN_KEY);
      localStorage.removeItem(CALENDAR_EXPIRY_KEY);
    } catch { /* storage unavailable */ }
    loadedRange.current = null;
    setAccessToken(null);
    setRawEvents([]); setRawTasks([]); setRawHolidays([]);
  }, []);

  const gcal = useCallback(async (action, { method = 'GET', params = {}, body } = {}) => {
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/integrations/google-calendar?${qs}`, {
      method,
      headers: { Authorization: `Bearer ${tokenRef.current}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSession();
      toast.error(t('calendarSessionExpired'));
      throw new Error('unauthorized');
    }
    return res;
  }, [clearSession, t]);

  const handleGoogleAuth = useCallback(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) {
      toast.error(t('calGoogleUnavailable'));
      return;
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPES,
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          try {
            localStorage.setItem(CALENDAR_TOKEN_KEY, response.access_token);
            localStorage.setItem(CALENDAR_EXPIRY_KEY, String(Date.now() + 3600000));
          } catch { /* storage unavailable */ }
          toast.success(t('calendarConnected'));
        } else if (response.error) {
          toast.error(t('calSaveFailed'));
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' }); // consent again so new scopes are granted
  }, [t]);

  const disconnect = useCallback(() => {
    clearSession();
    setComposer(null);
    toast.success(t('calendarDisconnected'));
  }, [clearSession, t]);

  // ---- Data -------------------------------------------------------------
  const fetchAll = useCallback(async (center = new Date()) => {
    if (!tokenRef.current) return;
    setIsRefreshing(true);
    const from = startOfMonth(subMonths(center, 3));
    const to = endOfMonth(addMonths(center, 3));
    loadedRange.current = { from, to };
    const range = { timeMin: from.toISOString(), timeMax: to.toISOString() };
    try {
      const [ev, colors, tasks, hol] = await Promise.allSettled([
        gcal('list-events', { params: { ...range, maxResults: 500 } }),
        gcal('get-colors'),
        gcal('list-tasks'),
        gcal('list-events', { params: { ...range, maxResults: 100, calendarId: HOLIDAY_CALENDAR } }),
      ]);
      const json = async (r) => (r.status === 'fulfilled' && r.value.ok ? r.value.json() : null);
      const [evData, colorData, taskData, holData] = await Promise.all([json(ev), json(colors), json(tasks), json(hol)]);
      if (Array.isArray(evData)) setRawEvents(evData);
      if (colorData?.event) setColorMap(Object.fromEntries(Object.entries(colorData.event).map(([id, c]) => [id, c.background])));
      if (Array.isArray(taskData)) setRawTasks(taskData);
      if (Array.isArray(holData)) setRawHolidays(holData);
    } catch (err) {
      if (err.message !== 'unauthorized') console.error('Failed to fetch calendar data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [gcal]);

  // Load when opened, and again when navigating close to the edge of what is loaded
  useEffect(() => {
    if (!open || !isAuthenticated) return undefined;
    const r = loadedRange.current;
    const needed = !r || currentDate < addMonths(r.from, 1) || currentDate > subMonths(r.to, 1);
    if (!needed) return undefined;
    const id = setTimeout(() => fetchAll(currentDate), 200);
    return () => clearTimeout(id);
  }, [open, isAuthenticated, currentDate, fetchAll]);

  const allItems = useMemo(() => [
    ...rawEvents.map((e) => normalizeItem(e, 'event', colorMap)),
    ...rawTasks.map((e) => normalizeItem(e, 'task', colorMap)),
    ...rawHolidays.map((e) => normalizeItem(e, 'holiday', colorMap)),
  ].filter(Boolean), [rawEvents, rawTasks, rawHolidays, colorMap]);

  const items = useMemo(() => allItems.filter((i) => layers[i.kind]), [allItems, layers]);
  const dayMap = useMemo(() => buildDayMap(items), [items]);
  const selectedItems = dayMap.get(dayKey(selectedDate)) || [];

  const toggleLayer = (kind) => setLayers((prev) => {
    const next = { ...prev, [kind]: !prev[kind] };
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  // ---- Mutations --------------------------------------------------------
  const eventBody = (form, base) => {
    const { colorId: _c, start: _s, end: _e, ...rest } = base || {};
    const startVal = form.start;
    const endVal = form.end || form.start;
    const body = {
      ...rest,
      summary: form.title.trim(),
      description: form.description,
      location: form.location,
      start: form.allDay ? { date: startVal } : { dateTime: new Date(startVal).toISOString() },
      end: form.allDay
        ? { date: format(addDays(parseISO(endVal), 1), 'yyyy-MM-dd') } // Google's all-day end is exclusive
        : { dateTime: new Date(endVal).toISOString() },
    };
    if (form.colorId) body.colorId = form.colorId;
    return body;
  };

  const saveForm = async (form, item) => {
    if (!form.title.trim()) {
      toast.error(form.kind === 'task' ? t('taskTitleRequired') : t('eventTitleRequired'));
      return;
    }
    if (form.kind === 'event' && form.end && form.start && new Date(form.end) < new Date(form.start)) {
      toast.error(t('calSaveFailed'));
      return;
    }
    setSaving(true);
    try {
      let res;
      if (form.kind === 'task') {
        const task = { title: form.title.trim(), notes: form.description };
        if (form.due) task.due = `${form.due}T00:00:00.000Z`;
        res = await gcal('create-task', { method: 'POST', body: task });
      } else if (item) {
        res = await gcal('update-event', { method: 'PUT', params: { eventId: item.id }, body: eventBody(form, item.raw) });
      } else {
        res = await gcal('create-event', { method: 'POST', body: eventBody(form) });
      }
      if (!res.ok) throw new Error('save failed');
      toast.success(form.kind === 'task' ? t('taskCreated') : item ? t('eventUpdated') : t('eventCreated'));
      setComposer(null);
      fetchAll(currentDate);
    } catch (err) {
      if (err.message !== 'unauthorized') toast.error(t('calSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    setSaving(true);
    try {
      const res = await gcal('delete-event', { method: 'DELETE', params: { eventId: item.id } });
      if (!res.ok) throw new Error('delete failed');
      setRawEvents((prev) => prev.filter((e) => e.id !== item.id));
      toast.success(t('eventDeleted'));
      setComposer(null);
    } catch (err) {
      if (err.message !== 'unauthorized') toast.error(t('calSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Tick a Google Task on/off: update instantly, sync in the background
  const toggleTask = async (item) => {
    const done = !item.done;
    const patch = done
      ? { status: 'completed' }
      : { status: 'needsAction', completed: null };
    const apply = (p) => setRawTasks((prev) => prev.map((x) => (`task:${x.id}` === item.id ? { ...x, ...p } : x)));
    apply(patch);
    setComposer((c) => (c?.item?.id === item.id ? null : c));
    try {
      const res = await gcal('update-task', {
        method: 'PATCH',
        params: { tasklistId: item.raw.taskListId, taskId: item.raw.id },
        body: patch,
      });
      if (!res.ok) throw new Error('update failed');
    } catch (err) {
      apply({ status: item.raw.status, completed: item.raw.completed });
      if (err.message !== 'unauthorized') toast.error(t('calSaveFailed'));
    }
  };

  // Drag-to-move / resize from the time grid: update instantly, sync in the background
  const commitTime = async (item, start, end) => {
    const patch = { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
    setRawEvents((prev) => prev.map((e) => (e.id === item.id ? { ...e, ...patch } : e)));
    try {
      const res = await gcal('update-event', { method: 'PUT', params: { eventId: item.id }, body: { ...item.raw, ...patch } });
      if (!res.ok) throw new Error('update failed');
    } catch (err) {
      if (err.message !== 'unauthorized') toast.error(t('calSaveFailed'));
      fetchAll(currentDate);
    }
  };

  // ---- Navigation -------------------------------------------------------
  const goTo = (date) => { setCurrentDate(date); setSelectedDate(date); };
  const step = (dir) => {
    if (view === 'month') {
      const next = dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
      const anchor = isSameMonth(next, new Date()) ? new Date() : startOfMonth(next);
      setCurrentDate(next); setSelectedDate(anchor);
    } else if (view === 'week') {
      goTo(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      goTo(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    }
  };
  const goToday = () => goTo(new Date());
  const openDay = (day) => { goTo(day); setView('day'); };
  const selectDay = (day) => {
    setSelectedDate(day);
    if (view === 'month' && !isSameMonth(day, currentDate)) setCurrentDate(day);
  };

  const openNew = (start) => {
    let base = start;
    if (!base) {
      base = new Date(selectedDate);
      base.setHours(isSameDay(selectedDate, new Date()) ? Math.min(new Date().getHours() + 1, 22) : 9, 0, 0, 0);
    }
    setComposer({ start: base, end: addMinutes(base, 60) });
  };
  const openItem = (item) => setComposer({ item });

  // Keyboard shortcuts (t, d, w, m, n, arrows)
  const onKeyDown = (e) => {
    if (composer || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const k = e.key.toLowerCase();
    if (k === 't') goToday();
    else if (k === 'd') setView('day');
    else if (k === 'w') setView('week');
    else if (k === 'm') setView('month');
    else if (k === 'n') { e.preventDefault(); openNew(); }
    else if (e.key === 'ArrowRight') step(isRTL ? -1 : 1);
    else if (e.key === 'ArrowLeft') step(isRTL ? 1 : -1);
  };

  // ---- Derived view data ------------------------------------------------
  const monthDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn }),
  }), [currentDate, weekStartsOn]);
  const weekStart = startOfWeek(currentDate, { weekStartsOn });
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }), [weekStart.getTime()]);

  const title = useMemo(() => {
    if (view === 'month') return { main: format(currentDate, 'LLLL', { locale }), sub: format(currentDate, 'yyyy') };
    if (view === 'week') {
      const end = addDays(weekStart, 6);
      return { main: `${format(weekStart, 'd MMM', { locale })} – ${format(end, 'd MMM', { locale })}`, sub: format(end, 'yyyy') };
    }
    return { main: format(currentDate, 'EEEE, d MMMM', { locale }), sub: format(currentDate, 'yyyy') };
  }, [view, currentDate, weekStart, locale]);

  const Prev = isRTL ? ChevronRight : ChevronLeft;
  const Next = isRTL ? ChevronLeft : ChevronRight;
  const viewLabels = { day: t('day'), week: t('week'), month: t('month') };
  const layerDefs = [
    { key: 'event', label: t('calEvents'), color: 'hsl(var(--primary))' },
    { key: 'task', label: t('calTasks'), color: 'hsl(var(--chart-4))' },
    { key: 'holiday', label: t('calHolidays'), color: 'hsl(var(--chart-2))' },
  ];

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        sheet={false}
        onKeyDown={onKeyDown}
        onEscapeKeyDown={(e) => { if (composer) { e.preventDefault(); setComposer(null); } }}
        dir={isRTL ? 'rtl' : 'ltr'}
        className="flex h-[calc(100dvh-var(--header-total)-1rem-var(--safe-top)-env(safe-area-inset-bottom))] w-[calc(100vw-1rem)] max-w-[1400px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:h-[min(92dvh,980px)] sm:rounded-3xl"
      >
        <DialogTitle className="sr-only">{t('calendar')}</DialogTitle>
        <DialogDescription className="sr-only">{t('calendarDescription')}</DialogDescription>

        {isRefreshing && <div className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-primary" role="progressbar" aria-label={t('refresh')} />}

        {!isAuthenticated ? (
          <ConnectScreen t={t} onConnect={handleGoogleAuth} />
        ) : (
          <>
            {/* Toolbar */}
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-3 py-3 pe-12 sm:px-5 sm:pe-14">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 max-sm:w-full">
                <button
                  type="button"
                  onClick={goToday}
                  className="h-9 rounded-xl border border-input px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('today')}
                </button>
                <button type="button" onClick={() => step(-1)} aria-label={t('calPrev')} className={iconBtn}><Prev className="h-4 w-4" /></button>
                <button type="button" onClick={() => step(1)} aria-label={t('calNext')} className={iconBtn}><Next className="h-4 w-4" /></button>
                <h2 key={`${view}-${title.main}`} aria-live="polite" className="ms-1 min-w-0 truncate max-sm:order-first max-sm:basis-full max-sm:ms-0 text-lg font-bold capitalize tracking-tight text-foreground animate-in fade-in-0 duration-200 sm:text-xl">
                  {title.main} <span className="font-normal text-muted-foreground">{title.sub}</span>
                </h2>
              </div>

              <div className="flex items-center gap-1.5 max-sm:w-full sm:ms-auto">
                <div role="tablist" aria-label={t('calView')} className="relative grid grid-cols-3 rounded-xl bg-foreground/[0.06] p-1 max-sm:flex-1">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-popover shadow-sm ring-1 ring-border/60 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                    style={{ transform: `translateX(${(isRTL ? -1 : 1) * VIEWS.indexOf(view) * 100}%)` }}
                  />
                  {VIEWS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        'relative z-10 h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        view === v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {viewLabels[v]}
                    </button>
                  ))}
                </div>

                <button type="button" onClick={() => fetchAll(currentDate)} disabled={isRefreshing} aria-label={t('refresh')} title={t('refresh')} className={iconBtn}>
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </button>
                <button type="button" onClick={disconnect} aria-label={t('disconnect')} title={t('disconnect')} className={cn(iconBtn, 'hover:text-danger')}>
                  <LogOut className="h-4 w-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => openNew()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--glow)/0.55)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('newEvent')}</span>
                  <span className="sr-only sm:hidden">{t('newEvent')}</span>
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              {/* Side panel (desktop) */}
              <aside className="hidden w-[19rem] shrink-0 space-y-6 overflow-y-auto border-e border-border/60 p-5 lg:block">
                <MiniMonth
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  dayMap={dayMap}
                  locale={locale}
                  weekStartsOn={weekStartsOn}
                  isRTL={isRTL}
                  t={t}
                  onPick={(d) => { if (view === 'month') selectDay(d); else goTo(d); }}
                />

                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />{t('calLayers')}
                  </p>
                  <div className="space-y-0.5">
                    {layerDefs.map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        role="switch"
                        aria-checked={layers[l.key]}
                        onClick={() => toggleLayer(l.key)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className="grid h-4 w-4 place-items-center rounded-[5px] border-2 transition-colors"
                          style={{ borderColor: l.color, background: layers[l.key] ? l.color : 'transparent' }}
                        >
                          {layers[l.key] && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className={cn(!layers[l.key] && 'text-muted-foreground')}>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <AgendaPanel
                  date={selectedDate}
                  items={selectedItems}
                  lang={language}
                  locale={locale}
                  t={t}
                  onOpen={openItem}
                  onToggleTask={toggleTask}
                  onNew={() => openNew()}
                />

                {view !== 'month' && (
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{t('calDragHint')}
                  </p>
                )}
              </aside>

              {/* Main view */}
              <main className="min-h-0 min-w-0 flex-1">
                <div key={view} className="h-full animate-in fade-in-0 duration-200">
                  {view === 'month' ? (
                    <div className="h-full overflow-y-auto p-3 sm:p-5 lg:overflow-hidden">
                      <div className="lg:h-full">
                        <MonthGrid
                          days={monthDays}
                          currentDate={currentDate}
                          selectedDate={selectedDate}
                          dayMap={dayMap}
                          lang={language}
                          locale={locale}
                          t={t}
                          onSelect={selectDay}
                          onOpen={openItem}
                          onOpenDay={openDay}
                        />
                      </div>
                      <AgendaPanel
                        className="mt-5 lg:hidden"
                        date={selectedDate}
                        items={selectedItems}
                        lang={language}
                        locale={locale}
                        t={t}
                        onOpen={openItem}
                        onToggleTask={toggleTask}
                        onNew={() => openNew()}
                      />
                    </div>
                  ) : (
                    <TimeGrid
                      days={view === 'week' ? weekDays : [currentDate]}
                      dayMap={dayMap}
                      lang={language}
                      locale={locale}
                      t={t}
                      onCreate={openNew}
                      onOpen={openItem}
                      onToggleTask={toggleTask}
                      onCommit={commitTime}
                      onDayClick={view === 'week' ? openDay : undefined}
                    />
                  )}
                </div>
              </main>
            </div>

            {composer && (
              <EventComposer
                key={composer.item?.id || `new-${composer.start?.getTime()}`}
                request={composer}
                onClose={() => setComposer(null)}
                onSave={saveForm}
                onDelete={deleteItem}
                onToggleTask={toggleTask}
                saving={saving}
                t={t}
                lang={language}
                locale={locale}
                isRTL={isRTL}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
