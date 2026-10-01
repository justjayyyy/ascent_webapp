import { useCallback } from 'react';
import { convertAmount } from '@shared/money';
import { useExchangeRates } from './useWorkspaceData';

/**
 * The older conversion API, kept for the (hidden) portfolio pages. New code uses useMoney().
 * Rates always come per 1 USD; an amount that cannot be converted is returned unchanged.
 */
export function useCurrencyConversion() {
  const { rates, isLoading } = useExchangeRates();
  const fetchExchangeRates = useCallback(async () => rates || {}, [rates]);
  const convertCurrency = useCallback((amount, from, to) => convertAmount(amount, from, to, rates) ?? amount, [rates]);
  return { rates: rates || {}, isLoading, fetchExchangeRates, convertCurrency };
}
