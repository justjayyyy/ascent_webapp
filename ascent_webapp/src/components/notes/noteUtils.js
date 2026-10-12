import { useEffect, useRef, useState, createElement, Fragment } from 'react';
import { isRich, plainText, sliceRich } from './richText';

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

export const blankItem = (kind) => ({ id: newItemId(), text: '', done: false, ...(kind && kind !== 'item' ? { kind } : {}) });

// A checklist line is a tickable item unless it is one of these, placed between the items: plain text, a title,
// a numbered line, a highlighted box or a picture (one of the note's files, by fileId, with its caption as text)
export const LINE_KINDS = ['text', 'title', 'number', 'callout', 'image'];
export const lineKind = (item) => (LINE_KINDS.includes(item?.kind) ? item.kind : 'item');
export const isTickable = (item) => lineKind(item) === 'item';
export const isTicked = (item) => isTickable(item) && !!item.done;
// Items, text and numbered lines can carry an amount, shown on the side and added up under a run of them
export const canHaveAmount = (item) => ['item', 'text', 'number'].includes(lineKind(item));
export const hasAmount = (item) => canHaveAmount(item) && typeof item.amount === 'number' && Number.isFinite(item.amount);
// Text with nothing on its side: in continuous text it runs on, and text blocks next to each other are one text
export const isPlainText = (item) => lineKind(item) === 'text' && !hasAmount(item);

/** Lines with the text blocks that come together made one text, a line apart (as continuous text keeps them). */
export function joinTextBlocks(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && isPlainText(prev) && isPlainText(line) && prev.text && line.text) {
      out[out.length - 1] = { ...prev, text: `${prev.text}\n${line.text}` };
    } else out.push(line);
  }
  return out;
}

// A note is continuous text (plain, or with titles, pictures and boxes in it: a checklist with `flow`) or a list
export const noteForm = (note) => (note?.type === 'checklist' && !note.flow ? 'checklist' : 'text');

/**
 * What a continuous-text note saves for its blocks: plain text while it is one block of text, its lines
 * once it has more. Only what changed from `note` is returned.
 */
export function flowChanges(note, blocks) {
  const only = !blocks.length ? { text: '' } : blocks.length === 1 && isPlainText(blocks[0]) ? blocks[0] : null;
  if (only) return note.type === 'text' ? { content: only.text } : { type: 'text', flow: false, content: only.text, items: [] };
  return note.type === 'text' ? { type: 'checklist', flow: true, content: '', items: blocks } : { items: blocks };
}

/** What changes when a note is made continuous text or a list. A list made continuous text keeps its lines. */
export function formChanges(note, to) {
  if (to === noteForm(note)) return null;
  if (to === 'checklist') {
    return note.type === 'checklist' ? { flow: false } : { type: 'checklist', flow: false, items: textToItems(note.content) };
  }
  const kept = (note.items || []).filter(i => plainText(i.text).trim() || lineKind(i) === 'image' || hasAmount(i));
  return { flow: true, ...flowChanges({ ...note, type: 'checklist' }, kept) };
}

/** The blocks a continuous-text note is edited as: its lines (text that comes together as one), or its text as one block (`textId`). */
export const flowBlocks = (note, textId) => (note.type === 'checklist' && note.items?.length
  ? joinTextBlocks(note.items)
  : [{ id: textId, kind: 'text', text: note.type === 'checklist' ? '' : note.content || '', done: false }]);

const LOCALES = { he: 'he-IL', ru: 'ru-RU', en: 'en-US' };

/** "₪8,000" in the reader's language; an amount with no currency is a plain number. */
export function formatAmount(amount, currency, language) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(LOCALES[language] || language || 'en-US', {
      ...(currency ? { style: 'currency', currency } : {}), minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

const amountText = (it) => (hasAmount(it) ? ` · ${formatAmount(it.amount, it.currency)}` : '');

const CURRENCY_SIGNS = [
  ['ש"ח', 'ILS'], ['ש״ח', 'ILS'], ['NIS', 'ILS'], ['ILS', 'ILS'], ['₪', 'ILS'],
  ['USD', 'USD'], ['$', 'USD'], ['EUR', 'EUR'], ['€', 'EUR'], ['GBP', 'GBP'], ['£', 'GBP'],
  ['руб.', 'RUB'], ['руб', 'RUB'], ['RUB', 'RUB'], ['₽', 'RUB'],
];
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;

/** "₪8,000", "8,000 ש"ח", "12.50" -> { amount, currency }, or null when the text is anything more than an amount. */
export function parseAmount(raw) {
  let s = String(raw ?? '').replace(BIDI_MARKS, '').trim();
  let currency = null;
  for (const [sign, code] of CURRENCY_SIGNS) {
    if (s.startsWith(sign)) { currency = code; s = s.slice(sign.length).trim(); break; }
    if (s.endsWith(sign)) { currency = code; s = s.slice(0, -sign.length).trim(); break; }
  }
  if (!/^-?\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?$|^-?\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
  const amount = /^-?\d+,\d{1,2}$/.test(s) ? Number(s.replace(',', '.')) : Number(s.replace(/[,\u00a0\u202f ]/g, ''));
  return Number.isFinite(amount) ? { amount, currency } : null;
}

/** Plain text of a note (its formatting left out), for search, copying and the share sheet. */
export function noteToText(note, { withTitle = true } = {}) {
  const parts = [];
  if (withTitle && note.title) parts.push(note.title);
  if (note.type === 'checklist') {
    let n = 0;
    (note.items || []).forEach((it) => {
      const kind = lineKind(it);
      n = kind === 'number' ? n + 1 : 0;
      const text = plainText(it.text);
      if (!text || kind === 'image') return;
      if (kind === 'item') parts.push(`${it.done ? '[x]' : '[ ]'} ${text}${amountText(it)}`);
      else if (kind === 'number') parts.push(`${n}. ${text}${amountText(it)}`);
      else parts.push(`${text}${amountText(it)}`);
    });
  } else if (note.content) {
    parts.push(plainText(note.content));
  }
  return parts.join('\n');
}

export function searchableText(note) {
  const items = note.type === 'checklist' ? (note.items || []).map(i => plainText(i.text)).join(' ') : '';
  return `${note.title || ''} ${plainText(note.content)} ${items} ${(note.tags || []).join(' ')}`.toLowerCase();
}

// How a line of copied text says what it is: "# " a title, a box (ticked or not) or a bullet an item
const TITLE_MARK = /^#{1,6}\s+/;
const DONE_MARK = /^(?:[-*•]\s*)?(?:\[[xX✓✔]\]|[☑☒✓✔✅])\s*/;
const BOX_MARK = /^(?:[-*•]\s*)?(?:\[\s?\]|[□☐▢❏❑])\s*/;
const BULLET_MARK = /^[-*•·]\s+/;
const CALLOUT_MARK = /^>\s?/;
const NUMBER_MARK = /^\d{1,3}[.)]\s+/;
const RULE = /^[-_=*]{3,}$/;
const MARKS = [[TITLE_MARK, 'title'], [DONE_MARK, 'done'], [BOX_MARK, 'box'], [BULLET_MARK, 'box'], [CALLOUT_MARK, 'callout']];

// "Hall\t73,440": an amount in the last column, as a spreadsheet copies its rows
function splitAmount(s) {
  const tab = s.lastIndexOf('\t');
  const money = tab > 0 ? parseAmount(s.slice(tab + 1)) : null;
  const text = money && s.slice(0, tab).split('\t').map(c => c.trim()).filter(Boolean).join(' · ');
  return text ? { text, amount: money.amount, ...(money.currency ? { currency: money.currency } : {}) } : null;
}

// Lines of text, each keeping the formatting it has
function splitLines(text) {
  if (!isRich(text)) return text.split('\n');
  const plain = plainText(text);
  const out = [];
  let from = 0;
  for (let at = plain.indexOf('\n'); at >= 0; at = plain.indexOf('\n', from)) {
    out.push(sliceRich(text, from, at));
    from = at + 1;
  }
  out.push(sliceRich(text, from));
  return out;
}

/**
 * Copied text as checklist lines. Where the text marks its tasks (boxes or bullets), the lines
 * without a mark are text between them and a wrapped line carries on the line above it; plain
 * lines with no marks anywhere are all items, like Keep. "# " is a title, "> " a highlighted box,
 * "1. " a numbered line in a document that has titles, boxes or tasks, and a last column holding
 * an amount (as copied from a spreadsheet) goes on the side.
 */
export function parseLines(text) {
  const lines = [];
  let pending = null; // a box on a line of its own, as PDFs copy them, belongs to the next line
  for (const raw of splitLines(String(text || '').replace(/\r\n?/g, '\n'))) {
    let s = raw.trim();
    if (!s || RULE.test(s)) { lines.push(null); continue; }
    let mark = null;
    for (const [re, m] of MARKS) {
      if (re.test(s)) { mark = m; s = s.replace(re, '').trim(); break; }
    }
    if (!s) { if (mark === 'box' || mark === 'done') pending = mark; continue; }
    const money = mark === 'title' || mark === 'callout' ? null : splitAmount(s);
    lines.push({ ...(money || { text: s }), mark: mark || pending });
    pending = null;
  }
  const marked = lines.some(l => l && (l.mark === 'box' || l.mark === 'done'));
  const doc = marked || lines.some(l => l && (l.mark === 'title' || l.mark === 'callout'));
  const out = [];
  let last = null; // the line a wrapped one carries on, until a blank line
  for (const l of lines) {
    if (!l) { last = null; continue; }
    const { mark, text: lineText, ...money } = l;
    if (mark === 'title') { out.push({ text: lineText, kind: 'title', done: false }); last = null; continue; }
    if (mark === 'callout') {
      if (last?.kind === 'callout') last.text = `${last.text}\n${lineText}`;
      else { last = { text: lineText, kind: 'callout', done: false }; out.push(last); }
      continue;
    }
    if (!mark && doc && NUMBER_MARK.test(lineText)) {
      last = { text: lineText.replace(NUMBER_MARK, ''), kind: 'number', done: false, ...money };
      out.push(last);
      continue;
    }
    const wraps = !('amount' in money);
    // The lines right under a numbered entry are its details
    if (!mark && wraps && last?.kind === 'number') { last.text = `${last.text}\n${lineText}`; continue; }
    if (mark || !marked) { last = { text: lineText, done: mark === 'done', ...money }; out.push(last); continue; }
    if (wraps && last && !last.kind) { last.text = `${last.text} ${lineText}`; continue; }
    if (wraps && (last?.kind === 'text' || last?.kind === 'number')) { last.text = `${last.text}\n${lineText}`; continue; }
    last = { text: lineText, kind: 'text', done: false, ...money };
    out.push(last);
  }
  return out;
}

/** Turn "a\nb" lines into checklist items. */
export function textToItems(text) {
  const lines = parseLines(text);
  return lines.length ? lines.map(line => ({ id: newItemId(), ...line })) : [blankItem()];
}

export const isEmptyNote = (n) =>
  !n.title?.trim() &&
  (n.type === 'checklist' ? !(n.items || []).some(i => plainText(i.text).trim() || i.kind === 'image' || hasAmount(i)) : !plainText(n.content).trim());

/**
 * Deal notes into `count` columns in reading order: the first across the top, then the next row, and so on. Every
 * note keeps its own height; a note's place in the order says which column and row it is in, so moving it puts it
 * where it was dropped.
 */
export function distribute(notes, count) {
  const cols = Array.from({ length: count }, () => []);
  notes.forEach((note, i) => cols[i % count].push(note));
  return cols;
}

/**
 * Where a note dropped under column `col` goes among the `others` (how many notes there are besides it): the last
 * place in that column, so it ends up at the bottom of the column it was dropped in.
 */
export function columnEndIndex(others, count, col) {
  if (col > others) return others;
  return others - ((others - col) % count);
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

// The first letter decides which way a piece of text runs, so a Hebrew note reads right to left
// in an English app and the other way round. No letters yet: follow the page.
const span = (from, to) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
const RTL_RANGES = span(0x0590, 0x08ff) + span(0xfb1d, 0xfdff) + span(0xfe70, 0xfefc); // Hebrew, Arabic and their forms
const RTL_LETTER = new RegExp(`[${RTL_RANGES}]`);
const STRONG_LETTER = new RegExp(`[A-Za-z${span(0x00c0, 0x024f)}${span(0x0370, 0x04ff)}${RTL_RANGES}]`); // plus Latin, Greek, Cyrillic
export function textDir(text) {
  const first = plainText(text).match(STRONG_LETTER);
  if (!first) return undefined;
  return RTL_LETTER.test(first[0]) ? 'rtl' : 'ltr';
}

/** Who made the latest change to a note: a workspace person, a stand-in from the email, or nobody known. */
export function lastEditor(note, people) {
  const email = note.updatedByEmail?.toLowerCase();
  const byId = note.updatedBy ? people.byId[note.updatedBy] : null;
  if (byId) return byId;
  if (!email) return null;
  const known = people.list.find(p => p.email?.toLowerCase() === email);
  if (known) return known;
  const name = email.split('@')[0] || email;
  const isMe = email === people.me?.email || (!!note.updatedBy && note.updatedBy === people.me?.id);
  return { id: null, email, name, initials: name.slice(0, 2).toUpperCase(), isMe, color: 'hsl(var(--muted-foreground))' };
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
  const text = [note.title, note.content, ...(note.items || []).map(i => i.text)].filter(Boolean).map(plainText).join('\n');
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
  if (filter === 'lists') return noteForm(note) === 'checklist';
  if (filter === 'images') return (note.attachments || []).some(a => isPreviewable(a.type));
  if (filter === 'files') return (note.attachments || []).some(a => !isPreviewable(a.type));
  if (filter === 'links') return extractLinks(note).length > 0;
  if (filter === 'reminders') return !!note.reminder;
  return true;
}

// ---- organising the notes: how they are sorted, and the headed groups they are shown in ----
// The first of each is the default
export const NOTE_SORTS = ['updated', 'created', 'title', 'manual'];
export const NOTE_GROUPS = ['folder', 'label', 'date', 'color', 'type', 'none'];

const titleOf = (note) => (note.title?.trim() || noteToText(note, { withTitle: false }).trim()).split('\n')[0].trim();

const hasPosition = (n) => typeof n.position === 'number' && Number.isFinite(n.position);

/**
 * The notes in the chosen order: last edited or created first, by title (notes with no words at all last), or in
 * the person's own order ('manual': by `position`; notes never placed, such as new ones, go first, newest on top).
 * `placeOf` gives the note's dates and pin as they are laid out (an open note keeps its place until it is closed).
 */
export function sortNotes(notes, sort, { language, placeOf = (n) => n } = {}) {
  const collator = new Intl.Collator(language || 'en', { sensitivity: 'base', numeric: true });
  const field = sort === 'created' ? 'created_date' : 'updated_date';
  const time = (n) => new Date(placeOf(n)[field] || n.created_date || 0).getTime() || 0;
  return [...notes].sort((x, y) => {
    const a = placeOf(x);
    const b = placeOf(y);
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    if (sort === 'manual') {
      if (hasPosition(x) !== hasPosition(y)) return hasPosition(x) ? 1 : -1;
      if (hasPosition(x) && x.position !== y.position) return x.position - y.position;
    }
    if (sort === 'title') {
      const ta = titleOf(x), tb = titleOf(y);
      if (!ta !== !tb) return ta ? -1 : 1;
      const byTitle = collator.compare(ta, tb);
      if (byTitle) return byTitle;
    }
    return time(y) - time(x);
  });
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which part of the calendar a date falls in, seen from `now`: today, yesterday, the past week, this month, or its month. */
export function dateBucket(date, now = new Date()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return { key: 'older', rank: Number.MAX_SAFE_INTEGER };
  const today = startOfDay(now);
  const day = startOfDay(d);
  const DAY = 86400000;
  if (day >= today) return { key: 'today', rank: 0 };
  if (day >= today - DAY) return { key: 'yesterday', rank: 1 };
  if (day >= today - 6 * DAY) return { key: 'week', rank: 2 };
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return { key: 'month', rank: 3 };
  // Older notes: one group a month, the latest first
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  return { key: `m-${d.getFullYear()}-${d.getMonth()}`, rank: 3 + months, year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Sorted notes in headed groups, in the order the groups are shown; inside a group the notes keep their order.
 * Each group is { key, kind, notes } and, by kind: a date bucket (`bucket`), a label (`label`, null for none),
 * a colour (`color`) or a note type (`type`). A note with several labels goes under the first of them by name;
 * `skipLabel` (the label being looked at) is left out of that choice.
 */
export function groupNotes(notes, group, { language, sort, now = new Date(), placeOf = (n) => n, skipLabel = '' } = {}) {
  if (!group || group === 'none') return [{ key: 'all', kind: 'none', notes }];
  const collator = new Intl.Collator(language || 'en', { sensitivity: 'base', numeric: true });
  const groups = new Map();
  const add = (key, make, note) => {
    if (!groups.has(key)) groups.set(key, { key, notes: [], ...make() });
    groups.get(key).notes.push(note);
  };
  const skip = skipLabel.toLowerCase();
  notes.forEach(n => {
    if (group === 'date') {
      const p = placeOf(n);
      const bucket = dateBucket(sort === 'created' ? n.created_date : p.updated_date, now);
      add(`date-${bucket.key}`, () => ({ kind: 'date', bucket, rank: bucket.rank }), n);
    } else if (group === 'folder') {
      const folder = n.folder?.trim() || null;
      add(folder ? `folder-${folder.toLowerCase()}` : 'folder-none', () => ({ kind: 'folder', folder }), n);
    } else if (group === 'label') {
      const tags = (n.tags || []).filter(tag => tag.toLowerCase() !== skip).sort(collator.compare);
      const tag = tags[0] || null;
      add(tag ? `label-${tag.toLowerCase()}` : 'label-none', () => ({ kind: 'label', label: tag }), n);
    } else if (group === 'color') {
      const color = resolveColor(n.color);
      // The palette's order, plain notes last
      const rank = color === 'default' ? NOTE_COLORS.length : NOTE_COLORS.indexOf(color);
      add(`color-${color}`, () => ({ kind: 'color', color, rank }), n);
    } else {
      const type = noteForm(n);
      add(`type-${type}`, () => ({ kind: 'type', type, rank: type === 'checklist' ? 0 : 1 }), n);
    }
  });
  const list = [...groups.values()];
  if (group === 'label' || group === 'folder') {
    const name = (g) => g.label ?? g.folder;
    return list.sort((a, b) => (!name(a) !== !name(b) ? (name(a) ? -1 : 1) : collator.compare(name(a) || '', name(b) || '')));
  }
  return list.sort((a, b) => a.rank - b.rank);
}

const STEP = 1024;

/**
 * The positions to save when note `id` is dragged to `toIndex` in `list` (shown in the person's own order).
 * Only the dragged note moves when its new neighbours are both placed; notes never placed above where it lands
 * (the newest ones, at the top) are placed then too, so the order holds. Returns [[id, position], ...].
 */
export function reorderPositions(list, id, toIndex) {
  const moving = list.find(n => n.id === id);
  if (!moving) return [];
  const rest = list.filter(n => n.id !== id);
  const to = Math.max(0, Math.min(toIndex, rest.length));
  const next = [...rest.slice(0, to), moving, ...rest.slice(to)];
  // Everything from the top to the dragged note, and on to the last note still without a place, gets one
  let last = to;
  next.forEach((n, i) => { if (n !== moving && !hasPosition(n)) last = Math.max(last, i); });
  const placedAfter = next.slice(last + 1).find(hasPosition);
  const needsAll = next.slice(0, last + 1).some(n => n !== moving && !hasPosition(n));
  if (!needsAll) {
    const before = next[to - 1];
    const after = next[to + 1];
    let position;
    if (before && after) position = (before.position + after.position) / 2;
    else if (before) position = before.position + STEP;
    else if (after) position = after.position - STEP;
    else position = 0;
    return [[id, position]];
  }
  const top = placedAfter ? placedAfter.position : (last + 1) * STEP;
  return next.slice(0, last + 1)
    .map((n, i) => [n, top - (last + 1 - i) * STEP])
    .filter(([n, position]) => n === moving || n.position !== position)
    .map(([n, position]) => [n.id, position]);
}
