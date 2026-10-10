// A note as a document: totals under runs of amounts, pasting from web pages and documents (headings, tasks,
// numbered lists, highlighted boxes, pictures, rows with amounts), and copying a note out the same way.
import { formatAmount, hasAmount, lineKind, parseAmount, parseLines } from './noteUtils';

/**
 * Where a run of two or more lines with amounts ends, the run's total in each currency it uses:
 * Map(index of the run's last line -> [{ currency, amount }]). Lines without a currency count in `fallback`.
 */
export function amountTotals(lines, fallback = null) {
  const out = new Map();
  let run = [];
  const close = (end) => {
    if (run.length >= 2) {
      const sums = new Map();
      for (const it of run) {
        const cur = it.currency || fallback || '';
        sums.set(cur, (sums.get(cur) || 0) + it.amount);
      }
      out.set(end, [...sums].map(([currency, amount]) => ({ currency: currency || null, amount: Math.round(amount * 100) / 100 })));
    }
    run = [];
  };
  lines.forEach((it, i) => {
    if (hasAmount(it)) run.push(it);
    else close(i - 1);
  });
  close(lines.length - 1);
  return out;
}

/** The number a numbered line shows: its place in the run of numbered lines it belongs to. */
export function lineNumbers(lines) {
  let n = 0;
  return lines.map(it => (lineKind(it) === 'number' ? (n += 1) : (n = 0, null)));
}

// ---- pasting from web pages and documents ----

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'BLOCKQUOTE', 'FIGURE',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'HR', 'DL', 'DT', 'DD', 'IMG']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'BUTTON', 'INPUT']);
const BLOCK_SELECTOR = [...BLOCK].map(t => t.toLowerCase()).join(',');
const BOX_START = /^\s*(?:\[\s?\]|[□☐▢❏❑])\s*/;
const DONE_START = /^\s*(?:\[[xX✓✔]\]|[☑☒✓✔✅])\s*/;
const NUMBER_START = /^\s*\d{1,3}[.)]\s+/;

const tidy = (s) => s.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();

/** The text of an element as it reads: <br> and block children break lines. */
function textOf(el) {
  let out = '';
  const visit = (node) => {
    if (node.nodeType === 3) { out += node.textContent.replace(/\s+/g, ' '); return; }
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    if (node.tagName === 'BR') { out += '\n'; return; }
    const block = BLOCK.has(node.tagName);
    if (block) out += '\n';
    node.childNodes.forEach(visit);
    if (block) out += '\n';
  };
  visit(el);
  return tidy(out);
}

const isCallout = (el) => el.tagName === 'BLOCKQUOTE' || el.tagName === 'ASIDE' || el.getAttribute('role') === 'note'
  || /\b(callout|admonition|alert|notice)\b/i.test(el.getAttribute('class') || '');

// A checkbox the source drew: an input, ARIA, or Notion's and GitHub's classes
function checkboxOf(el) {
  const input = el.querySelector?.('input[type="checkbox"]');
  if (input) return { done: input.checked || input.hasAttribute('checked') };
  const aria = el.getAttribute?.('role') === 'checkbox' ? el : el.querySelector?.('[role="checkbox"]');
  if (aria) return { done: aria.getAttribute('aria-checked') === 'true' };
  const box = el.querySelector?.('[class*="checkbox"]');
  if (box) return { done: /checkbox-on|checked/.test(box.getAttribute('class') || '') };
  return null;
}

// An amount at the end of a line, in its own element ("DJ <b>₪8,000</b>"), or one this app wrote (data-amount)
function trailingAmount(el) {
  const marked = el.querySelector?.('[data-amount]');
  if (marked) {
    const amount = Number(marked.getAttribute('data-amount'));
    if (Number.isFinite(amount)) {
      const currency = marked.getAttribute('data-currency') || null;
      const clone = el.cloneNode(true);
      clone.querySelector('[data-amount]').remove();
      return { text: textOf(clone), amount, currency };
    }
  }
  let last = el.lastElementChild;
  while (last && !textOf(last)) last = last.previousElementSibling;
  if (!last) return null;
  const money = parseAmount(textOf(last));
  if (!money?.currency) return null; // a bare number in a sentence is not a price
  const clone = el.cloneNode(true);
  const target = [...clone.children].filter(c => textOf(c)).pop();
  target?.remove();
  const text = textOf(clone);
  return text ? { text, ...money } : null;
}

const money = (m) => (m ? { amount: m.amount, ...(m.currency ? { currency: m.currency } : {}) } : {});

/**
 * HTML from the clipboard as checklist lines: headings become titles, checkboxes tasks (ticked or not),
 * numbered lists numbered lines, quotes and callouts highlighted boxes, pictures pictures (with `src` to
 * upload), table rows and list entries ending in an amount get it on the side. Bullets are tasks, as in text.
 */
export function parseHtml(html) {
  if (typeof DOMParser === 'undefined' || !html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  let inline = [];

  const push = (line) => { if (line.kind === 'image' ? line.src : line.text) out.push({ done: false, ...line }); };

  // A paragraph: each of its lines read for marks like pasted text, plain lines kept together as one text line
  const paragraph = (el) => {
    const box = checkboxOf(el);
    const priced = trailingAmount(el);
    const text = priced?.text ?? textOf(el);
    if (!text) return;
    if (box) { push({ text: text.replace(BOX_START, '').replace(DONE_START, ''), done: box.done, ...money(priced) }); return; }
    const plain = [];
    const flushPlain = (extra = {}) => { if (plain.length) push({ text: plain.join('\n'), kind: 'text', ...extra }); plain.length = 0; };
    const rows = text.split('\n');
    rows.forEach((row, i) => {
      const extra = i === rows.length - 1 ? money(priced) : {};
      if (/^#{1,6}\s/.test(row)) { flushPlain(); push({ text: row.replace(/^#+\s+/, ''), kind: 'title' }); return; }
      if (DONE_START.test(row)) { flushPlain(); push({ text: row.replace(DONE_START, ''), done: true, ...extra }); return; }
      if (BOX_START.test(row) || /^[-*•·]\s+/.test(row)) { flushPlain(); push({ text: row.replace(BOX_START, '').replace(/^[-*•·]\s+/, ''), ...extra }); return; }
      if (NUMBER_START.test(row)) { flushPlain(); push({ text: row.replace(NUMBER_START, ''), kind: 'number', ...extra }); return; }
      plain.push(row);
      if (i === rows.length - 1) flushPlain(extra);
    });
  };

  const flushInline = () => {
    if (!inline.length) return;
    const holder = doc.createElement('p');
    inline.forEach(n => holder.appendChild(n));
    inline = [];
    paragraph(holder);
  };

  const image = (img, caption) => {
    const src = img.getAttribute('src') || '';
    if (!/^(data:image\/|https?:|blob:)/i.test(src)) return;
    push({ kind: 'image', src, text: caption || img.getAttribute('alt') || '' });
  };

  const list = (el, ordered) => {
    for (const li of el.children) {
      if (li.tagName !== 'LI') { if (li.tagName === 'UL' || li.tagName === 'OL') list(li, li.tagName === 'OL'); continue; }
      const nested = [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
      const own = li.cloneNode(true);
      [...own.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL').forEach(c => c.remove());
      own.querySelectorAll('img').forEach((img) => { image(img); img.remove(); });
      const box = checkboxOf(own);
      const priced = trailingAmount(own);
      const text = priced?.text ?? textOf(own);
      if (text) {
        if (box || DONE_START.test(text) || BOX_START.test(text)) {
          push({ text: text.replace(DONE_START, '').replace(BOX_START, ''), done: box ? box.done : DONE_START.test(text), ...money(priced) });
        } else {
          push({ text, ...(ordered ? { kind: 'number' } : {}), ...money(priced) });
        }
      }
      nested.forEach(n => list(n, n.tagName === 'OL'));
    }
  };

  const table = (el) => {
    for (const tr of el.querySelectorAll('tr')) {
      const cells = [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
      if (cells.length && cells.every(c => c.tagName === 'TH')) continue; // the header row
      const texts = cells.map(textOf).filter(Boolean);
      if (!texts.length) continue;
      const box = checkboxOf(tr);
      const last = texts.length > 1 ? parseAmount(texts[texts.length - 1]) : null;
      const words = last ? texts.slice(0, -1) : texts;
      const text = words.length > 1 ? `${words[0]}\n${words.slice(1).join(' · ')}` : words[0];
      push({ text, ...(box ? { done: box.done } : { kind: 'text' }), ...money(last) });
    }
  };

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) { if (child.textContent.trim()) inline.push(child.cloneNode()); continue; }
      if (child.nodeType !== 1 || SKIP.has(child.tagName)) continue;
      const tag = child.tagName;
      if (child.hasAttribute('data-note-total')) continue; // a total this app wrote: it adds itself up again
      if (!BLOCK.has(tag)) {
        // Google Docs wraps the whole copy in one <b>; anything holding blocks is walked into
        if (child.querySelector(BLOCK_SELECTOR)) { flushInline(); walk(child); flushInline(); }
        else inline.push(child.cloneNode(true));
        continue;
      }
      flushInline();
      if (/^H[1-6]$/.test(tag)) push({ text: textOf(child).replace(/\n/g, ' '), kind: 'title' });
      else if (tag === 'IMG') image(child);
      else if (tag === 'FIGURE') {
        const img = child.querySelector('img');
        const caption = child.querySelector('figcaption');
        if (img) image(img, caption ? textOf(caption) : '');
        else paragraph(child);
      } else if (isCallout(child)) push({ text: textOf(child), kind: 'callout' });
      else if (tag === 'UL' || tag === 'OL') list(child, tag === 'OL');
      else if (tag === 'TABLE') table(child);
      else if (tag === 'HR') { /* a divider */ }
      else if (child.querySelector(BLOCK_SELECTOR) && !checkboxOf(child)) walk(child);
      else paragraph(child);
    }
    flushInline();
  };

  walk(doc.body);
  return out;
}

const structure = (lines) => lines.reduce((n, l) => n + (lineKind(l) === 'text' && !('amount' in l) ? 0 : 1), 0);

/**
 * What a paste should become: the HTML version when it says more (pictures, headings, boxes, amounts)
 * than the plain text does, otherwise the plain text read line by line. Null when it is a single line.
 */
export function readPaste({ html, text }) {
  const fromHtml = html ? parseHtml(html) : [];
  const fromText = text && /\n/.test(text.trim()) ? parseLines(text) : [];
  const pictures = fromHtml.some(l => l.kind === 'image');
  const best = pictures || (fromHtml.length > 1 && structure(fromHtml) >= structure(fromText)) ? fromHtml : fromText;
  return best.length >= 2 || best.some(l => l.kind === 'image') ? best : null;
}

// ---- copying a note out ----

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const withBreaks = (s) => esc(s).replace(/\n/g, '<br>');

/**
 * A note as HTML that keeps its shape when pasted into a document, an email or another note: titles,
 * tasks with their boxes, numbered lines, highlighted boxes, pictures (`images`: fileId -> data URL)
 * and amounts with their totals.
 */
export function noteToHtml(note, { images = {}, language, currency, totalLabel = 'Total' } = {}) {
  const parts = [];
  if (note.title) parts.push(`<h1>${esc(note.title)}</h1>`);
  if (note.type !== 'checklist') {
    if (note.content) parts.push(`<p>${withBreaks(note.content)}</p>`);
    return parts.join('\n');
  }
  const lines = note.items || [];
  const totals = amountTotals(lines, currency);
  const priced = (it) => (hasAmount(it)
    ? ` <span data-amount="${it.amount}"${it.currency ? ` data-currency="${esc(it.currency)}"` : ''}>${esc(formatAmount(it.amount, it.currency || currency, language))}</span>`
    : '');
  let open = null; // the list being written: 'ul' or 'ol'
  const listOf = (tag) => { if (open !== tag) { if (open) parts.push(`</${open}>`); parts.push(`<${tag}>`); open = tag; } };
  const closeList = () => { if (open) { parts.push(`</${open}>`); open = null; } };
  lines.forEach((it, i) => {
    const kind = lineKind(it);
    if (kind === 'item') { listOf('ul'); parts.push(`<li>${it.done ? '☑' : '☐'} ${withBreaks(it.text)}${priced(it)}</li>`); }
    else if (kind === 'number') { listOf('ol'); parts.push(`<li>${withBreaks(it.text)}${priced(it)}</li>`); }
    else {
      closeList();
      if (kind === 'title') parts.push(`<h2>${esc(it.text)}</h2>`);
      else if (kind === 'callout') parts.push(`<blockquote>${withBreaks(it.text)}</blockquote>`);
      else if (kind === 'image') {
        const src = images[it.fileId];
        if (src) parts.push(`<figure><img src="${esc(src)}" alt="${esc(it.text)}">${it.text ? `<figcaption>${esc(it.text)}</figcaption>` : ''}</figure>`);
      } else if (it.text || hasAmount(it)) parts.push(`<p>${withBreaks(it.text)}${priced(it)}</p>`);
    }
    if (totals.has(i)) {
      closeList();
      const sum = totals.get(i).map(t => esc(formatAmount(t.amount, t.currency, language))).join(' + ');
      parts.push(`<p data-note-total="1"><strong>${esc(totalLabel)}</strong> ${sum}</p>`);
    }
  });
  closeList();
  return parts.join('\n');
}
