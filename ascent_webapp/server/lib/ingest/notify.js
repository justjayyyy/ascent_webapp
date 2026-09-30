const REVIEW = { en: 'Needs review', he: 'ממתין לבדיקה', ru: 'Нужна проверка' };
const NO_MERCHANT = { en: 'Apple Pay', he: 'Apple Pay', ru: 'Apple Pay' };

/** The push notification for a payment that was just added: "Aroma  ·  ₪18.00 · Needs review". */
export function paymentPush(ev, language = 'en') {
  const lang = REVIEW[language] ? language : 'en';
  let amount;
  try {
    amount = new Intl.NumberFormat(lang === 'he' ? 'he-IL' : lang === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: ev.currency }).format(ev.amount);
  } catch {
    amount = `${ev.amount} ${ev.currency}`;
  }
  return { title: ev.merchant || NO_MERCHANT[lang], body: `${amount} · ${REVIEW[lang]}`, url: '/Expenses', tag: 'tap-payment' };
}
