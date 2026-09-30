import { hashToken } from './tokens.js';

const MIN = 60_000;
export const WINDOWS = {
  sameSource: 2 * MIN,     // the same source echoing one purchase (trigger fired twice, request replayed)
  crossSource: 45 * MIN,   // Wallet tap and issuer SMS for one purchase; tune from the logged time gaps
  statementDays: 3,        // statement rows only carry a date
};

/** Exact-replay key: identical payload from the same token and source. Null when the payload has no timestamp. */
export function dedupeKey({ tokenId, source, at, minor, currency, merchantKey, cardText, text }) {
  if (!at) return null;
  const basis = [tokenId, source, at, minor, currency, merchantKey ?? '', cardText ?? '', text ? hashToken(text) : ''].join('|');
  return hashToken(basis).slice(0, 32);
}

const sourcesOf = (row) => (row.ingest?.sources ?? []).map((s) => s.source);
const sameMoney = (a, b) =>
  a.currency === b.currency && Math.round(a.amount * 10 ** a.exponent) === Math.round(b.amount * 10 ** a.exponent);
const cardCompatible = (a, b) => !a || !b || String(a) === String(b);
const keysCompatible = (a, b) => !a || !b || a === b;
const gapMs = (ev, row) => (row.occurredAt ? Math.abs(new Date(row.occurredAt) - ev.occurredAt) : Infinity);
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Decides what an incoming event means, given candidate rows already fetched for the workspace.
 *   duplicate  the same source already reported this purchase: ignore it
 *   merge      another source reported it: enrich `target` instead of adding a second row
 *   flag       looks like something already there (a manual entry, or the other channel arriving late):
 *              add it, marked as a possible duplicate, and let a person decide
 *   create     nothing similar: add it
 * Two identical purchases from one source stay two rows, and a row absorbs each source only once.
 */
export function decideMatch(ev, candidates, windows = WINDOWS) {
  const pool = candidates.filter((c) => sameMoney(ev, c) && cardCompatible(ev.cardId, c.cardId));
  const nearest = (rows) => rows.sort((a, b) => gapMs(ev, a) - gapMs(ev, b))[0];

  if (ev.source === 'statement') {
    const hit = pool
      .filter((c) => !sourcesOf(c).includes('statement') && daysApart(c.date, ev.date) <= windows.statementDays)
      .sort((a, b) => daysApart(a.date, ev.date) - daysApart(b.date, ev.date))[0];
    return hit ? { action: 'merge', target: hit, reason: 'statement_reconcile' } : { action: 'create' };
  }

  const echo = nearest(
    pool.filter((c) => sourcesOf(c).includes(ev.source) && gapMs(ev, c) <= windows.sameSource && keysCompatible(ev.merchantKey, c.merchantKey))
  );
  if (echo) return { action: 'duplicate', target: echo, reason: 'same_source_echo' };

  const merge = nearest(
    pool.filter((c) => sourcesOf(c).length > 0 && !sourcesOf(c).includes(ev.source) && gapMs(ev, c) <= windows.crossSource)
  );
  if (merge) return { action: 'merge', target: merge, reason: 'cross_source' };

  const look = nearest(pool.filter((c) => c.date === ev.date && !sourcesOf(c).includes(ev.source)));
  if (look) return { action: 'flag', target: look, reason: sourcesOf(look).length ? 'same_day_other_source' : 'same_day_manual' };

  return { action: 'create' };
}

/**
 * What a merge changes on the existing row: record the source, fill blanks, and keep the earlier instant
 * (each report is an upper bound on when the purchase really happened). Status, category and amount are never touched.
 */
export function planMerge(target, ev, { source, tokenId }) {
  const set = {};
  if (!target.merchant && ev.merchant) {
    set.merchant = ev.merchant;
    set.merchantKey = ev.merchantKey;
    if (!target.description) set.description = ev.merchant;
  }
  if (!target.cardId && ev.cardId) {
    set.cardId = ev.cardId;
    set.paymentMethod = 'Card';
  }
  if (target.occurredAt && ev.occurredAt < new Date(target.occurredAt)) {
    set.occurredAt = ev.occurredAt;
    set.date = ev.date;
  }
  return { set, entry: { source, at: ev.occurredAt, tokenId, cardText: ev.cardText } };
}
