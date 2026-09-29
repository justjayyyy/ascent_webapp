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
