// The opt-in AI assistant: turns a quick note ("קפה 18 בויזה") into a transaction draft, and answers
// questions about the household's spending from an aggregated summary. Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const MODEL = 'claude-opus-5-5';
// On a policy decline the API retries on Anthropic's recommended fallback model inside the same call
const BETAS = ['server-side-fallback-2026-07-01'];
const LANGUAGES = { en: 'English', he: 'Hebrew', ru: 'Russian' };

let client;
const getClient = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export class AssistantDeclined extends Error {}

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

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(DraftSchema) },
    system: PARSE_SYSTEM,
    messages: [{ role: 'user', content: context }],
  });
  if (response.stop_reason === 'refusal') throw new AssistantDeclined('declined');
  if (!response.parsed_output) throw new Error('unparseable');
  return response.parsed_output;
}

const ASK_SYSTEM = `You are the money assistant inside Ascent, a household finance app that couples and families use together. You answer questions about their spending from a JSON summary of their own data.

- Use only the numbers in the summary. If it cannot answer the question, say what is missing instead of guessing.
- Lead with the direct answer and its figure, then at most three short supporting points. Keep it under 120 words.
- Format money with the summary's currency and round to whole units.
- Be calm and practical about money: point out a trend or a concrete next step, never lecture or alarm.
- Plain text with simple "- " bullets. No headings, tables or code.
- "stillCommitted" and "upcoming" are payments already scheduled later this month; "safeToSpend" is what is left after spending so far and those payments.`;

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
