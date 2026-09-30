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

  const byWalletName = active.filter((c) => c.walletName && cleanText(c.walletName, 80).toLowerCase() === text);
  if (byWalletName.length === 1) return byWalletName[0];

  // Wallet often reports just the issuer or network ("Isracard", "Visa"): match the card's own name, then its network.
  const byName = active.filter((c) => {
    const name = cleanText(c.name, 80).toLowerCase();
    return name.length >= 3 && text.length >= 3 && (text.includes(name) || name.includes(text));
  });
  if (byName.length === 1) return byName[0];

  const network = ['visa', 'mastercard', 'amex', 'discover'].find((n) => text.includes(n) || (n === 'amex' && text.includes('american express')));
  if (network) {
    const byNetwork = active.filter((c) => c.network === network);
    if (byNetwork.length === 1) return byNetwork[0];
  }
  return null;
}
