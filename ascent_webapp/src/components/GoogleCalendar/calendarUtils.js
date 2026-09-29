import { parseISO, startOfDay, addDays, format, isBefore } from 'date-fns';
import { enUS, he, ru } from 'date-fns/locale';

export const LOCALES = { en: enUS, he, ru };
export const weekStartsOnFor = (lang) => (lang === 'ru' ? 1 : 0);

export const HOUR_HEIGHT = 56; // px per hour in the time grid
export const SNAP_MINUTES = 15;

// Google's event palette (colorId -> hex). These are the user's own calendar colours, i.e. data.
export const GOOGLE_EVENT_COLORS = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73', '5': '#F6BF26', '6': '#F4511E',
  '7': '#039BE5', '8': '#616161', '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

export const dayKey = (d) => format(d, 'yyyy-MM-dd');

export const fmtClock = (d, lang) => format(d, lang === 'en' ? 'h:mm a' : 'HH:mm');
/** Compact time for tight chips: no am/pm marker. */
export const fmtClockShort = (d, lang) => format(d, lang === 'en' ? 'h:mm' : 'HH:mm');
export const fmtHourLabel = (hour, lang) => {
  const d = new Date(2000, 0, 1, hour);
  return format(d, lang === 'en' ? 'h a' : 'HH:mm');
};

/** Google Tasks due dates are UTC midnight; read only the date part so timezones can't shift the day. */
const dateOnly = (s) => parseISO(String(s).slice(0, 10));

/** Convert a raw Google event / task into one shape the views can share. */
export function normalizeItem(raw, kind, colorMap = {}) {
  if (kind === 'task') {
    if (!raw.due) return null;
    const start = dateOnly(raw.due);
    return {
      id: `task:${raw.id}`, raw, kind, title: raw.title || '', notes: raw.notes || '',
      allDay: true, start, end: start, lastDay: start, done: raw.status === 'completed',
      color: 'hsl(var(--chart-4))', editable: false,
    };
  }
  if (!raw.start) return null;
  const isHoliday = kind === 'holiday';
  if (raw.start.date) {
    const start = parseISO(raw.start.date);
    const endExclusive = raw.end?.date ? parseISO(raw.end.date) : addDays(start, 1);
    const lastDay = isBefore(start, endExclusive) ? addDays(endExclusive, -1) : start;
    return {
      id: raw.id, raw, kind, title: raw.summary || '', notes: raw.description || '', location: raw.location || '',
      allDay: true, start, end: endExclusive, lastDay, colorId: raw.colorId,
      color: isHoliday ? 'hsl(var(--chart-2))' : (colorMap[raw.colorId] || GOOGLE_EVENT_COLORS[raw.colorId] || 'hsl(var(--primary))'),
      editable: !isHoliday,
    };
  }
  if (!raw.start.dateTime) return null;
  const start = parseISO(raw.start.dateTime);
  const end = raw.end?.dateTime ? parseISO(raw.end.dateTime) : new Date(+start + 60 * 60000);
  return {
    id: raw.id, raw, kind, title: raw.summary || '', notes: raw.description || '', location: raw.location || '',
    allDay: false, start, end, lastDay: startOfDay(start), colorId: raw.colorId,
    color: colorMap[raw.colorId] || GOOGLE_EVENT_COLORS[raw.colorId] || 'hsl(var(--primary))',
    editable: true,
  };
}

/** Map of 'yyyy-MM-dd' -> items (multi-day all-day items appear on every day they cover). */
export function buildDayMap(items) {
  const map = new Map();
  const push = (key, item) => {
    const list = map.get(key);
    if (list) list.push(item); else map.set(key, [item]);
  };
  for (const item of items) {
    if (!item.allDay) { push(dayKey(item.start), item); continue; }
    let d = startOfDay(item.start);
    for (let i = 0; i < 62 && !isBefore(item.lastDay, d); i++) {
      push(dayKey(d), item);
      d = addDays(d, 1);
    }
  }
  const order = { holiday: 0, event: 1, task: 2 };
  for (const list of map.values()) {
    list.sort((a, b) => (b.allDay - a.allDay) || (order[a.kind] - order[b.kind]) || (a.start - b.start));
  }
  return map;
}

/** Tinted surface + colour bar for an item; works on any palette because it mixes into --card. */
export function chipStyle(color, strength = 22) {
  return {
    '--ev': color,
    background: `color-mix(in srgb, var(--ev) ${strength}%, hsl(var(--card)))`,
    borderInlineStart: '3px solid var(--ev)',
  };
}

/** Column layout for overlapping timed events on one day. */
export function layoutTimed(items) {
  const sorted = [...items].sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = [];
    for (const c of cluster) {
      let i = cols.findIndex((end) => end <= c.s);
      if (i < 0) { i = cols.length; cols.push(0); }
      cols[i] = c.e;
      c.col = i;
    }
    for (const c of cluster) out.push({ item: c.item, col: c.col, cols: cols.length });
    cluster = [];
  };
  for (const item of sorted) {
    const s = +item.start;
    const e = Math.max(+item.end, s + SNAP_MINUTES * 60000);
    if (cluster.length && s >= clusterEnd) { flush(); clusterEnd = 0; }
    cluster.push({ item, s, e, col: 0 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

export const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
