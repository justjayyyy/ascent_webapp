// Budgets are per category and month: which categories can still get one, and what each is held against.
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const theme = { t: (k) => k, language: 'en', user: { id: 'u1', currency: 'USD' }, colors: {} };
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => theme }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ currentWorkspace: { ownerId: 'u1' } }) }));
vi.mock('@/hooks/useWorkspaceData', () => ({
  useMoney: () => ({ amountOf: (tx) => tx.amount, convert: (amount) => amount }),
}));

const { default: BudgetManager } = await import('./BudgetManager');
const { default: BudgetProgress } = await import('./BudgetProgress');

const now = new Date();
const year = now.getFullYear();
const thisMonth = now.getMonth() + 1;
const otherMonth = thisMonth === 1 ? 2 : thisMonth - 1;
const food = { id: 'c1', name: 'food', type: 'Expense' };

describe('the budget form', () => {
  test('a category budgeted in another month can still get one for this month', () => {
    // Showing the whole year ("All"): the form is set to this month, where food has no budget yet
    render(<BudgetManager open onClose={() => {}} categories={[food]} selectedYear={String(year)} selectedMonths={[]}
      budgets={[{ id: 'b1', category: 'food', year, month: otherMonth, monthlyLimit: 500 }]} onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText('allCategoriesHaveBudgets')).toBeNull();
    expect(screen.getByLabelText(/monthlyLimit/)).toBeTruthy();
  });

  test('a category already budgeted in the chosen month is not offered again', () => {
    render(<BudgetManager open onClose={() => {}} categories={[food]} selectedYear={String(year)} selectedMonths={[String(thisMonth)]}
      budgets={[{ id: 'b1', category: 'food', year, month: thisMonth, monthlyLimit: 500 }]} onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('allCategoriesHaveBudgets')).toBeTruthy();
  });
});

describe('budget progress', () => {
  test("with two months shown, each month's budget counts only that month's spending", () => {
    const tx = (month, amount) => ({ type: 'Expense', category: 'food', amount, date: `2026-${String(month).padStart(2, '0')}-10` });
    render(<BudgetProgress selectedYear="2026" selectedMonths={['9', '10']} formatCurrency={(v) => `$${v}`}
      budgets={[
        { id: 'sep', category: 'food', year: 2026, month: 9, monthlyLimit: 100 },
        { id: 'oct', category: 'food', year: 2026, month: 10, monthlyLimit: 100 },
      ]}
      transactions={[tx(9, 80), tx(10, 30)]} />);
    // Not 110 spent against each
    expect(screen.getByText('$80 / $100')).toBeTruthy();
    expect(screen.getByText('$30 / $100')).toBeTruthy();
  });
});
