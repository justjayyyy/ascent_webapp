import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCategories, useCards, useBudgets, useMoney, useAssistStatus, workspaceKey, fetchExchangeRates } from './useWorkspaceData';

const state = vi.hoisted(() => ({ workspaceId: 'w1' }));
const api = vi.hoisted(() => ({ categoryList: vi.fn(), cardList: vi.fn(), budgetList: vi.fn(), assistStatus: vi.fn() }));

vi.mock('@/lib/AuthContext', () => ({ useWorkspaceId: () => state.workspaceId }));
vi.mock('@/api/client', () => ({
  ascent: {
    entities: {
      Category: { list: api.categoryList },
      Card: { list: api.cardList },
      Budget: { list: api.budgetList },
    },
    assist: { status: api.assistStatus },
  },
}));

let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.workspaceId = 'w1';
  Object.values(api).forEach((f) => f.mockReset());
  api.categoryList.mockImplementation(async (_s, _l, opts) => [{ name: `cat-of-${opts.headers['x-workspace-id']}` }]);
});

describe('workspace lists', () => {
  test('cached under [name, workspace] and fetched for that workspace explicitly', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ name: 'cat-of-w1' }]));
    expect(api.categoryList).toHaveBeenCalledWith('-created_date', 1000, { headers: { 'x-workspace-id': 'w1' } });
    expect(client.getQueryData(['categories', 'w1'])).toEqual([{ name: 'cat-of-w1' }]);
  });

  test('after a switch the other workspace\'s list is never shown under the new one', async () => {
    const { result, rerender } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0].name).toBe('cat-of-w1'));
    state.workspaceId = 'w2';
    rerender();
    expect(result.current.data?.[0]?.name).not.toBe('cat-of-w1');
    await waitFor(() => expect(result.current.data?.[0].name).toBe('cat-of-w2'));
    // and going back is instant: w1 is still cached under its own key
    state.workspaceId = 'w1';
    rerender();
    expect(result.current.data?.[0].name).toBe('cat-of-w1');
  });

  test('nothing is fetched before the workspace is known, or when disabled', async () => {
    state.workspaceId = null;
    renderHook(() => useCards(), { wrapper });
    renderHook(() => useBudgets({ enabled: false }), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.cardList).not.toHaveBeenCalled();
    expect(api.budgetList).not.toHaveBeenCalled();
  });

  test('two screens using the same list share one request', async () => {
    api.cardList.mockResolvedValue([{ id: 'c1' }]);
    const a = renderHook(() => useCards(), { wrapper });
    const b = renderHook(() => useCards(), { wrapper });
    await waitFor(() => expect(b.result.current.data).toEqual([{ id: 'c1' }]));
    expect(a.result.current.data).toEqual([{ id: 'c1' }]);
    expect(api.cardList).toHaveBeenCalledTimes(1);
  });

  test('the AI assistant status belongs to the workspace too', async () => {
    api.assistStatus.mockResolvedValue({ ai: { enabled: true } });
    const { result } = renderHook(() => useAssistStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ ai: { enabled: true } }));
    expect(client.getQueryData(workspaceKey('assist-status', 'w1'))).toEqual({ ai: { enabled: true } });
  });
});

describe('money', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rates: { USD: 1, ILS: 4, EUR: 0.8 } }), { status: 200 })));
  });

  test('converts transactions and amounts into the viewer\'s currency once rates arrive', async () => {
    const { result } = renderHook(() => useMoney('ILS'), { wrapper });
    expect(result.current.amountOf({ amount: 10, currency: 'USD' })).toBe(0); // no rates yet: counted as nothing, never as 10 ILS
    expect(result.current.convert(10, 'USD')).toBeNull();
    await waitFor(() => expect(result.current.rates).not.toBeNull());
    expect(result.current.amountOf({ amount: 10, currency: 'USD' })).toBe(40);
    expect(result.current.amountOf({ amount: 7, currency: 'ILS' })).toBe(7);
    expect(result.current.convert(8, 'EUR')).toBe(40);
    expect(result.current.amountIn({ amount: 10, currency: 'USD', amountInGlobalCurrency: 41 }, 'EUR')).toBe(8);
  });

  test('rates are fetched once and shared', async () => {
    const a = renderHook(() => useMoney('ILS'), { wrapper });
    renderHook(() => useMoney('EUR'), { wrapper });
    await waitFor(() => expect(a.result.current.rates).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a bad answer from the rates service is an error, not empty rates', async () => {
    fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(fetchExchangeRates()).rejects.toThrow('Exchange rates unavailable');
    fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchExchangeRates()).rejects.toThrow('503');
  });
});
