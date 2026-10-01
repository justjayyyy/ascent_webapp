import { useEffect, useRef, useState, createElement, Fragment } from 'react';

export const NOTE_COLORS = ['default', 'coral', 'amber', 'sun', 'sage', 'teal', 'sky', 'violet', 'rose', 'stone'];

// Hue of each palette key, used to map notes saved with the old free-form hex colours
const KEY_HUES = { coral: 8, amber: 36, sun: 52, sage: 140, teal: 176, sky: 205, violet: 262, rose: 332 };

function hexToHue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return null; // grey
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Palette key for whatever colour a note has stored (keys pass through, legacy hex is mapped). */
export function resolveColor(color) {
  if (!color || color === 'default') return 'default';
  if (NOTE_COLORS.includes(color)) return color;
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    if (color.toLowerCase() === '#5c8374') return 'default'; // the old default swatch
    const hue = hexToHue(color);
    if (hue === null) return 'stone';
    let best = 'coral', bestDist = 361;
    for (const [key, h] of Object.entries(KEY_HUES)) {
      const dist = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
      if (dist < bestDist) { best = key; bestDist = dist; }
    }
    return best;
  }
  return 'default';
}

/** A valid MongoDB ObjectId made on the client, so a note keeps one id from offline creation to sync. */
export function newNoteId() {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  let rand = '';
  const bytes = new Uint8Array(8);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  bytes.forEach(b => { rand += b.toString(16).padStart(2, '0'); });
  return time + rand;
}

export function newItemId() {
  return Math.random().toString(36).slice(2, 10);
}

export const blankItem = () => ({ id: newItemId(), text: '', done: false });

/** Plain text of a note, for search, copying and the share sheet. */
export function noteToText(note, { withTitle = true } = {}) {
  const parts = [];
  if (withTitle && note.title) parts.push(note.title);
  if (note.type === 'checklist') {
    (note.items || []).forEach(it => it.text && parts.push(`${it.done ? '[x]' : '[ ]'} ${it.text}`));
  } else if (note.content) {
    parts.push(note.content);
  }
  return parts.join('\n');
}

export function searchableText(note) {
  const items = note.type === 'checklist' ? (note.items || []).map(i => i.text).join(' ') : '';
  return `${note.title || ''} ${note.content || ''} ${items} ${(note.tags || []).join(' ')}`.toLowerCase();
}

/** Turn "a\nb" lines into checklist items, and back. */
export function textToItems(text) {
  const lines = (text || '').split('\n').map(l => l.replace(/^\s*(?:[-*•]\s+|\[[ xX]\]\s*)/, '').trim()).filter(Boolean);
  return lines.length ? lines.map(line => ({ id: newItemId(), text: line, done: false })) : [blankItem()];
}

export function itemsToText(items) {
  return (items || []).map(i => i.text).filter(Boolean).join('\n');
}

export const isEmptyNote = (n) =>
  !n.title?.trim() &&
  (n.type === 'checklist' ? !(n.items || []).some(i => i.text.trim()) : !n.content?.trim());

/** Rough height of a card, so short and tall notes balance across the masonry columns. */
function estimateHeight(note, previewItems = 6) {
  let h = 56 + (note.title ? 26 : 0);
  if (note.type === 'checklist') {
    h += Math.min((note.items || []).length, previewItems) * 26 + 10;
  } else {
    const text = note.content || '';
    const lines = Math.min(text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 34)), 0), 10);
    h += lines * 21;
  }
  if (note.tags?.length) h += 30;
  return h;
}

/** Deal notes into `count` columns, always into the shortest one, keeping the given order. */
export function distribute(notes, count) {
  const cols = Array.from({ length: count }, () => ({ h: 0, items: [] }));
  notes.forEach(note => {
    const col = cols.reduce((a, b) => (b.h < a.h ? b : a));
    col.items.push(note);
    col.h += estimateHeight(note) + 12;
  });
  return cols.map(c => c.items);
}

/** Number of masonry columns that fit the container. */
export function useColumnCount(ref, listView) {
  const [count, setCount] = useState(2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth;
      const min = w < 600 ? 160 : 236;
      setCount(listView ? 1 : Math.max(1, Math.min(6, Math.floor((w + 12) / (min + 12)))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, listView]);
  return count;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** Wrap matches of `query` in <mark> (react nodes). */
export function highlight(text, query) {
  const q = query?.trim();
  if (!q || !text) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out = [];
  let from = 0;
  let idx = lower.indexOf(needle, from);
  if (idx === -1) return text;
  let key = 0;
  while (idx !== -1) {
    if (idx > from) out.push(text.slice(from, idx));
    out.push(createElement('mark', { key: key++, className: 'note-mark' }, text.slice(idx, idx + needle.length)));
    from = idx + needle.length;
    idx = lower.indexOf(needle, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return createElement(Fragment, null, ...out);
}

export function timeAgo(date, language) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language || 'en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return d.toLocaleDateString(language || 'en', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export const fmt = (template, vars = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

// ---- attachments ----

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FILES = 10;
const PREVIEWABLE = /^image\/(png|jpe?g|gif|webp|avif)$/;

export const isPreviewable = (type) => PREVIEWABLE.test(type || '');

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/** Shrink big photos so a phone snapshot fits under the upload limit. */
async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

/** File -> { name, type, size, data } ready for the API, or throws 'too-large'. */
export async function prepareUpload(file) {
  let blob = file;
  let name = file.name || 'file';
  let type = file.type || 'application/octet-stream';
  if (/^image\/(png|jpe?g|webp|heic|heif)$/i.test(type) && (file.size > 900 * 1024 || /heic|heif/i.test(type))) {
    try {
      const shrunk = await downscale(file);
      if (shrunk && shrunk.size < file.size) {
        blob = shrunk;
        type = 'image/jpeg';
        name = name.replace(/\.[^.]+$/, '') + '.jpg';
      }
    } catch { /* keep the original */ }
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error('too-large');
  return { name, type, size: blob.size, data: await toBase64(blob) };
}

export function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

// ---- reminders ----

/** Quick reminder times, always in the future. */
export function reminderPresets(now = new Date()) {
  const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const list = [];
  const laterToday = at(now, 18);
  if (laterToday.getTime() - now.getTime() > 30 * 60 * 1000) list.push({ key: 'later', date: laterToday });
  const tomorrow = at(new Date(now.getTime() + 86400000), 8);
  list.push({ key: 'tomorrow', date: tomorrow });
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  list.push({ key: 'nextWeek', date: at(nextWeek, 8) });
  return list;
}

/** <input type="datetime-local"> value for a Date, in local time. */
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatReminder(iso, language) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(language || 'en', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  if (tomorrow) {
    const word = new Intl.RelativeTimeFormat(language || 'en', { numeric: 'auto' }).format(1, 'day');
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}, ${time}`;
  }
  return `${d.toLocaleDateString(language || 'en', { month: 'short', day: 'numeric' })}, ${time}`;
}

export const isOverdue = (iso) => !!iso && new Date(iso).getTime() <= Date.now();

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

// `start` moved `months` months on, keeping its day of the month where that month has it and
// using the month's last day where it does not (the 31st, 29 February). Never drifts: always counted
// from the original date, so a reminder on the 31st is back on the 31st in months that have one.
function addMonthsClamped(start, months) {
  const d = new Date(start);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** The next time a repeating reminder is due after `after` (default now), or null. */
export function nextOccurrence(iso, repeat, after = Date.now()) {
  if (!iso || !repeat || repeat === 'none') return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  const step = { daily: (n) => { const d = new Date(start); d.setDate(d.getDate() + n); return d; },
    weekly: (n) => { const d = new Date(start); d.setDate(d.getDate() + 7 * n); return d; },
    monthly: (n) => addMonthsClamped(start, n),
    yearly: (n) => addMonthsClamped(start, 12 * n) }[repeat];
  if (!step) return null;
  let d = start;
  for (let n = 1; d.getTime() <= after && n < 5000; n += 1) d = step(n);
  return d.toISOString();
}

// ---- links ----

const URL_RE = /\bhttps?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/gi;
const WWW_RE = /(^|\s)(www\.[^\s<>"'()]+[^\s<>"'().,;:!?])/gi;

/** Web links in a note's text and list items, de-duplicated, in order. */
export function extractLinks(note) {
  const text = [note.title, note.content, ...(note.items || []).map(i => i.text)].filter(Boolean).join('\n');
  const found = [];
  (text.match(URL_RE) || []).forEach(u => found.push(u));
  let m;
  WWW_RE.lastIndex = 0;
  while ((m = WWW_RE.exec(text))) found.push(`https://${m[2]}`);
  const seen = new Set();
  return found.filter(u => {
    const k = u.toLowerCase().replace(/\/$/, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 5);
}

export function linkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ---- search filters (Keep's "types" and colours) ----

export const NOTE_FILTERS = ['lists', 'images', 'links', 'reminders', 'files'];

export function matchesFilter(note, filter) {
  if (!filter) return true;
  if (filter === 'lists') return note.type === 'checklist';
  if (filter === 'images') return (note.attachments || []).some(a => isPreviewable(a.type));
  if (filter === 'files') return (note.attachments || []).some(a => !isPreviewable(a.type));
  if (filter === 'links') return extractLinks(note).length > 0;
  if (filter === 'reminders') return !!note.reminder;
  return true;
}
