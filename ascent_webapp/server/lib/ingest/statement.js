// Card or bank statement rows -> what to add and what to merge. The file is read on the device; this
// only ever sees { date, description, amount, currency, card, category } per row.
//
// A statement row usually describes a purchase that is already in the app (typed in, tapped with Apple Pay,
// or reported by SMS). Those rows are enriched rather than duplicated, and importing the same file twice
// changes nothing the second time.
import { cleanText, merchantKey } from './text.js';
import { matchCard } from './cards.js';
import { dedupeKey, decideMatch, planMerge } from './match.js';

export const MAX_ROWS = 2000;
const MAX_AMOUNT = 1_000_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

const exponentOf = (currency) => (ZERO_DECIMAL.has(currency) ? 0 : 2);
const validDay = (d) => {
  if (!ISO_DAY.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; // no rolling Feb 30 into March
};

/** One row from the device -> a clean row, or null when it cannot be used. */
export function normalizeRow(row, userCurrency) {
  if (!row || typeof row !== 'object') return null;
  const date = String(row.date ?? '').trim();
  const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount);
  if (!validDay(date) || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) return null;
  const description = cleanText(typeof row.description === 'string' ? row.description : '', 120);
  const currency = /^[A-Z]{3}$/.test(String(row.currency ?? '').toUpperCase()) ? String(row.currency).toUpperCase() : userCurrency;
  const exponent = exponentOf(currency);
  const minor = Math.round(Math.abs(amount) * 10 ** exponent);
  return {
    date,
    description,
    merchantKey: merchantKey(description),
    amount: minor / 10 ** exponent,
    minor,
    exponent,
    currency,
    credit: amount < 0,
    cardText: cleanText(typeof row.card === 'string' ? row.card : String(row.card ?? ''), 80),
    category: typeof row.category === 'string' ? row.category.slice(0, 80) : '',
  };
}

/**
 * @param {object} input
 * @param {Array}  input.rows          rows from the device
 * @param {string} input.scope         a stable id for this workspace's imports (keys the replay guard)
 * @param {string} input.userCurrency
 * @param {Array}  input.existing      expense rows around the statement's dates (with ingest sources)
 * @param {Set}    input.seenKeys      replay keys already stored, as dedupeKey on rows or as `ref` on merged sources
 * @param {Array}  [input.cards]
 * @param {(row) => string} input.categorize  category for a new row
 * @returns {{ creates: Array, merges: Array<{ id, set, entry }>, duplicates: number, invalid: number }}
 */
export function planStatementImport({ rows, scope, userCurrency, existing, seenKeys, cards = [], categorize }) {
  const pool = existing.map((row) => ({ ...row, ingest: { ...row.ingest, sources: [...(row.ingest?.sources ?? [])] } }));
  const occurrences = new Map();
  const plan = { creates: [], merges: [], duplicates: 0, invalid: 0 };

  const clean = rows.map((r) => normalizeRow(r, userCurrency));
  plan.invalid = clean.filter((r) => !r).length;
  const usable = clean.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  for (const row of usable) {
    // Two identical coffees on one day are two purchases: the occurrence number keeps their keys apart
    const base = [row.date, row.minor, row.currency, row.merchantKey, row.credit ? 'cr' : 'dr'].join('|');
    const n = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, n);
    const key = dedupeKey({ tokenId: scope, source: 'statement', at: row.date, minor: row.minor, currency: row.currency, merchantKey: row.merchantKey, cardText: row.cardText, text: `${n}${row.credit ? 'cr' : ''}` });
    if (seenKeys.has(key)) {
      plan.duplicates += 1;
      continue;
    }
    seenKeys.add(key);

    const card = matchCard(cards, row.cardText);
    const ev = {
      source: 'statement',
      amount: row.amount,
      minor: row.minor,
      exponent: row.exponent,
      currency: row.currency,
      merchant: row.description,
      merchantKey: row.merchantKey,
      cardText: row.cardText,
      cardId: card ? String(card._id) : null,
      date: row.date,
      occurredAt: null,
    };

    if (!row.credit) {
      const decision = decideMatch(ev, pool.filter((c) => c.type !== 'Income'));
      if (decision.action === 'merge') {
        const { set, entry } = planMerge(decision.target, ev, { source: 'statement', tokenId: null });
        // A statement's date is when the charge posted, often a day or two late: it never moves the purchase
        delete set.occurredAt;
        delete set.date;
        const fullEntry = { ...entry, at: new Date(`${row.date}T12:00:00Z`), ref: key };
        decision.target.ingest.sources.push(fullEntry);
        plan.merges.push({ id: decision.target._id, set, entry: fullEntry });
        continue;
      }
    }

    const type = row.credit ? 'Income' : 'Expense';
    plan.creates.push({
      type,
      amount: row.amount,
      currency: row.currency,
      amountInGlobalCurrency: row.currency === userCurrency ? row.amount : null,
      category: categorize({ ...row, type }),
      description: row.description,
      merchant: row.description,
      merchantKey: row.merchantKey,
      date: row.date,
      paymentMethod: card || row.cardText ? 'Card' : '',
      cardId: ev.cardId,
      source: 'statement',
      dedupeKey: key,
      ingest: { sources: [{ source: 'statement', at: new Date(`${row.date}T12:00:00Z`), cardText: row.cardText }] },
    });
    // A later row of the same file can still find this one (the same charge listed twice is caught by its key)
    if (!row.credit) pool.push({ ...plan.creates.at(-1), _id: null, ingest: { sources: [{ source: 'statement' }] } });
  }
  return plan;
}
