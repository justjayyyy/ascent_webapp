import { cleanText } from './text.js';

// Israeli issuers as Wallet names them in Hebrew or English: a card saved as "Isracard" is the one Wallet
// calls "ישראכרט"
const ISSUERS = [
  ['isracard', 'ישראכרט'],
  ['max', 'מקס', 'leumi card', 'לאומי קארד'],
  ['cal', 'כאל', 'visa cal', 'ויזה כאל'],
  ['amex', 'american express', 'אמריקן אקספרס'],
  ['diners', 'דיינרס'],
];
const issuerOf = (text) => {
  const words = ` ${text} `;
  return ISSUERS.findIndex((names) => names.some((n) => words.includes(` ${n} `) || text === n));
};
const isSame = (a, b) => a != null && b != null && String(a) === String(b);

// The ways a tap names its card, most specific first: last four, the saved Wallet name, the card's name (in
// either language for the known issuers), and last its network
const STAGES = [
  (cards, text) => {
    const last4 = (text.match(/[•*·.x]{2,}\s*(\d{4})(?!\d)/) || text.match(/(?<!\d)(\d{4})(?!\d)/) || [])[1];
    return last4 ? cards.filter((c) => c.lastFourDigits === last4) : [];
  },
  (cards, text) => cards.filter((c) => c.walletName && cleanText(c.walletName, 80).toLowerCase() === text),
  // Wallet often reports just the issuer ("Isracard", "ישראכרט")
  (cards, text) => {
    const issuer = issuerOf(text);
    return cards.filter((c) => {
      const name = cleanText(c.name, 80).toLowerCase();
      if (name.length >= 3 && text.length >= 3 && (text.includes(name) || name.includes(text))) return true;
      return issuer >= 0 && issuerOf(name) === issuer;
    });
  },
  (cards, text) => {
    const network = ['visa', 'mastercard', 'amex', 'discover'].find((n) => text.includes(n) || (n === 'amex' && text.includes('american express')));
    return network ? cards.filter((c) => c.network === network) : [];
  },
];

/**
 * The card a tap was made with. Never guesses between cards: ambiguity means no match. `owner` is whoever
 * tapped: their own cards are tried first (two partners with a Visa each), and when Wallet does not say
 * which card it was, their default card (or their only one) is it.
 */
export function matchCard(cards, cardText, { owner = null } = {}) {
  const text = cleanText(cardText, 80).toLowerCase();
  const active = cards.filter((c) => c.isActive !== false);
  const mine = owner ? active.filter((c) => isSame(c.createdBy, owner)) : [];

  if (!text) {
    if (!mine.length) return null;
    const defaults = mine.filter((c) => c.isDefault);
    if (defaults.length === 1) return defaults[0];
    return mine.length === 1 ? mine[0] : null;
  }
  // Each way of naming a card, among the tapper's own cards and then everyone's, before a vaguer one:
  // "Visa Hapoalim" is the partner's card by name even when the tapper has a Visa too
  for (const stage of STAGES) {
    const own = mine.length ? stage(mine, text) : [];
    if (own.length === 1) return own[0];
    const all = stage(active, text);
    if (all.length === 1) return all[0];
  }
  return null;
}
