// The opt-in AI assistant: turns a quick note ("קפה 18 בויזה") into a transaction draft, reads grocery
// receipt photos, and answers questions about the household's spending from an aggregated summary.
// Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
// The SDK's structured-output helper reads Zod 4 schemas; the zod 3 package ships them at 'zod/v4' (with zod 3's
// own `z`, every parse and receipt call failed before reaching the API: "Cannot read properties of undefined")
import { z } from 'zod/v4';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const MODEL = 'claude-opus-5-5';
// On a policy decline the API retries on Anthropic's recommended fallback model inside the same call
const BETAS = ['server-side-fallback-2026-07-01'];
const LANGUAGES = { en: 'English', he: 'Hebrew', ru: 'Russian' };

let client;
const getClient = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export class AssistantDeclined extends Error {}

/**
 * A structured answer, read against `schema`. A decline is checked before the text is read: the SDK's parse() reads
 * the (empty) text as JSON first and throws, so a decline used to surface as a generic failure.
 */
async function structured(params, schema) {
  const format = betaZodOutputFormat(schema);
  const response = await getClient().beta.messages.create({ ...params, output_config: { ...params.output_config, format } });
  if (response.stop_reason === 'refusal') throw new AssistantDeclined('declined');
  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('unparseable');
  return format.parse(text);
}

const DraftSchema = z.object({
  kind: z.enum(['transaction', 'question']),
  type: z.enum(['Expense', 'Income']),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string(),
  date: z.string().nullable(),
  paymentMethod: z.enum(['Card', 'Cash', 'Transfer', 'Apple Pay', 'Bit', 'Paybox', 'PayPal']).nullable(),
  cardName: z.string().nullable(),
});

const PARSE_SYSTEM = `You read short notes that people type into a household finance app, in English, Hebrew or Russian, and turn them into one transaction.

Decide first whether the note records money that was spent or received (kind "transaction") or asks something about their finances (kind "question"). For a question, fill the other fields with nulls and an empty description.

For a transaction:
- amount: the number in the note, positive. Never invent one; use null if the note has no amount.
- currency: an ISO 4217 code when the note names one (₪, ש"ח, NIS -> ILS; $ -> USD; € -> EUR; руб -> RUB), otherwise null.
- type: "Income" for salary, refunds, gifts received and other money coming in; otherwise "Expense".
- category: exactly one of the category keys you are given, the one that fits best, or null if none fits.
- description: a short label in the note's own language, such as the shop or what was bought. No amount, no date.
- date: YYYY-MM-DD. Resolve words like "yesterday", "אתמול", "вчера" or a weekday against the given today date. Null when the note gives no date.
- paymentMethod and cardName: only when the note says how it was paid ("בויזה", "with Max", "cash", "наличными"). cardName must be one of the given card names or null.`;

/** A quick note -> a transaction draft (or { kind: 'question' }). */
export async function parseNote({ text, today, currency, categories, cards }) {
  const context = [
    `Today: ${today}`,
    `Default currency: ${currency}`,
    `Category keys (key: names people use):\n${categories.map((c) => `- ${c.key}: ${c.labels.join(' / ')}`).join('\n')}`,
    `Card names: ${cards.length ? cards.join(', ') : '(none)'}`,
    `Note: ${text}`,
  ].join('\n\n');

  return structured({
    model: MODEL,
    max_tokens: 4000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: PARSE_SYSTEM,
    messages: [{ role: 'user', content: context }],
  }, DraftSchema);
}

const ASK_SYSTEM = `You are the money assistant inside Ascent, a household finance app that couples and families use together. You answer questions about their spending from a JSON summary of their own data.

- Use only the numbers in the summary. If it cannot answer the question, say what is missing instead of guessing.
- Lead with the direct answer and its figure, then at most three short supporting points. Keep it under 120 words.
- Format money with the summary's currency and round to whole units.
- Be calm and practical about money: point out a trend or a concrete next step, never lecture or alarm.
- Plain text with simple "- " bullets. No headings, tables or code.
- "stillCommitted" and "upcoming" are payments already scheduled later this month; "safeToSpend" is what is left after spending so far and those payments.`;

const ReceiptSchema = z.object({
  isReceipt: z.boolean(),
  store: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  currency: z.string().nullable(),
  items: z.array(z.object({
    text: z.string(),
    qty: z.number().nullable(),
    unit: z.string().nullable(),
    unitPrice: z.number().nullable(),
    price: z.number().nullable(),
    matchId: z.string().nullable(),
  })),
});

const RECEIPT_SYSTEM = `You read photos of shop receipts (usually supermarket receipts in Hebrew, Russian or English) for a household finance app.

- isReceipt: false when the photo is not a receipt or is too blurry to read; then use nulls and no items.
- total: the final amount paid, after discounts and including tax. Not a subtotal, not the change given back. Null if you cannot read it.
- currency: an ISO 4217 code from the receipt (₪, ש"ח -> ILS; $ -> USD; € -> EUR; руб, ₽ -> RUB), otherwise null.
- store: the shop's name as printed, short (no address, no branch number). Null if not printed.
- date: the purchase date as YYYY-MM-DD. Receipts often print DD/MM/YY. Null if not printed.
- items: every product line, in receipt order. text is the product as printed, cleaned of codes and of the quantity. Skip deposit, bag, discount-only and total lines.
  - qty: how many were bought (3 for "3 x 6.90"), or the weight or volume for things sold by weight or volume (1.235 for 1.235 kg); 1 when the line shows no quantity.
  - unit: "kg", "g", "l" or "ml" when sold by weight or volume, otherwise null.
  - unitPrice: the price of one (or of one kg, g, l or ml) as printed, or null when not printed.
  - price: what the line came to, after any discount on it, or null.
- matchId: when a line is clearly one of the shopping list items you are given (same product, in any language or spelling), that item's id; otherwise null. Never match two lines to one id unless the receipt repeats the product.

Read only what is printed. Never invent a number.`;

/** A receipt photo -> its total, store, date and lines, with lines matched to the shopping list. */
export async function readReceipt({ image, mediaType, listItems }) {
  const list = listItems.length
    ? listItems.map((i) => `- ${i.id}: ${i.name}`).join('\n')
    : '(empty)';
  return structured({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: RECEIPT_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: `Shopping list items (id: name):\n${list}` },
      ],
    }],
  }, ReceiptSchema);
}

/** A question about the household's money -> a short answer in the user's language. */
export async function answerQuestion({ question, summary, language }) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: ASK_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        // The summary is the same for follow-up questions in the next few minutes, so it is cached
        { type: 'text', text: `Household summary:\n${JSON.stringify(summary)}`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Answer in ${LANGUAGES[language] || 'English'}.\n\nQuestion: ${question}` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new AssistantDeclined('declined');
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
