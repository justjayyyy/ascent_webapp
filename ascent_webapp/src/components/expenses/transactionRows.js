import { addMonths, format, parseISO } from 'date-fns';

const round2 = (n) => Math.round(n * 100) / 100;
export const STRIP = ['id', '_id', 'created_date', 'updated_date', 'createdBy', 'workspaceId'];
const RECURRING = ['isRecurring', 'recurringFrequency', 'recurringStartDate', 'recurringEndDate', 'recurringGroupId'];
const INSTALLMENT = ['installmentGroupId', 'installmentIndex', 'installmentCount', 'installmentTotal'];

export const newGroupId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The rows one save turns into: a single transaction, one per month for a monthly recurring
 * one, or one per installment for a big purchase paid in parts. Installments split the price
 * evenly and the last one absorbs the rounding, so the parts always add up to the total.
 */
export function expandTransaction(input) {
  const data = { ...input };
  STRIP.forEach((k) => delete data[k]);
  const count = Math.max(1, Math.min(60, parseInt(data.installmentCount, 10) || 1));
  delete data.installmentCount;

  if (data.type === 'Expense' && data.isBigPurchase && count > 1) {
    RECURRING.forEach((k) => delete data[k]);
    const total = round2(data.amount);
    const each = round2(total / count);
    const ratio = data.amountInGlobalCurrency != null && total ? data.amountInGlobalCurrency / total : null;
    const groupId = newGroupId();
    const first = parseISO(data.date);
    return Array.from({ length: count }, (_, i) => {
      const amount = i === count - 1 ? round2(total - each * (count - 1)) : each;
      return {
        ...data,
        amount,
        amountInGlobalCurrency: ratio != null ? round2(amount * ratio) : null,
        date: format(addMonths(first, i), 'yyyy-MM-dd'),
        isBigPurchase: true,
        installmentGroupId: groupId,
        installmentIndex: i + 1,
        installmentCount: count,
        installmentTotal: total,
      };
    });
  }

  INSTALLMENT.forEach((k) => delete data[k]);
  if (!data.isBigPurchase) delete data.isBigPurchase;

  if (data.isRecurring && data.recurringFrequency === 'monthly' && data.recurringStartDate && data.recurringEndDate) {
    const start = parseISO(data.recurringStartDate);
    const end = parseISO(data.recurringEndDate);
    const rows = [];
    const groupId = newGroupId();
    // addMonths keeps the day of month and clamps it (Jan 31 -> Feb 28), so no month is skipped
    for (let i = 0, d = start; d <= end && i < 120; i += 1, d = addMonths(start, i)) {
      rows.push({ ...data, date: format(d, 'yyyy-MM-dd'), isRecurring: true, recurringFrequency: 'monthly', recurringGroupId: groupId });
    }
    return rows.length ? rows : [{ ...data, date: data.recurringStartDate }];
  }

  RECURRING.forEach((k) => delete data[k]);
  return [data];
}

// Which monthly series a row belongs to. Series added before rows carried recurringGroupId are
// recognised by what every row of the run shares.
const seriesKey = (tx) => {
  if (!tx?.isRecurring || !tx.recurringStartDate) return null;
  return tx.recurringGroupId || ['legacy', tx.type, tx.recurringStartDate, tx.recurringEndDate, tx.description, tx.category].join('|');
};

/** Every row of `tx`'s monthly recurring series among `rows` (by date), or [] when it is not part of one. */
export function seriesOf(tx, rows) {
  const key = seriesKey(tx);
  if (!key) return [];
  const seen = new Set();
  return rows
    .filter((x) => seriesKey(x) === key && !seen.has(x.id) && seen.add(x.id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
