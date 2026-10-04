// Who paid (or received) a transaction in a shared household: changed from its details sheet in one tap.
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const theme = { t: (k) => k, language: 'en', user: { id: 'u1', email: 'dana@x.test', currency: 'USD' }, colors: {} };
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => theme }));
vi.mock('@/hooks/useWorkspaceData', () => ({ useExchangeRates: () => ({ rates: null }) }));
const dana = { email: 'dana@x.test', name: 'Dana', initials: 'DA', isMe: true, color: 'red' };
const alex = { email: 'alex@x.test', name: 'Alex', initials: 'AL', isMe: false, color: 'blue' };
vi.mock('@/hooks/useHousehold', () => ({
  useHousehold: () => ({ members: [dana, alex], byEmail: { [dana.email]: dana, [alex.email]: alex }, isShared: true, meEmail: dana.email }),
}));

const { default: TransactionList } = await import('./TransactionList');

const tx = (extra) => ({ id: 't1', type: 'Expense', amount: 40, currency: 'USD', category: 'groceries', description: 'Market', date: '2026-10-02', created_by: 'dana@x.test', ...extra });
const open = (props) => {
  render(<TransactionList transactions={[props.tx]} onEdit={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Market/ }));
  return screen.getByRole('dialog');
};

describe('who paid, from the details sheet', () => {
  test('starts on whoever added it, and one tap names someone else', () => {
    const onSetPayer = vi.fn();
    const sheet = open({ tx: tx(), onSetPayer });
    const payers = within(sheet).getByRole('radiogroup', { name: 'paidBy' });
    expect(within(payers).getByRole('radio', { name: /hhYou/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(payers).getByRole('radio', { name: /Alex/ }));
    expect(onSetPayer).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'alex@x.test', []);
    expect(within(payers).getByRole('radio', { name: /Alex/ }).getAttribute('aria-checked')).toBe('true');
  });

  test('income asks who received it', () => {
    const sheet = open({ tx: tx({ type: 'Income', category: 'salary', paidBy: 'alex@x.test' }), onSetPayer: vi.fn() });
    const payers = within(sheet).getByRole('radiogroup', { name: 'receivedBy' });
    expect(within(payers).getByRole('radio', { name: /Alex/ }).getAttribute('aria-checked')).toBe('true');
  });

  test('without the right to edit, there is nothing to pick', () => {
    const sheet = open({ tx: tx(), onSetPayer: vi.fn(), canEdit: false });
    expect(within(sheet).queryByRole('radiogroup')).toBeNull();
  });
});
