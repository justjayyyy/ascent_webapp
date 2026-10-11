// Formatting inside a line of a note: bold, italic, underline and strikethrough. It is kept in the text itself,
// as <b>…</b>, <i>…</i>, <u>…</u> and <s>…</s>, so it goes wherever the text goes (saving, syncing, sharing a
// note, offline) and text without it is just text. Where a note's text is shown or searched as plain text, the
// marks are taken out (`plainText`). Text typed that looks like one of these tags is kept as text: a backslash
// goes before it, and backslashes right before a tag are doubled.
//
// Positions in a line (where the cursor is, what is selected) count the characters you see: the plain text.
import { createElement, Fragment } from 'react';

export const MARKS = ['b', 'i', 'u', 's'];
const TAG_AT = /<(\/?)([bius])>/y;
const TAG_ANYWHERE = /<\/?[bius]>/;

/** Whether text has any formatting in it (or anything that reads like it). */
export const isRich = (text) => TAG_ANYWHERE.test(String(text ?? ''));

const ordered = (marks) => MARKS.filter(m => marks.includes(m)).join('');

/** Text as pieces of the same formatting: [{ text, marks }], where marks is a string like 'bi'. */
export function parseRich(text) {
  const s = String(text ?? '');
  if (!isRich(s)) return s ? [{ text: s, marks: '' }] : [];
  const out = [];
  const depth = { b: 0, i: 0, u: 0, s: 0 };
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const marks = MARKS.filter(m => depth[m] > 0).join('');
    const last = out[out.length - 1];
    if (last && last.marks === marks) last.text += buf;
    else out.push({ text: buf, marks });
    buf = '';
  };
  const tagAt = (i) => { TAG_AT.lastIndex = i; return TAG_AT.exec(s); };
  for (let i = 0; i < s.length;) {
    if (s[i] === '\\') {
      let j = i;
      while (s[j] === '\\') j += 1;
      const tag = tagAt(j);
      if (!tag) { buf += s.slice(i, j); i = j; continue; }
      const n = j - i;
      buf += '\\'.repeat(n >> 1);
      if (n % 2) { buf += tag[0]; i = j + tag[0].length; } else i = j;
      continue;
    }
    const tag = s[i] === '<' && tagAt(i);
    if (tag) {
      const [whole, close, mark] = tag;
      if (!close) { flush(); depth[mark] += 1; i += whole.length; continue; }
      if (depth[mark] > 0) { flush(); depth[mark] -= 1; i += whole.length; continue; }
    }
    buf += s[i];
    i += 1;
  }
  flush();
  return out;
}

// Text written out as text: anything that reads like a tag gets a backslash, and backslashes right before a
// tag (or before the end, when a tag comes next) are doubled
const escapeText = (text, tagNext) => {
  let out = text.replace(/(\\*)(<\/?[bius]>)/g, (_, bs, tag) => `${bs}${bs}\\${tag}`);
  if (tagNext) out = out.replace(/\\+$/, (bs) => bs + bs);
  return out;
};

/** Pieces of formatted text written back as one text. */
export function writeRich(pieces) {
  const list = [];
  for (const p of pieces) {
    if (!p.text) continue;
    const marks = ordered(p.marks || '');
    const last = list[list.length - 1];
    if (last && last.marks === marks) last.text += p.text;
    else list.push({ text: p.text, marks });
  }
  let out = '';
  const open = [];
  list.forEach((p, k) => {
    let keep = 0;
    while (keep < open.length && p.marks.includes(open[keep])) keep += 1;
    while (open.length > keep) out += `</${open.pop()}>`;
    for (const m of p.marks) if (!open.includes(m)) { out += `<${m}>`; open.push(m); }
    out += escapeText(p.text, k < list.length - 1 || open.length > 0);
  });
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** The text as it reads, without its formatting. */
export function plainText(text) {
  const s = String(text ?? '');
  return isRich(s) ? parseRich(s).map(p => p.text).join('') : s;
}

// The pieces between two places in the plain text
function cut(pieces, from, to) {
  const out = [];
  let at = 0;
  for (const p of pieces) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + p.text.length);
    if (end > start) out.push({ text: p.text.slice(start - at, end - at), marks: p.marks });
    at += p.text.length;
  }
  return out;
}

/** Part of formatted text, between two places in its plain text, with its formatting. */
export function sliceRich(text, from = 0, to = Infinity) {
  if (!isRich(text)) return String(text ?? '').slice(from, to);
  return writeRich(cut(parseRich(text), from, to));
}

/** Two formatted texts one after the other. */
export function joinRich(...texts) {
  if (!texts.some(isRich)) return texts.join('');
  return writeRich(texts.flatMap(parseRich));
}

/** The formatting all of [from, to) has; with nothing selected, that of the letter before (or after, at the start). */
export function marksAt(text, from, to = from) {
  const pieces = parseRich(text);
  let a = from;
  let b = to;
  if (a === b) {
    if (a > 0) a -= 1; else b += 1;
  }
  const inside = cut(pieces, a, b);
  if (!inside.length) return '';
  return MARKS.filter(m => inside.every(p => p.marks.includes(m))).join('');
}

/** `insert` put in place of [from, to), formatted with `marks` (by default as the text it goes into). */
export function replaceRich(text, from, to, insert, marks) {
  const pieces = parseRich(text);
  const len = pieces.reduce((n, p) => n + p.text.length, 0);
  const own = marks ?? marksAt(text, from, from === to ? from : from + 1);
  return writeRich([...cut(pieces, 0, from), { text: insert, marks: own }, ...cut(pieces, to, len)]);
}

/** Formatted text `insert` put in place of [from, to). */
export function spliceRich(text, from, to, insert) {
  const pieces = parseRich(text);
  const len = pieces.reduce((n, p) => n + p.text.length, 0);
  return writeRich([...cut(pieces, 0, from), ...parseRich(insert), ...cut(pieces, to, len)]);
}

/** [from, to) with `mark` taken off when all of it has it, put on otherwise. */
export function toggleMark(text, from, to, mark) {
  const pieces = parseRich(text);
  const len = pieces.reduce((n, p) => n + p.text.length, 0);
  const on = !marksAt(text, from, to).includes(mark);
  const middle = cut(pieces, from, to).map(p => ({
    text: p.text,
    marks: on ? p.marks + mark : p.marks.replace(mark, ''),
  }));
  return writeRich([...cut(pieces, 0, from), ...middle, ...cut(pieces, to, len)]);
}

/** [from, to) with no formatting. */
export function clearMarks(text, from, to) {
  const pieces = parseRich(text);
  const len = pieces.reduce((n, p) => n + p.text.length, 0);
  return writeRich([...cut(pieces, 0, from), ...cut(pieces, from, to).map(p => ({ text: p.text, marks: '' })), ...cut(pieces, to, len)]);
}

const TAGS = { b: 'strong', i: 'em', u: 'u', s: 's' };

/** Formatted text as React nodes; `each(text)` shows each piece's text (to mark search matches in it). */
export function richNodes(text, each = (s) => s) {
  if (!isRich(text)) return each(String(text ?? ''));
  return createElement(Fragment, null, ...parseRich(text).map((p, k) => createElement(
    Fragment,
    { key: k },
    [...p.marks].reduceRight((inner, m) => createElement(TAGS[m], null, inner), each(p.text)),
  )));
}

const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Formatted text as HTML, line breaks as <br>. */
export function richHtml(text) {
  return parseRich(text).map(p => [...p.marks].reduceRight(
    (inner, m) => `<${TAGS[m]}>${inner}</${TAGS[m]}>`,
    esc(p.text).replace(/\n/g, '<br>'),
  )).join('');
}

// ---- reading formatting from the page ----

const BLOCKS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'UL', 'OL', 'TABLE', 'SECTION', 'ARTICLE']);
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG']);

// What an element adds to the formatting it is in: its tag, and its own style (as Google Docs and Word write it)
function marksOf(el, marks) {
  let out = marks;
  const add = (m) => { if (!out.includes(m)) out += m; };
  const drop = (m) => { out = out.replace(m, ''); };
  const tag = el.tagName;
  const style = el.style || {};
  const weight = style.fontWeight;
  if (tag === 'STRONG' || tag === 'B') add('b');
  if (tag === 'EM' || tag === 'I') add('i');
  if (tag === 'U' || tag === 'INS') add('u');
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') add('s');
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) add('b');
  else if (weight === 'normal' || (weight && Number(weight) < 600)) drop('b');
  if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') add('i');
  else if (style.fontStyle === 'normal') drop('i');
  const line = `${style.textDecorationLine || ''} ${style.textDecoration || ''}`;
  if (/underline/.test(line)) add('u');
  if (/line-through/.test(line)) add('s');
  return ordered(out);
}

/**
 * The formatted text a piece of the page holds: an editable line, or HTML pasted into one (`html`: its spaces
 * and line breaks run together as a browser shows them). <br> and blocks break lines; a last <br> only holds an
 * empty last line open. With `points`, also where each of its text nodes and breaks starts in the plain text:
 * [{ node, start, length }].
 */
export function readRich(root, points, { html = false } = {}) {
  const pieces = [];
  let len = 0;
  const lastChar = () => (pieces.length ? pieces[pieces.length - 1].text.slice(-1) : '');
  // Pasted HTML: no space after a space or at the start of a line, none before a line break
  const dropTrailingSpaces = () => {
    while (pieces.length && / $/.test(pieces[pieces.length - 1].text)) {
      const last = pieces[pieces.length - 1];
      last.text = last.text.replace(/ +$/, '');
      if (!last.text) pieces.pop();
    }
  };
  const push = (raw, marks, node) => {
    let text = raw;
    if (html) {
      if (text === '\n') dropTrailingSpaces();
      else if (/^ /.test(text) && (!lastChar() || / |\n/.test(lastChar()))) text = text.slice(1);
    }
    if (points && node) points.push({ node, start: len, length: text.length });
    if (!text) return;
    pieces.push({ text, marks });
    len += text.length;
  };
  const lastBreak = (() => {
    let n = root.lastChild;
    while (n && n.nodeType === 1 && n.tagName !== 'BR' && n.lastChild) n = n.lastChild;
    return n && n.nodeType === 1 && n.tagName === 'BR' ? n : null;
  })();
  const visit = (node, marks) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { push(html ? child.data.replace(/\s+/g, ' ') : child.data, marks, child); continue; }
      if (child.nodeType !== 1 || SKIPPED.has(child.tagName)) continue;
      if (child.tagName === 'BR') { push(child === lastBreak ? '' : '\n', marks, child); continue; }
      const block = BLOCKS.has(child.tagName);
      if (block && pieces.length && lastChar() !== '\n') push('\n', marks);
      visit(child, marksOf(child, marks));
      if (block && html && pieces.length && lastChar() !== '\n') push('\n', marks);
    }
  };
  visit(root, '');
  if (!html) return writeRich(pieces);
  dropTrailingSpaces();
  const text = writeRich(pieces);
  const plain = plainText(text);
  return sliceRich(text, 0, plain.replace(/\n+$/, '').length);
}

/** Formatted text drawn into an editable line: one text node per piece, inside its tags. */
export function drawRich(root, text) {
  const doc = root.ownerDocument;
  const nodes = parseRich(text).map(p => [...p.marks].reduceRight((inner, m) => {
    const el = doc.createElement(TAGS[m]);
    el.appendChild(inner);
    return el;
  }, doc.createTextNode(p.text)));
  // An empty line (or an empty last line) only shows with something on it
  const plain = plainText(text);
  if (!plain || plain.endsWith('\n')) nodes.push(doc.createElement('br'));
  root.replaceChildren(...nodes);
}
