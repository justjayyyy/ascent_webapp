import { cleanText } from './text.js';

/** Last four digits first, then the Wallet name saved on the card. Never guesses: ambiguity means no match. */
export function matchCard(cards, cardText) {
  const text = cleanText(cardText, 80).toLowerCase();
  if (!text) return null;
  const active = cards.filter((c) => c.isActive !== false);

  const last4 = (text.match(/[•*·.x]{2,}\s*(\d{4})(?!\d)/) || text.match(/(?<!\d)(\d{4})(?!\d)/) || [])[1];
  if (last4) {
    const hit = active.filter((c) => c.lastFourDigits === last4);
    if (hit.length === 1) return hit[0];
  }

  const byName = active.filter((c) => c.walletName && cleanText(c.walletName, 80).toLowerCase() === text);
  return byName.length === 1 ? byName[0] : null;
}
