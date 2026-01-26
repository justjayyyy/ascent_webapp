import { useState, useEffect, useCallback } from 'react';

// Cache for exchange rates
const exchangeRateCache = {
  rates: {},
  timestamp: null,
  CACHE_DURATION: 60 * 60 * 1000, // 1 hour
};

/**
 * Hook to convert currency amounts
 * Uses exchangerate-api.com free tier (no API key needed for basic usage)
 */
export function useCurrencyConversion() {
  const [rates, setRates] = useState(exchangeRateCache.rates);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExchangeRates = useCallback(async (baseCurrency = 'USD') => {
    // Check cache first
    const now = Date.now();
    if (
      exchangeRateCache.rates[baseCurrency] &&
      exchangeRateCache.timestamp &&
      now - exchangeRateCache.timestamp < exchangeRateCache.CACHE_DURATION
    ) {
      setRates(exchangeRateCache.rates[baseCurrency]);
      return exchangeRateCache.rates[baseCurrency];
    }

    setIsLoading(true);
    try {
      // Using exchangerate-api.com (free tier, no API key needed, CORS-friendly)
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }
      const data = await response.json();
      
      if (data.rates) {
        // Cache the rates
        exchangeRateCache.rates[baseCurrency] = data.rates;
        exchangeRateCache.timestamp = now;
        setRates(data.rates);
        return data.rates;
      }
      throw new Error('Invalid response from exchange rate API');
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Return cached rates if available, or empty object
      if (exchangeRateCache.rates[baseCurrency]) {
        setRates(exchangeRateCache.rates[baseCurrency]);
        return exchangeRateCache.rates[baseCurrency];
      }
      return {};
    } finally {
      setIsLoading(false);
    }
  }, []);

  const convertCurrency = useCallback((amount, fromCurrency, toCurrency, exchangeRates = rates) => {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    if (!exchangeRates || Object.keys(exchangeRates).length === 0) {
      console.warn(`No exchange rates available. Cannot convert ${fromCurrency} to ${toCurrency}`);
      return amount; // Fallback to original if no rates
    }

    // Get base currency from rates (usually USD)
    const baseCurrency = 'USD'; // exchangerate.host uses USD as base
    
    // If both currencies are in the rates, convert via base
    if (fromCurrency === baseCurrency && exchangeRates[toCurrency]) {
      return amount * exchangeRates[toCurrency];
    }
    
    if (toCurrency === baseCurrency && exchangeRates[fromCurrency]) {
      return amount / exchangeRates[fromCurrency];
    }
    
    // Convert via base currency: fromCurrency -> baseCurrency -> toCurrency
    if (exchangeRates[fromCurrency] && exchangeRates[toCurrency]) {
      const amountInBase = amount / exchangeRates[fromCurrency];
      return amountInBase * exchangeRates[toCurrency];
    }

    // Fallback: return original amount if conversion not available
    console.warn(`Exchange rate not found for ${fromCurrency} or ${toCurrency}`);
    return amount;
  }, [rates]);

  return {
    rates,
    isLoading,
    fetchExchangeRates,
    convertCurrency,
  };
}
