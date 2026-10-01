import { expect, test, vi } from 'vitest';
import { allTransactions, DATASETS } from './exportData';

vi.mock('@/api/client', () => ({ ascent: {} }));

const rows = (n, date, start = 0) => Array.from({ length: n }, (_, i) => ({ id: `t${start + i}`, date }));

test('a short history comes in one request', async () => {
  const filter = vi.fn(async () => rows(3, '2026-01-01'));
  const api = { entities: { ExpenseTransaction: { filter } } };
  expect(await allTransactions(api)).toHaveLength(3);
  expect(filter).toHaveBeenCalledTimes(1);
});

test('a long history is paged by date until it ends, each row once', async () => {
  const filter = vi.fn(async (f) => {
    if (!f.to) return [...rows(9998, '2026-05-01'), ...rows(2, '2026-04-30', 9998)];
    if (f.to === '2026-04-30') return [...rows(2, '2026-04-30', 9998), ...rows(5, '2026-03-01', 20000)];
    return [];
  });
  const all = await allTransactions({ entities: { ExpenseTransaction: { filter } } });
  expect(all).toHaveLength(10005);
  expect(filter.mock.calls.map((c) => c[0])).toEqual([{}, { to: '2026-04-30' }]);
});

test('the expenses export holds every transaction and the other expense tables', async () => {
  const api = { entities: {
    ExpenseTransaction: { filter: async () => [{ id: '1', date: '2026-01-02', type: 'Expense', amount: 5, description: '=cmd' }] },
    Budget: { list: async () => [{ category: 'food', monthlyLimit: 100 }] },
    Category: { list: async () => [{ name: 'food' }] },
    Card: { list: async () => { throw new Error('no permission'); } },
  } };
  const out = await DATASETS.expenses.build(api);
  expect(out.count).toBe(1);
  expect(out.filename).toMatch(/^expenses_export_\d{4}-\d{2}-\d{2}\.csv$/);
  expect(out.csv).toContain('TRANSACTIONS\ndate,type');
  expect(out.csv).toContain("'=cmd");
  expect(out.csv).toContain('BUDGETS\ncategory');
  expect(out.csv).toContain('CARDS\nname');
});

test('lists export as lines with their check marks', async () => {
  const api = { entities: { Note: { list: async () => [{ title: 'Shop', type: 'checklist', items: [{ text: 'milk', done: true }, { text: 'eggs' }], tags: ['home'] }] } } };
  const out = await DATASETS.notes.build(api);
  expect(out.csv).toContain('"[x] milk\n[ ] eggs"');
  expect(out.csv).toContain('home');
});
