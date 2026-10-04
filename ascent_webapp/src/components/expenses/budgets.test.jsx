// Budgets are per category from a month, repeating or not: which categories can still get one, what each is held
// against, and what changing or removing one in a later month does.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const theme = {
  t: (k, vars) => (vars ? `${k} ${Object.values(vars).join(' ')}` : k), language: 'en', user: { id: 'u1', currency: 'USD' }, colors: {},
};
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => theme }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ currentWorkspace: { ownerId: 'u1' } }) }));
vi.mock('@/hooks/useWorkspaceData', () => ({
  useMoney: () => ({ amountOf: (tx) => tx.amount, convert: (amount) => amount }),
}));

const { default: BudgetManager } = await import('./BudgetManager');
const { default: BudgetProgress, periodMonths } = await import('./BudgetProgress');

const now = new Date();
const year = now.getFullYear();
const thisMonth = now.getMonth() + 1;
const lastMonth = new Date(year, now.getMonth() - 1, 1);
const food = { id: 'c1', name: 'food', type: 'Expense' };
const fun = { id: 'c2', name: 'fun', type: 'Expense' };
const noop = () => {};
const manager = (props) => render(
  <BudgetManager open onClose={noop} categories={[food]} selectedYear={String(year)} selectedMonths={[String(thisMonth)]}
    onAdd={noop} onUpdate={noop} onRemove={noop} onCopy={noop} {...props} />
);

describe('the budget manager', () => {
  test('a category budgeted only in another month can still get one for this month', () => {
    manager({ budgets: [{ id: 'b1', category: 'food', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 500 }] });
    expect(screen.queryByText(/^bdAllBudgeted/)).toBeNull();
    expect(screen.getByLabelText(/monthlyLimit/)).toBeTruthy();
  });

  test('a category with a budget this month, its own or repeating from before, is not offered again', () => {
    manager({ budgets: [{ id: 'b1', category: 'food', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 500, repeat: true }] });
    expect(screen.getByText(/^bdAllBudgeted/)).toBeTruthy();
    expect(screen.getByText(/^bdEverySince/)).toBeTruthy();
  });

  test('a new budget repeats by default and is set for the month on screen', () => {
    const onAdd = vi.fn();
    manager({ budgets: [], onAdd });
    fireEvent.change(screen.getByLabelText(/monthlyLimit/), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: /addBudget/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ category: 'food', monthlyLimit: 400, repeat: true, year, month: thisMonth, alertThreshold: 80 }));
  });

  test('changing a budget repeating from an earlier month starts a new one this month, so earlier months keep theirs', () => {
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    manager({ budgets: [{ id: 'b1', category: 'food', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 500, repeat: true, currency: 'USD' }], onAdd, onUpdate });
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.getByText(/^bdChangesFrom/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/monthlyLimit/), { target: { value: '650' } });
    fireEvent.click(screen.getByRole('button', { name: /updateBudget/ }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ category: 'food', monthlyLimit: 650, repeat: true, year, month: thisMonth }), { edit: true });
  });

  test('a month without budgets offers to copy the last month that had some', () => {
    const onCopy = vi.fn();
    manager({ categories: [food, fun], onCopy, budgets: [
      { id: 'b1', category: 'food', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 500 },
      { id: 'b2', category: 'fun', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 80 },
    ] });
    fireEvent.click(screen.getByRole('button', { name: /^bdCopyFrom/ }));
    expect(onCopy).toHaveBeenCalledWith([
      expect.objectContaining({ category: 'food', monthlyLimit: 500, year, month: thisMonth, repeat: true }),
      expect.objectContaining({ category: 'fun', monthlyLimit: 80, year, month: thisMonth, repeat: true }),
    ]);
  });

  test('removing asks first, and a repeating budget stops from this month', () => {
    const onRemove = vi.fn();
    manager({ onRemove, budgets: [{ id: 'b1', category: 'food', year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1, monthlyLimit: 500, repeat: true }] });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    expect(onRemove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText(/^bdStopBody/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'bdRemove' }));
    const until = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    expect(onRemove).toHaveBeenCalledWith({ updates: [{ id: 'b1', until }], deletes: [] });
  });
});

describe('budget progress', () => {
  // After every month the tests use, unless a test moves it
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 11, 1, 12)); });
  afterAll(() => { vi.useRealTimers(); });
  const tx = (month, amount, extra = {}) => ({ type: 'Expense', category: 'food', amount, date: `2026-${String(month).padStart(2, '0')}-10`, ...extra });

  test('over two months, the limits add up and each counts only its own month', () => {
    render(<BudgetProgress selectedYear="2026" selectedMonths={['9', '10']} formatCurrency={(v) => `$${v}`}
      budgets={[
        { id: 'sep', category: 'food', year: 2026, month: 9, monthlyLimit: 100 },
        { id: 'oct', category: 'food', year: 2026, month: 10, monthlyLimit: 100 },
      ]}
      transactions={[tx(8, 999), tx(9, 80), tx(10, 30)]} />);
    expect(screen.getByText('$110')).toBeTruthy();
    expect(screen.getByText('bdLeftOf $90 $200')).toBeTruthy();
  });

  test('a repeating budget counts in the months after it, and spending in an unbudgeted month does not', () => {
    render(<BudgetProgress selectedYear="2026" selectedMonths={['7', '8', '9']} formatCurrency={(v) => `$${v}`}
      budgets={[{ id: 'aug', category: 'food', year: 2026, month: 8, monthlyLimit: 100, repeat: true }]}
      transactions={[tx(7, 500), tx(8, 50), tx(9, 70)]} />);
    expect(screen.getByText('$120')).toBeTruthy();
    expect(screen.getByText('bdLeftOf $80 $200')).toBeTruthy();
  });

  test('a month with no budgets after one that had some offers to set it up, to those who may', () => {
    const budgets = [{ id: 'aug', category: 'food', year: 2026, month: 8, monthlyLimit: 100 }];
    const { rerender } = render(<BudgetProgress selectedYear="2026" selectedMonths={['9']} formatCurrency={(v) => `$${v}`} budgets={budgets} transactions={[]} onManage={noop} canEdit />);
    expect(screen.getByRole('button', { name: /^bdSetUpMonth/ })).toBeTruthy();
    rerender(<BudgetProgress selectedYear="2026" selectedMonths={['9']} formatCurrency={(v) => `$${v}`} budgets={budgets} transactions={[]} onManage={noop} />);
    expect(screen.queryByRole('button', { name: /^bdSetUpMonth/ })).toBeNull();
  });

  test('what is dated after today is still to come, not spent, and a possible duplicate is neither', () => {
    vi.setSystemTime(new Date(2026, 9, 4, 12));
    render(<BudgetProgress selectedYear="2026" selectedMonths={['10']} formatCurrency={(v) => `$${v}`}
      budgets={[{ id: 'oct', category: 'food', year: 2026, month: 10, monthlyLimit: 600, alertThreshold: 90 }]}
      transactions={[
        { ...tx(10, 180), date: '2026-10-02' },
        { ...tx(10, 300), date: '2026-10-25', isRecurring: true },
        { ...tx(10, 180), date: '2026-10-03', status: 'pending', ingest: { flags: ['possibleDuplicate'] } },
      ]} />);
    // Spent on the right: only what is dated up to today
    expect(screen.getByText('$180')).toBeTruthy();
    expect(screen.getByText('bdComing $300')).toBeTruthy();
    // Left for the rest of the month: 600 less what was spent and what is still to come
    expect(screen.getByText('bdLeftOf $120 $600')).toBeTruthy();
    expect(screen.getByText('bdLeftOfTotal $120 $600')).toBeTruthy();
    vi.setSystemTime(new Date(2026, 11, 1, 12));
  });

  test('the header is the budgeted categories; spending outside them is said apart', () => {
    render(<BudgetProgress selectedYear="2026" selectedMonths={['9']} formatCurrency={(v) => `$${v}`}
      budgets={[{ id: 'sep', category: 'food', year: 2026, month: 9, monthlyLimit: 500 }]}
      transactions={[tx(9, 200), tx(9, 70, { category: 'fun' })]} />);
    expect(screen.getByText('bdOfTotal $200 $500')).toBeTruthy();
    expect(screen.getByText('bdOutside $70')).toBeTruthy();
  });

  test('the whole year means the year so far', () => {
    const at = new Date(2026, 9, 4);
    expect(periodMonths('2026', [], at)).toHaveLength(10);
    expect(periodMonths('2025', [], at)).toHaveLength(12);
    expect(periodMonths('2027', [], at)).toEqual([]);
    expect(periodMonths('2026', ['10', '9'], at)).toEqual(['2026-09', '2026-10']);
  });
});
