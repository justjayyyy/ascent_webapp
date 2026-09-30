import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmsPayload } from './sms.js';

const now = new Date('2026-09-30T12:00:00+03:00');
const at = '2026-09-30T11:58:00+03:00';
const parse = (text, extra = {}) => parseSmsPayload({ v: 1, text, at, ...extra }, { userCurrency: 'ILS', now });

test('Hebrew card alerts: amount, merchant and card', () => {
  const cases = [
    ['ישראכרט: בכרטיסך המסתיים ב-4580 אושרה עסקה ב-30/09 בסך 45.90 ש"ח בבית העסק שופרסל דיל. לפרטים www.isracard.co.il', 45.9, 'שופרסל דיל', '4580'],
    ['כאל: אושרה עסקה בסך 89.90 ₪ בכרטיס 1234 בבית עסק WOLT בתאריך 30/09/26', 89.9, 'WOLT', '1234'],
    ['לאומי קארד: חיוב בכרטיס 7788 בסך 1,250.00 ש"ח ב-איקאה נתניה', 1250, 'איקאה נתניה', '7788'],
  ];
  for (const [text, amount, merchant, card] of cases) {
    const r = parse(text);
    assert.ok(r.ok, text);
    assert.equal(r.event.amount, amount, text);
    assert.equal(r.event.currency, 'ILS', text);
    assert.equal(r.event.merchant, merchant, text);
    assert.equal(r.event.cardText, card, text);
    assert.equal(r.event.source, 'sms');
    assert.equal(r.event.date, '2026-09-30');
  }
});

test('English and Russian alerts', () => {
  const en = parse('Purchase of USD 12.50 at STARBUCKS NYC with card ending 1234.');
  assert.equal(en.event.amount, 12.5);
  assert.equal(en.event.currency, 'USD');
  assert.equal(en.event.merchant, 'STARBUCKS NYC');
  assert.equal(en.event.cardText, '1234');

  const ru = parse('Покупка 350.00 RUB, PYATEROCHKA 1123, карта *5566');
  assert.equal(ru.event.amount, 350);
  assert.equal(ru.event.currency, 'RUB');
  assert.equal(ru.event.merchant, 'PYATEROCHKA 1123');
  assert.equal(ru.event.merchantKey, 'pyaterochka');
  assert.equal(ru.event.cardText, '5566');
});

test('the card number or a date is never taken for the amount', () => {
  const r = parse('בכרטיס 1234 בתאריך 30/09 בוצעה עסקה בסך 18 ש"ח בארומה');
  assert.equal(r.event.amount, 18);
  assert.equal(r.event.cardText, '1234');
});

test('declines, codes and credits are not purchases', () => {
  assert.equal(parse('עסקה בסך 100 ש"ח בכרטיס 1234 נדחתה').reason, 'declined');
  assert.equal(parse('Your verification code is 482913').reason, 'not_a_purchase');
  assert.equal(parse('זיכוי בסך 50 ש"ח בכרטיס 1234').reason, 'not_a_purchase');
});

test('bad input is refused with a reason', () => {
  assert.equal(parse('').reason, 'text_missing');
  assert.equal(parse('שלום, מה שלומך?').reason, 'amount_unreadable');
  assert.equal(parseSmsPayload({ text: { $gt: '' } }).reason, 'text_missing');
  assert.equal(parseSmsPayload([]).reason, 'invalid_body');
  assert.equal(parseSmsPayload({ v: 2, text: 'x' }).reason, 'unsupported_version');
});

test('a missing merchant or time is flagged, not refused', () => {
  const r = parseSmsPayload({ text: 'חיוב בסך 30 ש"ח' }, { userCurrency: 'ILS', now });
  assert.ok(r.ok);
  assert.deepEqual(r.event.flags.sort(), ['dateApprox', 'incomplete']);
});
