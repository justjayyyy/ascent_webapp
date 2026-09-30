import { parseAmount } from './amount.js';
import { cleanText, merchantKey, stripBidi } from './text.js';
import { resolveWhen } from './time.js';

const MAX_AMOUNT = 1_000_000;
const MAX_TEXT = 600;

const asText = (v) => (typeof v === 'string' ? v : '');

// Messages that are about a card but are not a completed purchase
const DECLINED = /נדח(?:ת)?ה|סורב|declined|was not approved|отклон/iu;
const NOT_PURCHASE = /קוד (?:אימות|חד[- ]?פעמי)|verification code|one[- ]time (?:code|password)|код (?:подтверждения)?\s*:|זיכוי|refund|credited|возврат|зачислен/iu;

const CUR = String.raw`(?:₪|ש["״'׳]?ח|NIS|ILS|USD|EUR|GBP|RUB|UAH|US\$|\$|€|£|₽|руб\.?)`;
const NUM = String.raw`\d[\d.,']*`;
const MONEY = new RegExp(String.raw`(?:${CUR}\s?-?${NUM}|-?${NUM}\s?${CUR})`, 'iu');
// Words that introduce the amount, so a card or a date number is never taken for it
const AMOUNT_LEAD = new RegExp(
  String.raw`(?:בסך|סך של|בסכום|סכום|amount of|amount|purchase of|spent|charge of|на сумму|сумма|покупка|оплата)\s*:?\s*(${CUR}?\s?${NUM}\s?${CUR}?)`,
  'iu'
);
const CARD = /(?:המסתיים ב|המסתיימת ב|מסתיים ב|שמספרו|בכרטיס(?:ך)?|כרטיס|card ending(?: in)?|ending in|ending|card|карт[аыой]+|\*)\D{0,6}(\d{4})(?!\d)/iu;

// Where a merchant name stops (\b only knows Latin letters, so the word end is spelled out)
const MERCHANT_END = /\s+(?:בתאריך|ביום|בשעה|בכרטיס(?:ך)?|לפרטים|למידע|on|with|using|via|card|карта|карты|картой|дата)(?=[\s.,;:]|$)|[.,;]\s|[.,;]$|\s[-–]\s|\s{2,}|$/iu;
const MERCHANT_LEADS = [
  /(?:בבית (?:ה)?עסק|אצל)\s*:?\s*/iu,
  /\bat\s+/i,
  /\bв\s+(?=[A-ZА-ЯЁ"«])/u,
];

function cutMerchant(rest) {
  const s = rest.replace(/^[\s:,\-–]+/, '').replace(/^(?:ב-?\s?|at\s+)/iu, '');
  const end = s.search(MERCHANT_END);
  return cleanText(end === -1 ? s : s.slice(0, end), 120).replace(/[\s:,\-–]+$/, '');
}

function findMerchant(text, amountEnd) {
  for (const lead of MERCHANT_LEADS) {
    const m = lead.exec(text);
    if (m) {
      const name = cutMerchant(text.slice(m.index + m[0].length));
      if (name) return name;
    }
  }
  // "... בסך 45.90 ש"ח ב-שופרסל" / "Покупка 350 RUB, PYATEROCHKA, карта *1234": the words right after the amount
  const after = cutMerchant(text.slice(amountEnd).replace(/^\s*[,.]?\s*/, ''));
  if (after && !/^\d/.test(after) && !CARD.test(after.slice(0, 8))) return after;
  return '';
}

/**
 * A card company's SMS forwarded by the phone's Shortcut -> a normalized event, or { ok: false, reason }.
 * Body: { v: 1, text, at }. `text` is the message as received; `at` is when it arrived (ISO 8601).
 */
export function parseSmsPayload(body, { userCurrency = 'USD', now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid_body' };
  if (body.v !== undefined && body.v !== 1 && body.v !== '1') return { ok: false, reason: 'unsupported_version' };

  const raw = asText(body.text).slice(0, MAX_TEXT);
  const text = stripBidi(raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'text_missing' };
  if (DECLINED.test(text)) return { ok: false, reason: 'declined' };
  if (NOT_PURCHASE.test(text)) return { ok: false, reason: 'not_a_purchase' };

  const lead = AMOUNT_LEAD.exec(text);
  const loose = lead ? null : MONEY.exec(text);
  const moneyText = lead ? lead[1] : loose?.[0];
  const amountEnd = lead ? lead.index + lead[0].length : loose ? loose.index + loose[0].length : 0;
  const amount = moneyText ? parseAmount(moneyText, { userCurrency }) : null;
  if (!amount || amount.value <= 0) return { ok: false, reason: 'amount_unreadable' };
  if (amount.value > MAX_AMOUNT) return { ok: false, reason: 'amount_out_of_range' };

  const flags = [];
  if (!amount.currency) flags.push('currencyAssumed');

  const merchant = findMerchant(text, amountEnd);
  if (!merchant) flags.push('incomplete');
  const card = CARD.exec(text)?.[1] ?? '';

  const at = asText(body.at).trim() || null;
  const when = resolveWhen(at, now);
  if (when.approx) flags.push('dateApprox');

  return {
    ok: true,
    event: {
      source: 'sms',
      amount: amount.value,
      minor: amount.minor,
      exponent: amount.exponent,
      currency: amount.currency ?? userCurrency,
      merchant,
      merchantKey: merchantKey(merchant),
      cardText: card,
      text,
      at,
      occurredAt: when.occurredAt,
      date: when.date,
      flags,
    },
  };
}
