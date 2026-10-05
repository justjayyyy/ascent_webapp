// A receipt's product lines, as the app keeps them: what was bought, how many (or how much, by weight),
// the price of one and what the line came to. Used for what the assistant reads and what a receipt stores.

const MAX_LINES = 150;
const UNITS = new Set(['kg', 'g', 'l', 'ml']);

const money = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null);
const amount = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e4 ? Math.round(n * 1000) / 1000 : null);

/**
 * Lines cleaned for storing or sending: [{ text, qty, unit, unitPrice, price }], plus `matchId` when
 * `ids` (the shopping list's item ids) is given. A missing price of one is worked out from the line's
 * price and quantity.
 */
export function cleanReceiptLines(lines, { ids } = {}) {
  return (Array.isArray(lines) ? lines : []).slice(0, MAX_LINES)
    .map((line) => {
      const qty = amount(line?.qty);
      const unit = typeof line?.unit === 'string' && UNITS.has(line.unit.toLowerCase()) ? line.unit.toLowerCase() : null;
      const price = money(line?.price);
      const given = money(line?.unitPrice);
      const unitPrice = given ?? (qty && price !== null ? Math.round((price / qty) * 100) / 100 : null);
      const row = { text: String(line?.text || '').trim().slice(0, 120), qty, unit, unitPrice, price };
      if (ids) row.matchId = typeof line?.matchId === 'string' && ids.has(line.matchId) ? line.matchId : null;
      return row;
    })
    .filter((line) => line.text);
}
