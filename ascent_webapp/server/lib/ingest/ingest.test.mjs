import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount } from './amount.js';
import { cleanText, merchantKey } from './text.js';
import { resolveWhen, shiftDate } from './time.js';
import { hashToken, newToken, tokenFromHeader } from './tokens.js';
import { dedupeKey, decideMatch, planMerge } from './match.js';
import { matchCard } from './cards.js';
import { parseWalletPayload } from './wallet.js';
import { memberCanSubmit } from './access.js';

/* ------------------------------------------------------------- amounts */

const amountCases = [
  // input, options, value, currency, negative
  ['₪25.00', {}, 25, 'ILS', false],
  ['‏25.00 ₪', {}, 25, 'ILS', false],            // RLM + NBSP as Hebrew UIs emit them
  ['₪ 1,234.50', {}, 1234.5, 'ILS', false],
  ['1.234,50 €', {}, 1234.5, 'EUR', false],
  ['€1.234,50', {}, 1234.5, 'EUR', false],
  ['$12.99', { userCurrency: 'ILS' }, 12.99, 'USD', false],
  ['$12.99', { userCurrency: 'CAD' }, 12.99, 'CAD', false], // a bare $ follows the user's dollar
  ['CA$12.99', {}, 12.99, 'CAD', false],
  ['US$5', { userCurrency: 'CAD' }, 5, 'USD', false],
  ['A$7.50', {}, 7.5, 'AUD', false],
  ['1 234,50 ₽', {}, 1234.5, 'RUB', false],
  ['¥1,234', {}, 1234, 'JPY', false],
  ["1'234.50 CHF", {}, 1234.5, 'CHF', false],
  ['USD 1,234.56', {}, 1234.56, 'USD', false],
  ['25.00 ש"ח', {}, 25, 'ILS', false],
  ['25.00 ש״ח', {}, 25, 'ILS', false],
  ['NIS 40', {}, 40, 'ILS', false],
  ['25', {}, 25, null, false],
  ['25,5', {}, 25.5, null, false],
  ['0,50', {}, 0.5, null, false],
  ['0.99', {}, 0.99, null, false],
  ['1,234', {}, 1234, null, false],                          // grouping, not 1.234
  ['1.234', {}, 1234, null, false],                          // the one genuinely ambiguous case: read as grouping
  ['1.234.567,89', {}, 1234567.89, null, false],
  ['-₪18.00', {}, 18, 'ILS', true],
  ['(18.00)', {}, 18, null, true],
  ['₪0.00', {}, 0, 'ILS', false],                            // parses; callers reject <= 0
  [25.5, {}, 25.5, null, false],
];

for (const [input, options, value, currency, negative] of amountCases) {
  test(`parseAmount(${JSON.stringify(input)}) -> ${value} ${currency ?? '(no currency)'}${negative ? ' negative' : ''}`, () => {
    const r = parseAmount(input, options);
    assert.ok(r, 'expected a result');
    assert.equal(r.value, value);
    assert.equal(r.currency, currency);
    assert.equal(r.negative, negative);
  });
}

test('parseAmount rejects unreadable input without throwing', () => {
  for (const bad of ['abc', '', '   ', null, undefined, {}, [], NaN, '₪', '--']) {
    assert.equal(parseAmount(bad), null, JSON.stringify(bad));
  }
});

test('currencies without decimals only ever group', () => {
  assert.equal(parseAmount('¥1.234').value, 1234);
});

/* ------------------------------------------------------------ merchants */

test('merchantKey collapses cosmetic differences', () => {
  for (const s of ['Aroma Espresso Bar', 'AROMA ESPRESSO BAR #1234', '‏Aroma  Espresso Bar‎', 'aroma espresso bar 0042']) {
    assert.equal(merchantKey(s), 'aroma espresso bar', s);
  }
  assert.equal(merchantKey('PAYPAL *SPOTIFY'), 'spotify');
  assert.equal(merchantKey('שופרסל דיל בע"מ 0123'), 'שופרסל דיל');
  assert.equal(merchantKey('ארומה אספרסו בר'), 'ארומה אספרסו בר');
  assert.equal(merchantKey('WOLT*ORDER 8842'), 'wolt order');
  assert.equal(merchantKey(''), '');
  assert.equal(merchantKey(null), '');
});

test('cleanText strips direction and control characters and caps the length', () => {
  assert.equal(cleanText('‮evil‬  name'), 'evil name');
  assert.equal(cleanText('a\u0000b\u0007c'), 'a b c');
  assert.equal(cleanText('x'.repeat(500), 120).length, 120);
});

/* ---------------------------------------------------------------- time */

test('the local date comes from the text, not from UTC', () => {
  const now = new Date('2026-09-30T00:40:00+03:00');
  const r = resolveWhen('2026-09-30T00:30:00+03:00', now);
  assert.equal(r.date, '2026-09-30');
  assert.equal(r.occurredAt.toISOString(), '2026-09-29T21:30:00.000Z'); // UTC is still the 29th
  assert.equal(r.approx, false);
});

test('missing, malformed, future or stale timestamps fall back to now and are approximate', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  for (const at of [undefined, '', 'yesterday', '2026-09-29 09:01:12', '2026-09-29T15:00:00Z', '2026-09-01T09:00:00Z']) {
    const r = resolveWhen(at, now);
    assert.equal(r.approx, true, String(at));
    assert.equal(r.occurredAt.getTime(), now.getTime());
  }
  assert.equal(resolveWhen('2026-09-29T09:01:12+0300', now).approx, false);
});

test('shiftDate is plain calendar arithmetic', () => {
  assert.equal(shiftDate('2026-09-29', 3), '2026-10-02');
  assert.equal(shiftDate('2026-09-29', -3), '2026-09-26');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

/* -------------------------------------------------------------- tokens */

test('tokens: shape, hash and header parsing', () => {
  const { token, tokenHash, prefix } = newToken();
  assert.match(token, /^asc_[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenHash, hashToken(token));
  assert.equal(tokenHash.length, 64);
  assert.equal(prefix, token.slice(0, 8));
  assert.equal(tokenFromHeader({ authorization: `Bearer ${token}` }), token);
  for (const h of [undefined, {}, { authorization: 'Bearer nope' }, { authorization: `Bearer ${token}x` }, { authorization: `Bearer ${token.slice(0, -1)}` }]) {
    assert.equal(tokenFromHeader(h), null);
  }
  // pasted on a phone: extra spaces, newline, direction marks, quotes, missing space, bare token
  for (const h of [`Bearer  ${token} `, `Bearer ${token}
`, `‏Bearer ${token}‎`, `"Bearer ${token}"`, `Bearer${token}`, token, `Bearer ‏${token}`]) {
    assert.equal(tokenFromHeader({ authorization: h }), token, JSON.stringify(h));
  }
  assert.notEqual(newToken().token, newToken().token);
});

test('dedupeKey is stable for a replay, differs for another payload and is null without a timestamp', () => {
  const base = { tokenId: 't1', source: 'wallet', at: '2026-09-29T09:01:12+03:00', minor: 1800, currency: 'ILS', merchantKey: 'aroma', cardText: 'Visa ••1234' };
  assert.equal(dedupeKey(base), dedupeKey({ ...base }));
  assert.notEqual(dedupeKey(base), dedupeKey({ ...base, minor: 1801 }));
  assert.notEqual(dedupeKey(base), dedupeKey({ ...base, tokenId: 't2' }));
  assert.equal(dedupeKey({ ...base, at: undefined }), null);
});

/* --------------------------------------------------------------- cards */

test('matchCard: last four, then the saved Wallet name, never a guess', () => {
  const cards = [
    { id: 'a', name: 'Isracard', lastFourDigits: '1234', isActive: true },
    { id: 'b', name: 'Max', lastFourDigits: '5678', walletName: 'Max Gold', isActive: true },
    { id: 'c', name: 'Old', lastFourDigits: '9999', isActive: false },
    { id: 'd', name: 'Twin1', lastFourDigits: '4242', isActive: true },
    { id: 'e', name: 'Twin2', lastFourDigits: '4242', isActive: true },
  ];
  assert.equal(matchCard(cards, 'Visa •••• 1234').id, 'a');
  assert.equal(matchCard(cards, 'Isracard 1234').id, 'a');
  assert.equal(matchCard(cards, 'max gold').id, 'b');
  assert.equal(matchCard(cards, 'Old ••9999'), null);        // inactive
  assert.equal(matchCard(cards, 'Twin ••4242'), null);       // ambiguous last four
  assert.equal(matchCard(cards, 'Some other card'), null);
  assert.equal(matchCard(cards, ''), null);
});

/* ------------------------------------------------------- access control */

test('memberCanSubmit: owners and admins, or editors with editExpenses; never pending or rejected members', () => {
  const ok = (m) => memberCanSubmit(m);
  assert.equal(ok({ role: 'owner', status: 'accepted' }), true);
  assert.equal(ok({ role: 'admin', status: 'accepted' }), true);
  assert.equal(ok({ role: 'editor', status: 'accepted', permissions: { editExpenses: true } }), true);
  assert.equal(ok({ role: 'viewer', status: 'accepted', permissions: { viewExpenses: true, editExpenses: false } }), false);
  assert.equal(ok({ role: 'owner', status: 'pending' }), false);
  assert.equal(ok({ role: 'owner', status: 'rejected' }), false);
  assert.equal(ok({ role: 'owner' }), true);               // legacy member without a status
  assert.equal(ok(null), false);
  assert.equal(ok(undefined), false);
});

/* ----------------------------------------------------- wallet payloads */

const NOW = new Date('2026-09-29T09:05:00+03:00');
const payload = (o = {}) => ({ v: 1, merchant: 'Aroma Espresso Bar', amount: '₪18.00', card: 'Visa ••1234', at: '2026-09-29T09:01:12+03:00', ...o });
const parse = (body, userCurrency = 'ILS') => parseWalletPayload(body, { userCurrency, now: NOW });

test('a complete wallet payload becomes a normalized event', () => {
  const r = parse(payload());
  assert.equal(r.ok, true);
  assert.deepEqual(
    { ...r.event, occurredAt: r.event.occurredAt.toISOString() },
    {
      source: 'wallet', amount: 18, minor: 1800, exponent: 2, currency: 'ILS',
      merchant: 'Aroma Espresso Bar', merchantKey: 'aroma espresso bar', cardText: 'Visa ••1234',
      at: '2026-09-29T09:01:12+03:00', occurredAt: '2026-09-29T06:01:12.000Z', date: '2026-09-29', flags: [],
    }
  );
});

test('flags: assumed currency, missing merchant, approximate date, negative sign', () => {
  const r = parse(payload({ amount: '-18.00', merchant: '  ', at: undefined }));
  assert.equal(r.ok, true);
  assert.deepEqual([...r.event.flags].sort(), ['currencyAssumed', 'dateApprox', 'incomplete', 'signNegative']);
  assert.equal(r.event.currency, 'ILS');
  assert.equal(r.event.amount, 18);
});

test('a foreign currency is kept as sent', () => {
  const r = parse(payload({ amount: '€12,50' }));
  assert.equal(r.event.currency, 'EUR');
  assert.equal(r.event.amount, 12.5);
});

test('unusable payloads are rejected with a reason and never become events', () => {
  const reasons = (body) => parse(body).reason;
  assert.equal(reasons(payload({ amount: '₪0.00' })), 'amount_unreadable');
  assert.equal(reasons(payload({ amount: 'abc' })), 'amount_unreadable');
  assert.equal(reasons(payload({ amount: undefined })), 'amount_unreadable');
  assert.equal(reasons(payload({ amount: { $gt: 0 } })), 'amount_unreadable');
  assert.equal(reasons(payload({ amount: ['5'] })), 'amount_unreadable');
  assert.equal(reasons(payload({ amount: '₪5,000,000.00' })), 'amount_out_of_range');
  assert.equal(reasons(payload({ v: 2 })), 'unsupported_version');
  for (const body of [null, undefined, 'text', 5, []]) assert.equal(reasons(body), 'invalid_body');
});

test('object-shaped text fields are ignored instead of being trusted', () => {
  const r = parse(payload({ merchant: { $ne: null }, card: { $regex: '.*' } }));
  assert.equal(r.ok, true);
  assert.equal(r.event.merchant, '');
  assert.equal(r.event.cardText, '');
  assert.ok(r.event.flags.includes('incomplete'));
});

test('long or decorated text is cleaned and capped', () => {
  const r = parse(payload({ merchant: `‮${'M'.repeat(300)}`, card: 'C'.repeat(300) }));
  assert.equal(r.event.merchant.length, 120);
  assert.equal(r.event.cardText.length, 80);
  assert.ok(!r.event.merchant.includes('‮'));
});

test('a numeric amount is accepted', () => {
  assert.equal(parse(payload({ amount: 18.5 })).event.amount, 18.5);
});

/* ---------------------------------------------------- dedupe scenarios */

const at = (hh, mm, day = '2026-09-29') => new Date(`${day}T${hh}:${mm}:00+03:00`);
const evt = (o = {}) => ({
  source: 'wallet', amount: 18, currency: 'ILS', exponent: 2, occurredAt: at('09', '01'),
  date: '2026-09-29', cardId: null, merchantKey: 'aroma espresso bar', ...o,
});
const row = (o = {}) => ({
  id: 'r1', amount: 18, currency: 'ILS', occurredAt: at('09', '01'), date: '2026-09-29', status: 'pending',
  source: 'wallet', cardId: null, merchantKey: 'aroma espresso bar', ingest: { sources: [{ source: 'wallet' }] }, ...o,
});

test('S1 first event, nothing to match -> create', () => {
  assert.equal(decideMatch(evt(), []).action, 'create');
});

test('S2 trigger fires twice 40s apart -> duplicate', () => {
  const r = decideMatch(evt(), [row({ occurredAt: new Date(at('09', '01').getTime() - 40_000) })]);
  assert.equal(r.action, 'duplicate');
});

test('S3 Wallet row, then the issuer SMS two minutes later -> merge into the Wallet row', () => {
  const r = decideMatch(evt({ source: 'sms', occurredAt: at('09', '03'), merchantKey: 'aroma espresso bar tlv' }), [row()]);
  assert.equal(r.action, 'merge');
  assert.equal(r.target.id, 'r1');
});

test('S4 two real coffees: each SMS pairs with its own Wallet row', () => {
  const a = row({ id: 'A', occurredAt: at('09', '01') });
  const b = row({ id: 'B', occurredAt: at('09', '20') });
  assert.equal(decideMatch(evt({ source: 'sms', occurredAt: at('09', '02') }), [a, b]).target.id, 'A');
  a.ingest.sources.push({ source: 'sms' });                    // A has now absorbed its SMS
  const second = decideMatch(evt({ source: 'sms', occurredAt: at('09', '21') }), [a, b]);
  assert.equal(second.action, 'merge');
  assert.equal(second.target.id, 'B');
});

test('S4b a second identical coffee 19 minutes later is a new purchase, neither duplicate nor flagged', () => {
  assert.equal(decideMatch(evt({ occurredAt: at('09', '20') }), [row()]).action, 'create');
});

test('S5 a Wallet event delayed by hours after the SMS row exists -> flag, never merge or drop', () => {
  const smsRow = row({ source: 'sms', occurredAt: at('09', '03'), ingest: { sources: [{ source: 'sms' }] } });
  const r = decideMatch(evt({ occurredAt: at('12', '05') }), [smsRow]);
  assert.equal(r.action, 'flag');
  assert.equal(r.reason, 'same_day_other_source');
});

test('S6 a manual entry for the same amount that day -> flag as possible duplicate', () => {
  const manual = { id: 'm1', amount: 18, currency: 'ILS', occurredAt: null, date: '2026-09-29', status: 'confirmed', source: 'manual', cardId: null, merchantKey: '' };
  const r = decideMatch(evt(), [manual]);
  assert.equal(r.action, 'flag');
  assert.equal(r.reason, 'same_day_manual');
});

test('S7 a statement row reconciles a Wallet row up to three days away', () => {
  const r = decideMatch(evt({ source: 'statement', occurredAt: at('00', '00', '2026-09-30'), date: '2026-09-30' }), [row()]);
  assert.equal(r.action, 'merge');
  assert.equal(r.reason, 'statement_reconcile');
});

test('S8 a statement row reconciles a manual entry too', () => {
  const manual = { id: 'm1', amount: 18, currency: 'ILS', occurredAt: null, date: '2026-09-28', status: 'confirmed', source: 'manual', cardId: null, merchantKey: '' };
  assert.equal(decideMatch(evt({ source: 'statement', date: '2026-09-29' }), [manual]).action, 'merge');
});

test('S9 a statement row is never absorbed twice, and an unmatched one becomes a new row', () => {
  const done = row({ ingest: { sources: [{ source: 'wallet' }, { source: 'statement' }] } });
  assert.equal(decideMatch(evt({ source: 'statement' }), [done]).action, 'create');
  assert.equal(decideMatch(evt({ source: 'statement', date: '2026-10-05' }), [row()]).action, 'create');
});

test('S10 a different currency or amount is never a match', () => {
  assert.equal(decideMatch(evt({ currency: 'USD' }), [row()]).action, 'create');
  assert.equal(decideMatch(evt({ amount: 18.01 }), [row()]).action, 'create');
});

test('S11 cards must agree when both are known; an unknown card is compatible', () => {
  assert.equal(decideMatch(evt({ source: 'sms', cardId: 'c2' }), [row({ cardId: 'c1' })]).action, 'create');
  assert.equal(decideMatch(evt({ source: 'sms', cardId: 'c1' }), [row({ cardId: null })]).action, 'merge');
});

test('S12 Wallet and SMS straddling midnight still merge (instants, not dates)', () => {
  const late = row({ occurredAt: at('23', '58'), date: '2026-09-29' });
  const r = decideMatch(evt({ source: 'sms', occurredAt: at('00', '02', '2026-09-30'), date: '2026-09-30' }), [late]);
  assert.equal(r.action, 'merge');
});

/* ---------------------------------------------------------- merge plan */

test('planMerge fills blanks, keeps the earlier instant and never touches status, category or amount', () => {
  const target = { merchant: '', description: '', cardId: null, occurredAt: at('09', '05'), date: '2026-09-29' };
  const ev = evt({ source: 'sms', merchant: 'Aroma TLV', merchantKey: 'aroma tlv', cardId: 'c1', cardText: 'Isracard 1234', occurredAt: at('09', '03') });
  const { set, entry } = planMerge(target, ev, { source: 'sms', tokenId: 't1' });
  assert.deepEqual(Object.keys(set).sort(), ['cardId', 'date', 'description', 'merchant', 'merchantKey', 'occurredAt', 'paymentMethod']);
  assert.equal(set.occurredAt.getTime(), at('09', '03').getTime());
  assert.deepEqual(entry, { source: 'sms', at: ev.occurredAt, tokenId: 't1', cardText: 'Isracard 1234' });
});

test('planMerge leaves existing values alone and keeps a later instant out', () => {
  const target = { merchant: 'Aroma', description: 'Coffee', cardId: 'c9', occurredAt: at('09', '01'), date: '2026-09-29' };
  const { set } = planMerge(target, evt({ source: 'sms', merchant: 'Other', cardId: 'c1', occurredAt: at('09', '03') }), { source: 'sms', tokenId: 't1' });
  assert.deepEqual(set, {});
});
