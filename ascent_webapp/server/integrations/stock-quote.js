import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';

// Stock quote providers configuration
const PROVIDERS = {
  finnhub: {
    name: 'Finnhub',
    baseUrl: 'https://finnhub.io/api/v1',
    getQuoteUrl: (symbol, apiKey) => 
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
    parseResponse: (data) => ({
      price: data.c,           // Current price
      change: data.d,          // Change
      changePercent: data.dp,  // Change percent
      high: data.h,            // Day high
      low: data.l,             // Day low
      open: data.o,            // Open
      previousClose: data.pc,  // Previous close
    }),
  },
  alphavantage: {
    name: 'Alpha Vantage',
    getQuoteUrl: (symbol, apiKey) =>
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`,
    parseResponse: (data) => {
      const quote = data['Global Quote'] || {};
      return {
        price: parseFloat(quote['05. price']) || 0,
        change: parseFloat(quote['09. change']) || 0,
        changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
        high: parseFloat(quote['03. high']) || 0,
        low: parseFloat(quote['04. low']) || 0,
        open: parseFloat(quote['02. open']) || 0,
        previousClose: parseFloat(quote['08. previous close']) || 0,
      };
    },
  },
};

// Cache for stock prices (5 minute TTL)
const priceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedPrice(symbol) {
  const cached = priceCache.get(symbol.toUpperCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedPrice(symbol, data) {
  priceCache.set(symbol.toUpperCase(), {
    data,
    timestamp: Date.now(),
  });
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  // Require authentication
  const user = await authMiddleware(req, res);
  if (!user) return;
  
  if (req.method !== 'GET') {
    return error(res, 'Method not allowed', 405);
  }
  
  try {
    const { symbol, symbols, provider = 'finnhub' } = req.query;
    
    // Determine which API key to use
    const apiKey = provider === 'alphavantage' 
      ? process.env.ALPHAVANTAGE_API_KEY 
      : process.env.FINNHUB_API_KEY;
    
    if (!apiKey) {
      return error(res, `API key not configured for ${provider}. Set ${provider.toUpperCase()}_API_KEY in .env`, 500);
    }
    
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      return error(res, 'Invalid provider. Use: finnhub or alphavantage', 400);
    }
    
    // Handle multiple symbols
    if (symbols) {
      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
      const results = {};
      
      for (const sym of symbolList) {
        // Check cache first
        const cached = getCachedPrice(sym);
        if (cached) {
          results[sym] = { ...cached, cached: true };
          continue;
        }
        
        try {
          const response = await fetch(providerConfig.getQuoteUrl(sym, apiKey));
          const data = await response.json();
          
          if (response.ok && data) {
            const parsed = providerConfig.parseResponse(data);
            parsed.symbol = sym;
            parsed.timestamp = new Date().toISOString();
            parsed.provider = providerConfig.name;
            
            setCachedPrice(sym, parsed);
            results[sym] = parsed;
          } else {
            results[sym] = { error: 'Failed to fetch quote', symbol: sym };
          }
        } catch (err) {
          results[sym] = { error: err.message, symbol: sym };
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }
      
      return success(res, results);
    }
    
    // Handle single symbol
    if (!symbol) {
      return error(res, 'Symbol is required. Use ?symbol=AAPL or ?symbols=AAPL,GOOGL,MSFT', 400);
    }
    
    const upperSymbol = symbol.toUpperCase();
    
    // Check cache first
    const cached = getCachedPrice(upperSymbol);
    if (cached) {
      return success(res, { ...cached, cached: true });
    }
    
    // Fetch from provider
    const response = await fetch(providerConfig.getQuoteUrl(upperSymbol, apiKey));
    const data = await response.json();
    
    if (!response.ok) {
      return error(res, 'Failed to fetch stock quote', response.status);
    }
    
    const parsed = providerConfig.parseResponse(data);
    parsed.symbol = upperSymbol;
    parsed.timestamp = new Date().toISOString();
    parsed.provider = providerConfig.name;
    
    // Cache the result
    setCachedPrice(upperSymbol, parsed);
    
    return success(res, parsed);
    
  } catch (err) {
    return serverError(res, err);
  }
}

