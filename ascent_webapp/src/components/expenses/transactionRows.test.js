import { describe, expect, test } from 'vitest';
import { expandTransaction, seriesOf, STRIP } from './transactionRows';

const base = { type: 'Expense', amount: 100, currency: 'ILS', category: 'shopping', date: '2026-01-31', description: 'TV' };

describe('one save, the rows it becomes', () => {
  test('a plain expense is one row without server fields or plumbing', () => {
    const rows = expandTransaction({ ...base, id: 'x', _id: 'y', workspaceId: 'w', installmentCount: '1', isRecurring: false, recurringFrequency: 'monthly' });
    expect(rows).toHaveLength(1);
    for (const k of [...STRIP, 'installmentCount', 'isRecurring', 'recurringFrequency', 'isBigPurchase']) expect(rows[0]).not.toHaveProperty(k);
  });

  test('installments split the price evenly and the last absorbs the rounding', () => {
    const rows = expandTransaction({ ...base, isBigPurchase: true, installmentCount: '3' });
    expect(rows.map((r) => r.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 10);
    expect(new Set(rows.map((r) => r.installmentGroupId)).size).toBe(1);
    expect(rows.map((r) => r.installmentIndex)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.installmentTotal === 100 && r.installmentCount === 3 && r.isBigPurchase)).toBe(true);
  });

  test('installments fall in consecutive months even from the 31st', () => {
    const rows = expandTransaction({ ...base, isBigPurchase: true, installmentCount: '3' });
    expect(rows.map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  test('a converted price is split in the same proportion', () => {
    const rows = expandTransaction({ ...base, currency: 'USD', amountInGlobalCurrency: 370, globalCurrency: 'ILS', isBigPurchase: true, installmentCount: '2' });
    expect(rows.map((r) => r.amountInGlobalCurrency)).toEqual([185, 185]);
    expect(rows.every((r) => r.globalCurrency === 'ILS')).toBe(true);
  });

  test('installment counts are kept between 1 and 60', () => {
    expect(expandTransaction({ ...base, isBigPurchase: true, installmentCount: '500' })).toHaveLength(60);
    expect(expandTransaction({ ...base, isBigPurchase: true, installmentCount: 'abc' })).toHaveLength(1);
  });

  test('a monthly recurring expense is one row per month in the range, never skipping a month', () => {
    const rows = expandTransaction({ ...base, isRecurring: true, recurringFrequency: 'monthly', recurringStartDate: '2026-01-31', recurringEndDate: '2026-04-30' });
    expect(rows.map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(rows.every((r) => r.isRecurring)).toBe(true);
  });

  test('a recurring range that ends before it starts still records the first one', () => {
    const rows = expandTransaction({ ...base, isRecurring: true, recurringFrequency: 'monthly', recurringStartDate: '2026-05-01', recurringEndDate: '2026-04-01' });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-05-01');
  });

  test('income is never split into installments', () => {
    expect(expandTransaction({ ...base, type: 'Income', isBigPurchase: true, installmentCount: '3' })).toHaveLength(1);
  });
});

describe('a recurring series, found from any of its rows', () => {
  const rec = { ...base, date: '2026-01-15', isRecurring: true, recurringFrequency: 'monthly', recurringStartDate: '2026-01-15', recurringEndDate: '2026-03-15', description: 'Rent' };

  test('one monthly save shares one group id', () => {
    const rows = expandTransaction(rec);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.recurringGroupId)).size).toBe(1);
    expect(rows[0].recurringGroupId).toBeTruthy();
  });

  test('rows of the same group, whatever was edited on one of them', () => {
    const rows = expandTransaction(rec).map((r, i) => ({ ...r, id: `r${i}` }));
    rows[2].description = 'Rent (raised)';
    const other = expandTransaction({ ...rec, description: 'Gym' }).map((r, i) => ({ ...r, id: `o${i}` }));
    expect(seriesOf(rows[1], [...other, ...rows].reverse()).map((r) => r.id)).toEqual(['r0', 'r1', 'r2']);
  });

  test('older series without a group id match by what the run shares', () => {
    const legacy = ['2026-01-15', '2026-02-15'].map((date, i) => ({ ...rec, date, id: `l${i}` }));
    const gym = { ...legacy[0], id: 'g', description: 'Gym' };
    expect(seriesOf(legacy[0], [gym, ...legacy]).map((r) => r.id)).toEqual(['l0', 'l1']);
  });

  test('a row that is not recurring has no series', () => {
    expect(seriesOf({ ...base, id: 'x' }, [{ ...base, id: 'x' }])).toEqual([]);
  });
});
