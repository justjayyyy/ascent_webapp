// The household's shared lists, one cache entry each per workspace. Every screen reads them through
// these hooks, so a list is fetched once, keyed the same way everywhere, and never shown under the wrong
// workspace after a switch. Invalidate with the first key part, e.g. ['categories'].
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';
import { useWorkspaceId } from '@/lib/AuthContext';
import { useQueuedChanges } from '@/lib/offline/txOutbox';
import { workspaceKey } from '@/lib/workspaceKey';
import { amountInCurrency, convertAmount } from '@shared/money';

const MINUTE = 60 * 1000;

export { workspaceKey };

// Requests name the workspace explicitly, so the data always matches the key it is stored under
const pinned = (workspaceId) => ({ headers: { 'x-workspace-id': workspaceId } });

const LISTS = {
  categories: { load: (ws) => ascent.entities.Category.list('-created_date', 1000, pinned(ws)), staleTime: 5 * MINUTE },
  cards: { load: (ws) => ascent.entities.Card.list('-created_date', 1000, pinned(ws)), staleTime: 5 * MINUTE },
  budgets: { load: (ws) => ascent.entities.Budget.list('-created_date', 1000, pinned(ws)), staleTime: 3 * MINUTE },
  plans: { load: (ws) => ascent.entities.Plan.list('startDate', 1000, pinned(ws)), staleTime: 3 * MINUTE },
  commitments: { load: (ws) => ascent.entities.Commitment.list('-created_date', 1000, pinned(ws)), staleTime: 3 * MINUTE },
  groceries: { load: (ws) => ascent.entities.GroceryItem.list('-created_date', 2000, pinned(ws)), staleTime: MINUTE },
  goals: { load: (ws) => ascent.entities.FinancialGoal.list('created_date', 1000, pinned(ws)), staleTime: 3 * MINUTE },
  tasks: { load: (ws) => ascent.entities.HouseTask.list('dueDate', 1000, pinned(ws)), staleTime: 2 * MINUTE },
  receipts: { load: (ws) => ascent.entities.Receipt.list(pinned(ws)), staleTime: 2 * MINUTE },
};

/**
 * One of the lists above for the workspace on screen, with changes still waiting on this device drawn in
 * (budgets, plans, loans, groceries, savings goals and household tasks save offline). `enabled: false` skips fetching (e.g. without permission).
 */
export function useWorkspaceList(name, { enabled = true } = {}) {
  const workspaceId = useWorkspaceId();
  const { load, staleTime } = LISTS[name];
  const query = useQuery({
    queryKey: workspaceKey(name, workspaceId),
    queryFn: () => load(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime,
  });
  const data = useQueuedChanges(name, query.data);
  // Offline with nothing cached yet: the query is paused, so show what is on the device instead of a spinner
  return data === query.data ? query : { ...query, data, isLoading: query.isPending && query.fetchStatus !== 'paused' };
}

export const useCategories = (opts) => useWorkspaceList('categories', opts);
export const useCards = (opts) => useWorkspaceList('cards', opts);
export const useBudgets = (opts) => useWorkspaceList('budgets', opts);
export const usePlans = (opts) => useWorkspaceList('plans', opts);
export const useCommitments = (opts) => useWorkspaceList('commitments', opts);
export const useGroceries = (opts) => useWorkspaceList('groceries', opts);
export const useGoals = (opts) => useWorkspaceList('goals', opts);
export const useTasks = (opts) => useWorkspaceList('tasks', opts);
export const useReceipts = (opts) => useWorkspaceList('receipts', opts);

/** Whether the AI assistant is set up on the server and switched on for this workspace. */
export function useAssistStatus() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: workspaceKey('assist-status', workspaceId),
    queryFn: () => ascent.assist.status(),
    enabled: !!workspaceId,
    staleTime: 5 * MINUTE,
  });
}

// Exchange rates per 1 USD. Cached for the session and on the device (see offline/persist.js).
export async function fetchExchangeRates() {
  const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
  if (!response.ok) throw new Error(`Exchange rates unavailable (${response.status})`);
  const data = await response.json();
  if (!data?.rates || typeof data.rates !== 'object') throw new Error('Exchange rates unavailable');
  return data.rates;
}

export function useExchangeRates({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: ['exchange-rates', 'USD'],
    queryFn: fetchExchangeRates,
    enabled,
    staleTime: 60 * MINUTE,
    gcTime: 24 * 60 * MINUTE,
    retry: 2,
  });
  return { rates: query.data || null, isLoading: query.isLoading };
}

/**
 * Converters into `currency` with today's rates: `amountOf(tx)` for a transaction (0 when it cannot be
 * converted yet) and `convert(amount, from)` for any amount (null when it cannot).
 */
export function useMoney(currency) {
  const { rates, isLoading } = useExchangeRates();
  const amountOf = useCallback((tx) => amountInCurrency(tx, currency, rates) ?? 0, [currency, rates]);
  // Into any other currency (a plan's, say); older stored conversions are in `currency`, the viewer's
  const amountIn = useCallback(
    (tx, target) => amountInCurrency(tx, target, rates, { legacyCurrency: currency }),
    [currency, rates]
  );
  const convert = useCallback((amount, from) => convertAmount(amount, from || currency, currency, rates), [currency, rates]);
  return { amountOf, amountIn, convert, rates, isLoading };
}
