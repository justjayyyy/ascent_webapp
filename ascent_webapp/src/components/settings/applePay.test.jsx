// The Apple Pay section says why a tap was not added, so a broken Shortcut can be fixed from what it shows.
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const theme = { t: (k, vars) => (vars ? `${k} ${Object.values(vars).join(' ')}` : k), language: 'en' };
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => theme }));
vi.mock('./PushToggle', () => ({ default: () => null }));
const at = '2026-10-16T11:00:00.000Z';
vi.mock('@/api/client', () => ({
  ascent: {
    ingestTokens: {
      list: async () => [{ id: 't1', label: 'iPhone', prefix: 'asc_abcd', lastUsedAt: at }],
      activity: async () => [
        { id: 'e1', outcome: 'rejected', reason: 'amount_unreadable', summary: null, createdAt: at },
        { id: 'e2', outcome: 'created', reason: '', summary: { merchant: 'Aroma', amount: 18, currency: 'ILS' }, createdAt: at },
        { id: 'e3', outcome: 'duplicate', reason: 'cross_source', summary: { merchant: 'Aroma', amount: 18, currency: 'ILS' }, createdAt: at },
      ],
    },
  },
}));

const { default: ApplePaySection } = await import('./ApplePaySection');

describe('Apple Pay activity', () => {
  test('a tap that was not added says why; others say only what happened', async () => {
    render(<QueryClientProvider client={new QueryClient()}><ApplePaySection index={0} /></QueryClientProvider>);
    expect(await screen.findByText('apLastUsed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /apActivity/ }));
    expect(await screen.findByText(/^apOutcome_rejected · apReason_amount_unreadable · /)).toBeTruthy();
    expect(screen.getByText(/^apOutcome_created · [^a]/)).toBeTruthy();
    // Reasons that need no fixing are not spelled out
    expect(screen.getByText(/^apOutcome_duplicate · [^a]/)).toBeTruthy();
  });
});
