// Turning a document into a note: pages of a PDF or photos of paper, read by Claude into the note's lines (titles,
// text, tasks, numbered entries, highlighted boxes, amounts on the side, and where the document's pictures go).
// The app renders the pages and cuts the pictures out on the device; this only reads them. Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AssistantDeclined } from './assistant.js';

const MODEL = 'claude-opus-5-5';
const BETAS = ['server-side-fallback-2026-07-01'];
export const MAX_PAGES_PER_CALL = 4;
const MAX_LINES = 500;

let client;
// A batch of pages is read within the function's minute, with no time for a second try
const getClient = () => (client ??= new Anthropic({ timeout: 55_000, maxRetries: 0 }));

const LineSchema = z.object({
  kind: z.enum(['title', 'text', 'task', 'numbered', 'callout', 'picture']),
  text: z.string(),
  done: z.boolean(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  picture: z.number().nullable(),
});
const DocumentSchema = z.object({
  title: z.string().nullable(),
  lines: z.array(LineSchema),
});

export const IMPORT_SYSTEM = `You copy documents into a notes app, faithfully, as the note's lines. You see the pages as images, in order.

Copy, never summarise, translate or reword: every heading, sentence, task, number and name, in the document's own language and spelling. Hebrew and Arabic read right to left: write them in their natural order. Leave out page numbers, running headers and footers repeated on every page, and decoration.

Each line has a kind:
- title: a heading or section name, as printed (keep a section number such as "2." if it is part of the heading).
- text: a paragraph or a line of plain text. Keep a paragraph's sentences together in one line; use a newline only where the document breaks the line on purpose (an address, a short list of facts).
- task: a checkbox or to-do entry. done is true only when its box is ticked.
- numbered: an entry of a numbered list. Leave out the number itself; the app numbers the entries. Put the entry's name on the first line and its details (sub-lines, small print) on the next lines of the same text.
- callout: a highlighted, shaded or boxed note. If the box has its own heading, put it on the first line and the body on the next lines.
- picture: where one of the listed pictures appears. picture is its number; text is its caption, or empty.

Amounts: when a list entry or a table row has a sum of money of its own (a price or cost column, an amount set apart beside the entry), set amount to that number and currency to its ISO 4217 code (₪, ש"ח -> ILS; $ -> USD; € -> EUR; £ -> GBP; ₽, руб -> RUB; null if none is shown), and leave it out of the text. Amounts inside sentences stay in the text with amount null. The app adds up a run of lines with amounts by itself, so leave out a total row that only adds up the amounts right above it; keep any other summary row (paid so far, balance) as a text line with its figures in the text.

title: the document's main title when these pages start the document (it heads the note and is not repeated as a line), otherwise null. Set done false and amount, currency and picture null wherever they do not apply.`;

/** One call: these pages -> { title, lines } in the app's line shape (see entities/notes.js). */
export async function readDocumentPages({ pages, pictures = [], firstPage = 1, pageCount, language }) {
  const content = [];
  pages.forEach((page, i) => {
    content.push({ type: 'text', text: `Page ${firstPage + i}${pageCount ? ` of ${pageCount}` : ''}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: page.mediaType, data: page.data } });
  });
  const listed = pictures.length
    ? pictures.map((p) => `- picture ${p.ref}: on page ${p.page}, ${p.width}×${p.height} px`).join('\n')
    : '(none)';
  content.push({
    type: 'text',
    text: [
      firstPage > 1 ? `These pages continue a document whose earlier pages were copied separately; carry on where they left off (title null).` : null,
      `Pictures to place:\n${listed}`,
      language ? `The person reads the app in ${language}; that does not change the document's language.` : null,
      'Copy these pages.',
    ].filter(Boolean).join('\n\n'),
  });

  const format = betaZodOutputFormat(DocumentSchema);
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'low', format },
    system: IMPORT_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new AssistantDeclined('declined');
  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('unparseable');
  return toNoteLines(format.parse(text), pictures.map((p) => p.ref));
}

const KINDS = { title: 'title', text: 'text', task: null, numbered: 'number', callout: 'callout', picture: 'image' };

/** Claude's answer -> note lines, each picture placed once and only pictures that exist. */
export function toNoteLines(result, pictureRefs = []) {
  const known = new Set(pictureRefs);
  const placed = new Set();
  const lines = [];
  for (const raw of result?.lines || []) {
    if (lines.length >= MAX_LINES) break;
    const kind = Object.prototype.hasOwnProperty.call(KINDS, raw?.kind) ? KINDS[raw.kind] : 'text';
    const text = String(raw?.text ?? '').trim().slice(0, 2000);
    if (kind === 'image') {
      const ref = Number(raw?.picture);
      if (!known.has(ref) || placed.has(ref)) continue;
      placed.add(ref);
      lines.push({ kind, text, done: false, picture: ref });
      continue;
    }
    if (!text) continue;
    const line = { text, done: kind === null && raw?.done === true, ...(kind ? { kind } : {}) };
    const amount = Number(raw?.amount);
    if ((kind === null || kind === 'text' || kind === 'number') && raw?.amount !== null && raw?.amount !== undefined && Number.isFinite(amount)) {
      line.amount = Math.round(amount * 100) / 100;
      const currency = String(raw?.currency || '').toUpperCase();
      if (/^[A-Z]{3}$/.test(currency)) line.currency = currency;
    }
    lines.push(line);
  }
  const title = String(result?.title || '').trim().slice(0, 500) || null;
  return { title, lines };
}
