import React, { useState, useEffect, useMemo } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, RefreshCw, Loader2, TrendingUp, TrendingDown, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PositionTable from '../components/portfolio/PositionTable';
import AddPositionDialog from '../components/portfolio/AddPositionDialog';
import AddAccountDialog from '../components/portfolio/AddAccountDialog';
import SellPositionDialog from '../components/portfolio/SellPositionDialog';
import TransactionHistory from '../components/portfolio/TransactionHistory';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { useTheme } from '../components/ThemeProvider';
import { cn } from '@/lib/utils';
import BlurValue from '../components/BlurValue';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

const COLORS = ['#5C8374', '#9EC8B9', '#1B4242', '#60A5FA', '#A78BFA', '#F59E0B', '#EF4444'];

export default function AccountDetail() {
  const { colors, theme, t, user: themeUser } = useTheme();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = themeUser?.currency || 'USD';
  const [user, setUser] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [addDayTradeOpen, setAddDayTradeOpen] = useState(false);
  const [editingDayTrade, setEditingDayTrade] = useState(null);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('30D');
  const [sellPositionDialog, setSellPositionDialog] = useState({ open: false, position: null });
  const [selectedPositionSymbol, setSelectedPositionSymbol] = useState(null);
  const queryClient = useQueryClient();

  // Fetch exchange rates on mount
  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await ascent.auth.me();
        setUser(currentUser);
      } catch (error) {
        ascent.auth.redirectToLogin();
      }
    };
    loadUser();

    const urlParams = new URLSearchParams(window.location.search);
    setAccountId(urlParams.get('id'));
  }, []);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', accountId],
    queryFn: async () => {
      try {
        const account = await ascent.entities.Account.get(accountId);
        return account || null;
      } catch (error) {
        console.error('Failed to fetch account:', error);
        return null;
      }
    },
    enabled: !!accountId,
  });

  const { data: positions = [], isLoading: positionsLoading } = useQuery({
    queryKey: ['positions', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      return await ascent.entities.Position.filter({ accountId }, '-created_date');
    },
    enabled: !!accountId,
  });

  const { data: dayTrades = [], isLoading: dayTradesLoading } = useQuery({
    queryKey: ['dayTrades', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      return await ascent.entities.DayTrade.filter({ accountId }, '-date');
    },
    enabled: !!accountId,
  });

  const { data: portfolioTransactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['portfolioTransactions', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      return await ascent.entities.PortfolioTransaction.filter({ accountId }, '-date');
    },
    enabled: !!accountId,
  });

  // Calculate total cash from all cash positions for this account only, converted to account currency
  const totalCashBalance = useMemo(() => {
    const accountCurrency = account?.baseCurrency || 'USD';
    const cashPositions = positions.filter(p => p.assetType === 'Cash' && p.accountId === accountId);
    
    if (cashPositions.length === 0) return 0;
    
    // Helper to convert amount to account currency
    const convertToAccountCurrency = (amount, fromCurrency) => {
      if (!fromCurrency || fromCurrency === accountCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, fromCurrency, accountCurrency, rates);
      }
      return amount;
    };
    
    return cashPositions.reduce((sum, p) => {
      const cashCurrency = p.currency || accountCurrency;
      const convertedAmount = convertToAccountCurrency(p.quantity || 0, cashCurrency);
      return sum + convertedAmount;
    }, 0);
  }, [positions, accountId, account?.baseCurrency, rates, convertCurrency]);

  const createPositionMutation = useMutation({
    mutationFn: async (positionData) => {
      const { deductFromCash, ...data } = positionData;
      const purchaseCost = data.quantity * data.averageBuyPrice;
      
      // If it's not a cash position and user wants to deduct from cash
      if (deductFromCash && data.assetType !== 'Cash') {
        if (totalCashBalance < purchaseCost) {
          throw new Error(`Insufficient cash. Available: ${formatCurrency(totalCashBalance, account.baseCurrency)}, Required: ${formatCurrency(purchaseCost, account.baseCurrency)}`);
        }
        
        // Deduct from cash positions for this account only (FIFO - oldest first)
        let remainingToDeduct = purchaseCost;
        const cashPositions = positions
          .filter(p => p.assetType === 'Cash' && p.accountId === accountId)
          .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        
        for (const cashPos of cashPositions) {
          if (remainingToDeduct <= 0) break;
          
          const deductAmount = Math.min(cashPos.quantity, remainingToDeduct);
          const newQuantity = cashPos.quantity - deductAmount;
          
          if (newQuantity <= 0) {
            // Delete empty cash position
            await ascent.entities.Position.delete(cashPos.id);
          } else {
            await ascent.entities.Position.update(cashPos.id, { quantity: newQuantity });
          }
          
          remainingToDeduct -= deductAmount;
        }
      }
      
      // Create the position - include Option-specific fields if assetType is Option
      const positionPayload = { ...data, accountId };
      if (data.assetType === 'Option') {
        positionPayload.strikePrice = data.strikePrice || null;
        positionPayload.expirationDate = data.expirationDate || null;
        positionPayload.optionType = data.optionType || null;
        positionPayload.optionAction = data.optionAction || null;
        positionPayload.premiumPrice = data.premiumPrice || null;
        positionPayload.stockPriceAtPurchase = data.stockPriceAtPurchase || null;
        // For options, use premiumPrice as averageBuyPrice
        if (data.premiumPrice) {
          positionPayload.averageBuyPrice = parseFloat(data.premiumPrice) || 0;
        }
      } else {
        // Remove Option-specific fields for non-Option asset types
        delete positionPayload.strikePrice;
        delete positionPayload.expirationDate;
        delete positionPayload.optionType;
        delete positionPayload.optionAction;
        delete positionPayload.premiumPrice;
        delete positionPayload.stockPriceAtPurchase;
      }
      const newPosition = await ascent.entities.Position.create(positionPayload);
      
      // Log the transaction
      const transactionType = data.assetType === 'Cash' ? 'deposit' : 'buy';
      await ascent.entities.PortfolioTransaction.create({
        accountId,
        type: transactionType,
        symbol: data.assetType === 'Cash' ? null : data.symbol,
        assetType: data.assetType,
        quantity: data.quantity,
        pricePerUnit: data.averageBuyPrice,
        totalAmount: purchaseCost,
        currency: data.currency || account.baseCurrency,
        date: data.date || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
        positionId: newPosition.id
      });
      
      return newPosition;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioTransactions', accountId] });
      setAddPositionOpen(false);
      setEditingPosition(null);
      if (variables.assetType === 'Cash') {
        toast.success(t('depositRecorded') || 'Cash deposit recorded!');
      } else {
        toast.success(t('buyRecorded') || 'Position purchased!');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add position');
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Position.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      setAddPositionOpen(false);
      setEditingPosition(null);
      toast.success('Position updated successfully!');
    },
    onError: () => {
      toast.error('Failed to update position');
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: (positionId) => ascent.entities.Position.delete(positionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      toast.success(t('positionDeleted') || 'Position deleted!');
    },
    onError: () => {
      toast.error('Failed to delete position');
    },
  });

  const sellPositionMutation = useMutation({
    mutationFn: async (sellData) => {
      const { positionId, quantity, sellPrice, totalProceeds, profitLoss, returnToCash, notes, isPartialSell, remainingQuantity, originalPositions } = sellData;
      
      // Handle aggregated positions (multiple positions combined)
      if (originalPositions && originalPositions.length > 0) {
        // Sort by date (FIFO - oldest first)
        const sortedPositions = [...originalPositions].sort((a, b) => 
          new Date(a.created_date || a.date) - new Date(b.created_date || b.date)
        );
        
        let remainingToSell = quantity;
        
        for (const pos of sortedPositions) {
          if (remainingToSell <= 0) break;
          
          const sellFromThis = Math.min(pos.quantity, remainingToSell);
          const newQuantity = pos.quantity - sellFromThis;
          
          if (newQuantity <= 0) {
            // Delete position entirely
            await ascent.entities.Position.delete(pos.id);
          } else {
            // Update with remaining quantity
            await ascent.entities.Position.update(pos.id, { quantity: newQuantity });
          }
          
          remainingToSell -= sellFromThis;
        }
      } else {
        // Single position sell
        const position = positions.find(p => p.id === positionId);
        if (!position) throw new Error('Position not found');
        
        if (isPartialSell && remainingQuantity > 0) {
          await ascent.entities.Position.update(positionId, { quantity: remainingQuantity });
        } else {
          await ascent.entities.Position.delete(positionId);
        }
      }
      
      // Get position info for logging
      const positionInfo = originalPositions?.[0] || positions.find(p => p.id === positionId);
      
      // Add proceeds to cash if requested
      if (returnToCash) {
        await ascent.entities.Position.create({
          accountId,
          symbol: 'CASH',
          assetType: 'Cash',
          quantity: totalProceeds,
          averageBuyPrice: 1,
          currency: positionInfo?.currency || account.baseCurrency,
          date: new Date().toISOString().split('T')[0],
          notes: `Proceeds from selling ${quantity} ${positionInfo?.symbol}`
        });
      }
      
      // Log the sell transaction
      await ascent.entities.PortfolioTransaction.create({
        accountId,
        type: 'sell',
        symbol: positionInfo?.symbol,
        assetType: positionInfo?.assetType,
        quantity: quantity,
        pricePerUnit: sellPrice,
        totalAmount: totalProceeds,
        currency: positionInfo?.currency || account.baseCurrency,
        date: new Date().toISOString().split('T')[0],
        notes: notes || `P&L: ${profitLoss >= 0 ? '+' : ''}${formatCurrency(profitLoss, account.baseCurrency)}`,
        positionId: positionId || originalPositions?.[0]?.id
      });
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioTransactions', accountId] });
      setSellPositionDialog({ open: false, position: null });
      toast.success(t('sellRecorded') || 'Position sold!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to sell position');
    },
  });

  const createDayTradeMutation = useMutation({
    mutationFn: (tradeData) => ascent.entities.DayTrade.create({ ...tradeData, accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dayTrades', accountId] });
      setAddDayTradeOpen(false);
      setEditingDayTrade(null);
      toast.success('Day trade added successfully!');
    },
    onError: () => {
      toast.error('Failed to add day trade');
    },
  });

  const updateDayTradeMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.DayTrade.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dayTrades', accountId] });
      setAddDayTradeOpen(false);
      setEditingDayTrade(null);
      toast.success('Day trade updated successfully!');
    },
    onError: () => {
      toast.error('Failed to update day trade');
    },
  });

  const deleteDayTradeMutation = useMutation({
    mutationFn: (tradeId) => ascent.entities.DayTrade.delete(tradeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dayTrades', accountId] });
      toast.success('Day trade deleted successfully!');
    },
    onError: () => {
      toast.error('Failed to delete day trade');
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Account.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', accountId] });
      setEditAccountOpen(false);
      toast.success('Account updated successfully!');
    },
    onError: () => {
      toast.error('Failed to update account');
    },
  });

  const handleRefreshPrices = async () => {
    // Filter positions to only include those for this account
    const accountPositions = positions.filter(p => p.accountId === accountId);
    if (accountPositions.length === 0) return;
    
    setRefreshingPrices(true);
    try {
      const symbols = [...new Set(accountPositions.map(p => p.symbol))];
      
      // Use the new stock quote API
      const quotes = await ascent.integrations.Core.getStockQuotes(symbols);
      
      let updatedCount = 0;
      for (const position of accountPositions) {
        const symbolUpper = position.symbol.toUpperCase();
        const quote = quotes[symbolUpper] || quotes[position.symbol];
        
        if (quote && quote.price && quote.price > 0 && !quote.error) {
          await ascent.entities.Position.update(position.id, {
            currentPrice: quote.price,
            lastPriceUpdate: new Date().toISOString(),
          });
          updatedCount++;
        } else if (quote?.error) {
          console.warn(`Failed to get quote for ${position.symbol}:`, quote.error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      
      if (updatedCount > 0) {
        toast.success(`Updated prices for ${updatedCount} position${updatedCount > 1 ? 's' : ''}!`);
      } else {
        toast.warning('No prices updated. Check if symbol is valid (e.g., AAPL, GOOGL)');
      }
    } catch (error) {
      console.error('Price refresh error:', error);
      toast.error(error.message || 'Failed to update prices');
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleAddPosition = async (positionData) => {
    if (editingPosition) {
      await updatePositionMutation.mutateAsync({ id: editingPosition.id, data: positionData });
    } else {
      await createPositionMutation.mutateAsync(positionData);
    }
  };

  const handleAddDayTrade = async (tradeData) => {
    if (editingDayTrade) {
      await updateDayTradeMutation.mutateAsync({ id: editingDayTrade.id, data: tradeData });
    } else {
      await createDayTradeMutation.mutateAsync(tradeData);
    }
  };

  const formatCurrency = (value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const calculateAccountMetrics = () => {
    let totalValue = 0;
    let totalCostBasis = 0;
    const accountCurrency = account?.baseCurrency || 'USD';

    // Helper to convert position value to account currency
    const convertToAccountCurrency = (amount, positionCurrency) => {
      if (!positionCurrency || positionCurrency === accountCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, positionCurrency, accountCurrency, rates);
      }
      return amount;
    };

    // Filter positions to only include those for this account
    const accountPositions = positions.filter(p => p.accountId === accountId);
    
    // Process ALL positions for this account, including Cash and edge cases
    accountPositions.forEach(position => {
      const quantity = position.quantity || 0;
      const positionCurrency = position.currency || accountCurrency;
      
      let marketValue, costBasis;
      
      if (position.assetType === 'Option') {
        // Options: use premiumPrice, multiply by 100 (standard contract multiplier)
        const premiumPrice = position.premiumPrice || position.averageBuyPrice || 0;
        const currentPremium = position.currentPrice || premiumPrice;
        const contractMultiplier = 100;
        marketValue = quantity * currentPremium * contractMultiplier;
        costBasis = quantity * premiumPrice * contractMultiplier;
      } else if (position.assetType === 'Cash') {
        // For Cash positions, price is always 1
        const currentPrice = 1;
        const averageBuyPrice = 1;
        marketValue = quantity * currentPrice;
        costBasis = quantity * averageBuyPrice;
      } else {
        // Standard positions
        const averageBuyPrice = position.averageBuyPrice || 0;
        const currentPrice = position.currentPrice || position.averageBuyPrice || 0;
        marketValue = quantity * currentPrice;
        costBasis = quantity * averageBuyPrice;
      }
      
      // Convert to account currency before summing
      const convertedMarketValue = convertToAccountCurrency(marketValue, positionCurrency);
      const convertedCostBasis = convertToAccountCurrency(costBasis, positionCurrency);
      
      totalValue += convertedMarketValue;
      totalCostBasis += convertedCostBasis;
    });

    const positionPnL = totalValue - totalCostBasis;
    
    // Filter day trades to only include those for this account
    const accountDayTrades = dayTrades.filter(dt => dt.accountId === accountId);
    
    // Add day trading P&L (convert to account currency)
    const dayTradingPnL = accountDayTrades.reduce((sum, trade) => {
      const tradeCurrency = trade.currency || accountCurrency;
      const convertedPnL = convertToAccountCurrency(trade.profitLoss, tradeCurrency);
      return sum + convertedPnL;
    }, 0);
    
    const totalPnL = positionPnL + dayTradingPnL;
    const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    // Convert to user's global currency if needed
    const convertAmount = (amount) => {
      if (accountCurrency === userCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, accountCurrency, userCurrency, rates);
      }
      return amount;
    };

    return { 
      totalValue: convertAmount(totalValue), 
      totalPnL: convertAmount(totalPnL), 
      totalPnLPercent, 
      dayTradingPnL: convertAmount(dayTradingPnL),
      originalTotalValue: totalValue, // Now in account currency
      originalTotalPnL: totalPnL // Now in account currency
    };
  };

  const getChartData = () => {
    const metrics = calculateAccountMetrics();
    const accountCurrency = account?.baseCurrency || 'USD';
    const displayCurrency = (accountCurrency !== 'USD') ? accountCurrency : userCurrency;
    
    // Helper to convert amount to display currency
    const convertToDisplayCurrency = (amount, fromCurrency = accountCurrency) => {
      if (fromCurrency === displayCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, fromCurrency, displayCurrency, rates);
      }
      return amount;
    };
    
    // Filter positions to only include those for this account
    const accountPositions = positions.filter(p => p.accountId === accountId);
    
    // Aggregate positions by symbol - include Cash positions grouped by currency
    const aggregated = {};
    
    accountPositions.forEach((position, index) => {
      // Handle positions with missing symbols
      let symbol = position.symbol;
      const originalSymbol = symbol;
      
      // Handle Cash positions - group by currency
      if (position.assetType === 'Cash') {
        const cashCurrency = position.currency || accountCurrency;
        symbol = `Cash (${cashCurrency})`;
      } else if (!symbol || (typeof symbol === 'string' && symbol.trim() === '')) {
        symbol = `Unknown-${position.id}`;
      }
      
      // Calculate market value
      const quantity = position.quantity || 0;
      let currentPrice, marketValue;
      
      if (position.assetType === 'Option') {
        // Options: use premiumPrice, multiply by 100 (standard contract multiplier)
        const premiumPrice = position.premiumPrice || position.averageBuyPrice || 0;
        currentPrice = position.currentPrice || premiumPrice;
        const contractMultiplier = 100;
        marketValue = quantity * currentPrice * contractMultiplier;
      } else if (position.assetType === 'Cash') {
        // Cash: use quantity as value (already in its currency)
        marketValue = quantity;
      } else {
        currentPrice = position.currentPrice || position.averageBuyPrice || 0;
        marketValue = quantity * currentPrice;
      }
      
      const positionCurrency = position.currency || accountCurrency;
      const convertedValue = convertToDisplayCurrency(marketValue, positionCurrency);
      
      // Initialize if doesn't exist
      if (!aggregated[symbol]) {
        aggregated[symbol] = { name: symbol, value: 0, originalValue: 0 };
      }
      
      // Sum values for positions with the same symbol (use converted value)
      aggregated[symbol].value += convertedValue;
      aggregated[symbol].originalValue += marketValue; // Keep original for reference
    });
    
    // Convert to array and calculate percentages - include ALL positions
    // Ensure minimum value of 0.01 for very small positions so they still render in pie chart
    const chartData = Object.values(aggregated)
      .map(item => {
        // Use minimum value to ensure slice is visible (Recharts may skip 0 values)
        const displayValue = Math.max(item.value, 0.01);
        const percentage = metrics.totalValue > 0 ? (item.value / metrics.totalValue) * 100 : 0;
        return {
          ...item,
          value: item.value, // Converted value in global currency
          displayValue: displayValue, // Use for chart rendering
          percentage: percentage.toFixed(1),
          rawPercentage: percentage, // Keep raw number for calculations
        };
      })
      .sort((a, b) => b.value - a.value);
    
    // Verify we're not missing any positions (positions can be aggregated, so chartData can be <= positions.length)
    const chartSymbols = new Set(chartData.map(item => item.name));
    const positionSymbols = new Map(); // Use Map to track count of positions per symbol
    
    accountPositions.forEach(p => {
      let symbol = p.symbol;
      
      // Handle Cash positions - group by currency (matching aggregation logic)
      if (p.assetType === 'Cash') {
        const cashCurrency = p.currency || accountCurrency;
        symbol = `Cash (${cashCurrency})`;
      } else if (!symbol || (typeof symbol === 'string' && symbol.trim() === '')) {
        symbol = `Unknown-${p.id}`;
      }
      
      // Track how many positions map to each symbol
      if (!positionSymbols.has(symbol)) {
        positionSymbols.set(symbol, []);
      }
      
      // Calculate value for verification
      let value;
      if (p.assetType === 'Cash') {
        value = p.quantity || 0;
      } else if (p.assetType === 'Option') {
        const premiumPrice = p.premiumPrice || p.averageBuyPrice || 0;
        const currentPrice = p.currentPrice || premiumPrice;
        const contractMultiplier = 100;
        value = (p.quantity || 0) * currentPrice * contractMultiplier;
      } else {
        value = (p.quantity || 0) * (p.currentPrice || p.averageBuyPrice || 0);
      }
      
      positionSymbols.get(symbol).push({
        id: p.id,
        symbol: p.symbol,
        assetType: p.assetType,
        quantity: p.quantity,
        value: value
      });
    });
    
    const missingSymbols = Array.from(positionSymbols.keys()).filter(s => !chartSymbols.has(s));
    if (missingSymbols.length > 0) {
      console.error('Missing symbols from chart:', missingSymbols);
    }
    
    // Verify all positions are accounted for in the aggregated values
    const chartTotalValue = chartData.reduce((sum, item) => sum + item.value, 0);
    const positionsTotalValue = metrics.totalValue;
    if (Math.abs(chartTotalValue - positionsTotalValue) > 0.01) {
      console.warn(`Value mismatch: Chart total (${chartTotalValue}) vs Positions total (${positionsTotalValue})`);
    }
    
    return chartData;
  };

  // Get real portfolio performance data based on actual positions
  const getPerformanceData = () => {
    const data = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const accountCurrency = account?.baseCurrency || 'USD';
    const displayCurrency = (accountCurrency !== 'USD') ? accountCurrency : userCurrency;
    
    // Helper to convert amount to display currency
    const convertToDisplayCurrency = (amount, fromCurrency = accountCurrency) => {
      if (fromCurrency === displayCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, fromCurrency, displayCurrency, rates);
      }
      return amount;
    };
    
    // Determine number of days based on time range
    const daysMap = {
      '7D': 7,
      '30D': 30,
      '90D': 90,
      '1Y': 365,
      'ALL': 365,
    };
    const days = daysMap[timeRange] || 30;
    
    // Determine sampling interval to reduce data points
    let sampleInterval = 1;
    if (days >= 365) {
      sampleInterval = 14; // Bi-weekly for 1Y+
    } else if (days >= 90) {
      sampleInterval = 7; // Weekly for 90D+
    } else if (days >= 30) {
      sampleInterval = 3; // Every 3 days for 30D
    } else if (days >= 14) {
      sampleInterval = 2; // Every 2 days for 14D+
    }
    
    // Build a timeline of portfolio value based on when positions were added
    // Each position contributes to portfolio value from its creation date
    for (let i = days - 1; i >= 0; i--) {
      // Sample at intervals (but always include first and last day)
      if (i !== 0 && i !== days - 1 && i % sampleInterval !== 0) {
        continue;
      }
      
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split('T')[0];
      
      // Calculate portfolio value at this date
      // Only include positions that existed on or before this date
      let portfolioValue = 0;
      let costBasis = 0;
      
      // Filter positions to only include those for this account (including Cash)
      const accountPositions = positions.filter(p => p.accountId === accountId);
      
      accountPositions.forEach(position => {
        const positionDate = new Date(position.date || position.created_date);
        positionDate.setHours(0, 0, 0, 0);
        
        // Only count positions that existed on this date
        if (positionDate <= date) {
          const positionCurrency = position.currency || accountCurrency;
          
          if (position.assetType === 'Cash') {
            // Cash: value is the quantity (doesn't change over time)
            const cashValue = position.quantity || 0;
            // Convert cash to account currency first, then to display currency
            const convertedCashValue = convertToDisplayCurrency(cashValue, positionCurrency);
            portfolioValue += convertedCashValue;
            costBasis += convertedCashValue; // Cash has no P&L, cost basis equals value
          } else {
            let currentPrice, buyPrice;
            const contractMultiplier = 100;
            
            if (position.assetType === 'Option') {
              buyPrice = position.premiumPrice || position.averageBuyPrice || 0;
              currentPrice = position.currentPrice || buyPrice;
              // Calculate days since position was added
              const daysSincePosition = Math.max(0, Math.floor((date - positionDate) / 86400000));
              const totalDays = Math.max(1, Math.floor((today - positionDate) / 86400000));
              // Linear interpolation from buy price to current price
              const progress = totalDays > 0 ? daysSincePosition / totalDays : 1;
              const interpolatedPrice = buyPrice + (currentPrice - buyPrice) * progress;
              const positionValue = position.quantity * interpolatedPrice * contractMultiplier;
              const positionCost = position.quantity * buyPrice * contractMultiplier;
              // Convert to display currency
              portfolioValue += convertToDisplayCurrency(positionValue, positionCurrency);
              costBasis += convertToDisplayCurrency(positionCost, positionCurrency);
            } else {
              currentPrice = position.currentPrice || position.averageBuyPrice;
              buyPrice = position.averageBuyPrice;
              // Calculate days since position was added
              const daysSincePosition = Math.max(0, Math.floor((date - positionDate) / 86400000));
              const totalDays = Math.max(1, Math.floor((today - positionDate) / 86400000));
              // Linear interpolation from buy price to current price
              const progress = totalDays > 0 ? daysSincePosition / totalDays : 1;
              const interpolatedPrice = buyPrice + (currentPrice - buyPrice) * progress;
              const positionValue = position.quantity * interpolatedPrice;
              const positionCost = position.quantity * buyPrice;
              // Convert to display currency
              portfolioValue += convertToDisplayCurrency(positionValue, positionCurrency);
              costBasis += convertToDisplayCurrency(positionCost, positionCurrency);
            }
          }
        }
      });
      
      // Values are already converted to display currency above
      const convertedValue = portfolioValue;
      const convertedCostBasis = costBasis;
      const convertedPnL = convertedValue - convertedCostBasis;
      
      data.push({
        date: dateStr,
        value: Math.round(convertedValue * 100) / 100,
        costBasis: Math.round(convertedCostBasis * 100) / 100,
        pnl: Math.round(convertedPnL * 100) / 100,
      });
    }
    
    return data;
  };

  // Get performance data for a specific position
  const getPositionPerformanceData = (symbol) => {
    if (!symbol) return [];
    const accountCurrency = account?.baseCurrency || 'USD';
    const displayCurrency = (accountCurrency !== 'USD') ? accountCurrency : userCurrency;
    
    // Helper to convert amount to display currency
    const convertToDisplayCurrency = (amount, fromCurrency = accountCurrency) => {
      if (fromCurrency === displayCurrency) {
        return amount;
      }
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(amount, fromCurrency, displayCurrency, rates);
      }
      return amount;
    };
    
    // Get all positions with this symbol for this account only
    const symbolPositions = positions.filter(p => p.symbol === symbol && p.accountId === accountId);
    if (symbolPositions.length === 0) return [];
    
    const data = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find earliest position date for this symbol
    const earliestDate = symbolPositions.reduce((earliest, pos) => {
      const posDate = new Date(pos.date || pos.created_date);
      return posDate < earliest ? posDate : earliest;
    }, new Date());
    earliestDate.setHours(0, 0, 0, 0);
    
    // Calculate total quantity and weighted average buy price
    const isOption = symbolPositions[0]?.assetType === 'Option';
    const contractMultiplier = isOption ? 100 : 1;
    
    const totalQuantity = symbolPositions.reduce((sum, p) => sum + p.quantity, 0);
    const totalCost = symbolPositions.reduce((sum, p) => {
      if (p.assetType === 'Option') {
        const premiumPrice = p.premiumPrice || p.averageBuyPrice || 0;
        return sum + (p.quantity * premiumPrice * contractMultiplier);
      }
      return sum + (p.quantity * p.averageBuyPrice);
    }, 0);
    const avgBuyPrice = totalQuantity > 0 ? totalCost / (totalQuantity * contractMultiplier) : 0;
    const currentPrice = isOption 
      ? (symbolPositions[0].currentPrice || symbolPositions[0].premiumPrice || avgBuyPrice)
      : (symbolPositions[0].currentPrice || avgBuyPrice);
    
    // Calculate days since first purchase
    const daysSinceStart = Math.max(1, Math.floor((today - earliestDate) / 86400000));
    
    // Determine sampling interval based on time range - more aggressive reduction
    let sampleInterval = 1;
    if (daysSinceStart > 365) {
      sampleInterval = 14; // Bi-weekly for > 1 year
    } else if (daysSinceStart > 180) {
      sampleInterval = 7; // Weekly for > 6 months
    } else if (daysSinceStart > 90) {
      sampleInterval = 5; // Every 5 days for > 3 months
    } else if (daysSinceStart > 30) {
      sampleInterval = 3; // Every 3 days for > 1 month
    }
    
    let dayCounter = 0;
    
    for (let i = 0; i <= daysSinceStart; i++) {
      // Sample at intervals
      if (i !== 0 && i !== daysSinceStart && dayCounter % sampleInterval !== 0) {
        dayCounter++;
        continue;
      }
      
      const date = new Date(earliestDate);
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split('T')[0];
      
      // Calculate cumulative quantity and value at this date
      let cumulativeQuantity = 0;
      let cumulativeCost = 0;
      
      symbolPositions.forEach(pos => {
        const posDate = new Date(pos.date || pos.created_date);
        posDate.setHours(0, 0, 0, 0);
        
        if (posDate <= date) {
          cumulativeQuantity += pos.quantity;
          if (pos.assetType === 'Option') {
            const premiumPrice = pos.premiumPrice || pos.averageBuyPrice || 0;
            const contractMultiplier = 100;
            cumulativeCost += pos.quantity * premiumPrice * contractMultiplier;
          } else {
            cumulativeCost += pos.quantity * pos.averageBuyPrice;
          }
        }
      });
      
      if (cumulativeQuantity === 0) {
        dayCounter++;
        continue;
      }
      
      const avgCost = cumulativeQuantity > 0 ? cumulativeCost / cumulativeQuantity : 0;
      
      // Check if this is an option position
      const isOption = symbolPositions[0]?.assetType === 'Option';
      const contractMultiplier = isOption ? 100 : 1;
      
      // Linear interpolation to current price
      const progress = daysSinceStart > 0 ? i / daysSinceStart : 1;
      let interpolatedPrice, currentValue;
      
      if (isOption) {
        const avgPremium = avgCost / contractMultiplier;
        const currentPremium = symbolPositions[0].currentPrice || avgPremium;
        interpolatedPrice = avgPremium + (currentPremium - avgPremium) * progress;
        currentValue = cumulativeQuantity * interpolatedPrice * contractMultiplier;
      } else {
        interpolatedPrice = avgCost + (currentPrice - avgCost) * progress;
        currentValue = cumulativeQuantity * interpolatedPrice;
      }
      
      const pnl = currentValue - cumulativeCost;
      const pnlPercent = cumulativeCost > 0 ? (pnl / cumulativeCost) * 100 : 0;
      
      // Convert to display currency
      const convertedValue = convertToDisplayCurrency(currentValue);
      const convertedCostBasis = convertToDisplayCurrency(cumulativeCost);
      const convertedPnL = convertedValue - convertedCostBasis;
      
      data.push({
        date: dateStr,
        value: Math.round(convertedValue * 100) / 100,
        costBasis: Math.round(convertedCostBasis * 100) / 100,
        price: Math.round(interpolatedPrice * 100) / 100,
        quantity: cumulativeQuantity,
        pnl: Math.round(convertedPnL * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
      });
      
      dayCounter++;
    }
    
    return data;
  };

  // Get unique symbols for position selector (aggregate by symbol) - only for this account
  const accountPositionsForSymbols = positions.filter(p => p.accountId === accountId);
  const aggregatedSymbols = {};
  accountPositionsForSymbols.forEach(p => {
    if (!aggregatedSymbols[p.symbol]) {
      aggregatedSymbols[p.symbol] = { symbol: p.symbol, assetType: p.assetType };
    }
  });
  const uniqueSymbols = Object.values(aggregatedSymbols);

  // Auto-select first position if none selected
  useEffect(() => {
    if (uniqueSymbols.length > 0 && !selectedPositionSymbol) {
      setSelectedPositionSymbol(uniqueSymbols[0].symbol);
    }
  }, [uniqueSymbols.length]);

  if (!user || accountLoading) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  if (!account) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <div className="text-center">
          <p className={cn("mb-4", colors.textPrimary)}>{t('accountNotFound')}</p>
          <Link to={createPageUrl('Portfolio')}>
            <Button className="bg-[#5C8374] hover:bg-[#5C8374]/80">
              {t('backToPortfolio')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const metrics = calculateAccountMetrics();
  const chartData = getChartData();
  
  // Determine display currency: use account currency if it's not USD, otherwise use user currency
  const displayCurrency = (account?.baseCurrency && account.baseCurrency !== 'USD') 
    ? account.baseCurrency 
    : userCurrency;

  return (
    <div className={cn("flex flex-col h-[calc(100vh-10rem)] md:h-auto md:min-h-screen p-4 md:p-8", colors.bgPrimary)}>
      <div className="max-w-7xl mx-auto flex flex-col flex-1 md:flex-none md:block min-h-0 w-full">
        {/* Header */}
        <div className="mb-3 sm:mb-6 flex-shrink-0">
          <Link to={createPageUrl('Portfolio')}>
            <Button variant="ghost" className={cn("mb-4 hover:bg-[#5C8374]/20", colors.textSecondary)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('backToPortfolio')}
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className={cn("text-3xl font-bold mb-2", colors.textPrimary)}>{account.name}</h1>
              <p className={colors.textTertiary}>{account.type} • {account.baseCurrency}</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setEditAccountOpen(true)}
                variant="outline"
                className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                <Settings className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Edit Account</span>
              </Button>
              <Button
                onClick={handleRefreshPrices}
                disabled={refreshingPrices || positions.length === 0}
                variant="outline"
                className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshingPrices ? 'animate-spin' : ''}`} />
                {t('refreshPrices')}
              </Button>
              <Button
                onClick={() => {
                  setEditingPosition(null);
                  setEditingDayTrade(null);
                  setAddPositionOpen(true);
                }}
                className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('addPosition')}
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="flex-shrink-0 mb-3 md:mb-6">
          <div className="flex flex-row flex-nowrap gap-2 md:gap-4 overflow-x-auto">
            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalValue')}</p>
              {account?.baseCurrency && account.baseCurrency !== 'USD' && account.baseCurrency !== undefined ? (
                <>
                  <p className={cn("text-xs sm:text-sm md:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start min-w-0 break-words", colors.textPrimary)}>
                    <BlurValue blur={user?.blurValues} className="truncate">
                      {formatCurrency(metrics.originalTotalValue, account.baseCurrency)}
                    </BlurValue>
                  </p>
                  {account.baseCurrency !== userCurrency && metrics.totalValue !== undefined && (
                    <p className={cn("text-[10px] md:text-xs mt-1 w-full flex justify-center md:justify-start opacity-60", colors.textTertiary)}>
                      {formatCurrency(metrics.totalValue, userCurrency)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className={cn("text-xs sm:text-sm md:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start min-w-0 break-words", colors.textPrimary)}>
                    <BlurValue blur={user?.blurValues} className="truncate">
                      {formatCurrency(metrics.totalValue, userCurrency)}
                    </BlurValue>
                  </p>
                  {account.baseCurrency && account.baseCurrency !== userCurrency && metrics.originalTotalValue !== undefined && (
                    <p className={cn("text-[10px] md:text-xs mt-1 w-full flex justify-center md:justify-start opacity-60", colors.textTertiary)}>
                      {formatCurrency(metrics.originalTotalValue, account.baseCurrency)}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalPnL')}</p>
              {account?.baseCurrency && account.baseCurrency !== 'USD' && account.baseCurrency !== undefined ? (
                <>
                  <p className={`text-xs sm:text-sm md:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start min-w-0 break-words ${metrics.originalTotalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <BlurValue blur={user?.blurValues} className="truncate">
                      {metrics.originalTotalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.originalTotalPnL, account.baseCurrency)}
                    </BlurValue>
                  </p>
                  {account.baseCurrency !== userCurrency && metrics.totalPnL !== undefined && (
                    <p className={cn("text-[10px] md:text-xs mt-1 w-full flex justify-center md:justify-start opacity-60", colors.textTertiary)}>
                      {metrics.totalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.totalPnL, userCurrency)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className={`text-xs sm:text-sm md:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start min-w-0 break-words ${metrics.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <BlurValue blur={user?.blurValues} className="truncate">
                      {metrics.totalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.totalPnL, userCurrency)}
                    </BlurValue>
                  </p>
                  {account.baseCurrency && account.baseCurrency !== userCurrency && metrics.originalTotalPnL !== undefined && (
                    <p className={cn("text-[10px] md:text-xs mt-1 w-full flex justify-center md:justify-start opacity-60", colors.textTertiary)}>
                      {metrics.originalTotalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.originalTotalPnL, account.baseCurrency)}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalReturn')}</p>
              <p className={`text-xs sm:text-sm md:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start min-w-0 break-words ${metrics.totalPnLPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <BlurValue blur={user?.blurValues} className="truncate">
                  {metrics.totalPnLPercent >= 0 ? '+' : ''}{metrics.totalPnLPercent.toFixed(2)}%
                </BlurValue>
              </p>
            </div>
          </div>
        </div>

        {/* Performance Charts - Scrollable on mobile */}
        <div className="flex-1 overflow-y-auto min-h-0 md:overflow-visible custom-scrollbar">
        {positions.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Value Trend Chart */}
              <Card className={cn(colors.cardBg, colors.cardBorder)}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className={colors.accentText}>Value Trend</CardTitle>
                    <Tabs value={timeRange} onValueChange={setTimeRange} className="w-full sm:w-auto">
                      <TabsList className={cn("grid grid-cols-5 h-8", colors.bgTertiary, colors.border)}>
                        <TabsTrigger value="7D" className="text-xs px-1.5 sm:px-2">7D</TabsTrigger>
                        <TabsTrigger value="30D" className="text-xs px-1.5 sm:px-2">30D</TabsTrigger>
                        <TabsTrigger value="90D" className="text-xs px-1.5 sm:px-2">90D</TabsTrigger>
                        <TabsTrigger value="1Y" className="text-xs px-1.5 sm:px-2">1Y</TabsTrigger>
                        <TabsTrigger value="ALL" className="text-xs px-1.5 sm:px-2">ALL</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={getPerformanceData()}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5C8374" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#5C8374" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#5C8374'} opacity={0.2} />
                      <XAxis 
                        dataKey="date" 
                        stroke={theme === 'light' ? '#64748b' : '#9EC8B9'}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          if (timeRange === '1Y' || timeRange === 'ALL') {
                            return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                          }
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                        tickCount={8}
                        minTickGap={40}
                      />
                      <YAxis 
                        stroke={theme === 'light' ? '#64748b' : '#9EC8B9'}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => {
                          const symbols = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', RUB: '₽' };
                          const symbol = symbols[displayCurrency] || '$';
                          if (value >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}M`;
                          if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}K`;
                          return `${symbol}${value}`;
                        }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div style={{
                              backgroundColor: theme === 'light' ? '#ffffff' : '#1B4242',
                              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #5C8374',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              color: theme === 'light' ? '#475569' : '#ffffff',
                            }}>
                              <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>{data.date}</p>
                              <p style={{ margin: '0', fontSize: '14px', fontWeight: '600' }}>
                                {formatCurrency(data.value, displayCurrency)}
                                {displayCurrency !== 'USD' && (() => {
                                  const usdValue = rates && Object.keys(rates).length > 0 
                                    ? convertCurrency(data.value, displayCurrency, 'USD', rates)
                                    : null;
                                  return usdValue !== null ? (
                                    <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7, fontWeight: '400' }}>
                                      ({formatCurrency(usdValue, 'USD')})
                                    </span>
                                  ) : null;
                                })()}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#5C8374" 
                        strokeWidth={2}
                        fill="url(#colorValue)"
                        fillOpacity={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Allocation Chart */}
              <Card className={cn(colors.cardBg, colors.cardBorder)}>
                <CardHeader>
                  <CardTitle className={colors.accentText}>{t('allocation')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        paddingAngle={1}
                        minAngle={0}
                        label={(entry) => {
                          // Access data from entry - Recharts passes both data and positioning
                          const name = entry.name || entry.dataKey || 'Unknown';
                          const percentage = entry.percentage || entry.rawPercentage || 0;
                          const { x, y, cx, cy } = entry;
                          
                          // Only render if we have valid coordinates
                          if (!x || !y || isNaN(x) || isNaN(y)) return null;
                          
                          // Use smaller font for very small slices to avoid clutter
                          const fontSize = parseFloat(percentage) < 3 ? '10px' : '12px';
                          
                          return (
                            <text 
                              x={x} 
                              y={y} 
                              fill={theme === 'light' ? '#1e293b' : '#9EC8B9'} 
                              textAnchor={x > cx ? 'start' : 'end'} 
                              dominantBaseline="central"
                              style={{ fontSize, fontWeight: '500' }}
                            >
                              {`${name} ${parseFloat(percentage).toFixed(1)}%`}
                            </text>
                          );
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="displayValue"
                        nameKey="name"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'light' ? '#ffffff' : '#1B4242',
                          border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #5C8374',
                          borderRadius: '8px',
                          color: theme === 'light' ? '#475569' : '#ffffff',
                        }}
                        itemStyle={{
                          color: theme === 'light' ? '#475569' : '#ffffff',
                        }}
                        labelStyle={{
                          color: theme === 'light' ? '#475569' : '#ffffff',
                        }}
                        formatter={(value, name, props) => {
                          // Use the converted value (already in display currency)
                          const displayValue = props.payload?.value || value;
                          return formatCurrency(displayValue, displayCurrency);
                        }}
                        labelFormatter={(name) => name}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Top Holdings */}
            <div className="mb-3 md:mb-6">
              <Card className={cn(colors.cardBg, colors.cardBorder)}>
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className={cn("text-base md:text-xl", colors.accentText)}>{t('topHoldings')}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 md:p-6">
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                    {chartData.slice(0, 6).map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 md:p-3 rounded-lg" style={{ backgroundColor: 'rgba(92, 131, 116, 0.1)' }}>
                        <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-1">
                          <div
                            className="w-2 h-2 md:w-3 md:h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className={cn("font-medium text-xs md:text-base truncate", colors.textPrimary)}>{item.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-1">
                          <p className={cn("font-semibold text-xs md:text-base", colors.textPrimary)}>
                            <BlurValue blur={user?.blurValues}>
                              {formatCurrency(item.value, displayCurrency)}
                            </BlurValue>
                          </p>
                          {displayCurrency !== 'USD' && (() => {
                            const usdValue = rates && Object.keys(rates).length > 0 
                              ? convertCurrency(item.value, displayCurrency, 'USD', rates)
                              : null;
                            return usdValue !== null ? (
                              <p className={cn("text-[10px] md:text-xs", colors.textTertiary)}>
                                <BlurValue blur={user?.blurValues}>
                                  {formatCurrency(usdValue, 'USD')}
                                </BlurValue>
                              </p>
                            ) : null;
                          })()}
                          <p className={cn("text-[10px] md:text-sm", colors.textTertiary)}>
                            <BlurValue blur={user?.blurValues}>
                              {item.percentage}%
                            </BlurValue>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Positions Table */}
            <Card className={cn(colors.cardBg, colors.cardBorder)}>
              <CardHeader className="pb-2 md:pb-6">
                <CardTitle className={cn("text-base md:text-xl", colors.accentText)}>{t('positions')}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-6">
                {positionsLoading || dayTradesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className={cn("w-6 h-6 animate-spin", colors.accentText)} />
                  </div>
                ) : (
                  <PositionTable
                    positions={positions.filter(p => p.accountId === accountId)}
                    dayTrades={dayTrades.filter(dt => dt.accountId === accountId)}
                    totalAccountValue={metrics.totalValue}
                    userCurrency={displayCurrency}
                    accountCurrency={account?.baseCurrency || 'USD'}
                    exchangeRates={rates}
                    convertCurrency={convertCurrency}
                    onEdit={(position) => {
                      setEditingPosition(position);
                      setEditingDayTrade(null);
                      setAddPositionOpen(true);
                    }}
                    onDelete={(positionId) => deletePositionMutation.mutate(positionId)}
                    onSell={(position) => setSellPositionDialog({ open: true, position })}
                    onEditDayTrade={(trade) => {
                      setEditingDayTrade(trade);
                      setEditingPosition(null);
                      setAddPositionOpen(true);
                    }}
                    onDeleteDayTrade={deleteDayTradeMutation.mutate}
                  />
                )}
              </CardContent>
            </Card>

            {/* Position Value Chart */}
            {uniqueSymbols.length > 0 && (
              <div className="mt-6">
                <Card className={cn(colors.cardBg, colors.cardBorder)}>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <CardTitle className={colors.accentText}>{t('positionValue') || 'Position Value'}</CardTitle>
                      <Select
                        value={selectedPositionSymbol || ''}
                        onValueChange={setSelectedPositionSymbol}
                      >
                        <SelectTrigger className={cn("w-[180px]", colors.bgTertiary, colors.border, colors.textPrimary)}>
                          <SelectValue placeholder={t('selectPosition') || 'Select position'} />
                        </SelectTrigger>
                        <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                          {uniqueSymbols.map(item => (
                            <SelectItem key={item.symbol} value={item.symbol} className={colors.textPrimary}>
                              {item.symbol} ({item.assetType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedPositionSymbol ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={getPositionPerformanceData(selectedPositionSymbol)}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#5C8374'} opacity={0.2} />
                          <XAxis 
                            dataKey="date" 
                            stroke={theme === 'light' ? '#64748b' : '#9EC8B9'}
                            tick={{ fontSize: 12 }}
                            tickFormatter={(date) => {
                              const d = new Date(date);
                              const posData = getPositionPerformanceData(selectedPositionSymbol);
                              if (posData.length === 0) return '';
                              
                              const firstDate = new Date(posData[0].date);
                              const lastDate = new Date(posData[posData.length - 1].date);
                              const daysDiff = Math.floor((lastDate - firstDate) / 86400000);
                              
                              // Format based on time range
                              if (daysDiff > 365) {
                                return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                              } else if (daysDiff > 180) {
                                return `${d.getMonth() + 1}/${d.getDate()}`;
                              }
                              return `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                            tickCount={8}
                            minTickGap={50}
                          />
                          <YAxis 
                            stroke={theme === 'light' ? '#64748b' : '#9EC8B9'}
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              const symbols = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', RUB: '₽' };
                              const symbol = symbols[displayCurrency] || '$';
                              if (value >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}M`;
                              if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}K`;
                              return `${symbol}${value}`;
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: theme === 'light' ? '#ffffff' : '#1B4242',
                              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #5C8374',
                              borderRadius: '8px',
                              color: theme === 'light' ? '#475569' : '#ffffff',
                            }}
                            itemStyle={{
                              color: theme === 'light' ? '#475569' : '#ffffff',
                            }}
                            labelStyle={{
                              color: theme === 'light' ? '#475569' : '#ffffff',
                            }}
                            content={({ active, payload }) => {
                              if (!active || !payload || !payload.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div style={{
                                  backgroundColor: theme === 'light' ? '#ffffff' : '#1B4242',
                                  border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #5C8374',
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  color: theme === 'light' ? '#475569' : '#ffffff',
                                }}>
                                  <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>{data.date}</p>
                                  <p style={{ margin: '2px 0', color: '#5C8374' }}>
                                    {t('currentValue') || 'Value'}: {formatCurrency(data.value, displayCurrency)}
                                    {displayCurrency !== 'USD' && (() => {
                                      const usdValue = rates && Object.keys(rates).length > 0 
                                        ? convertCurrency(data.value, displayCurrency, 'USD', rates)
                                        : null;
                                      return usdValue !== null ? (
                                        <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>
                                          ({formatCurrency(usdValue, 'USD')})
                                        </span>
                                      ) : null;
                                    })()}
                                  </p>
                                  <p style={{ margin: '2px 0', color: '#9EC8B9' }}>
                                    {t('costBasis') || 'Cost'}: {formatCurrency(data.costBasis, displayCurrency)}
                                    {displayCurrency !== 'USD' && (() => {
                                      const usdValue = rates && Object.keys(rates).length > 0 
                                        ? convertCurrency(data.costBasis, displayCurrency, 'USD', rates)
                                        : null;
                                      return usdValue !== null ? (
                                        <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>
                                          ({formatCurrency(usdValue, 'USD')})
                                        </span>
                                      ) : null;
                                    })()}
                                  </p>
                                  <p style={{ 
                                    margin: '2px 0', 
                                    color: data.pnl >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: '500'
                                  }}>
                                    P/L: {formatCurrency(data.pnl, displayCurrency)} ({data.pnlPercent >= 0 ? '+' : ''}{data.pnlPercent.toFixed(2)}%)
                                    {displayCurrency !== 'USD' && (() => {
                                      const usdValue = rates && Object.keys(rates).length > 0 
                                        ? convertCurrency(data.pnl, displayCurrency, 'USD', rates)
                                        : null;
                                      return usdValue !== null ? (
                                        <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>
                                          ({formatCurrency(usdValue, 'USD')})
                                        </span>
                                      ) : null;
                                    })()}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#5C8374" 
                            strokeWidth={2}
                            dot={false}
                            name="value"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="costBasis" 
                            stroke="#9EC8B9" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="costBasis"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className={cn("flex items-center justify-center h-[250px]", colors.textTertiary)}>
                        <p>{t('selectPositionToView') || 'Select a position to view its value chart'}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* Transaction History */}
        <div className="mt-6">
          <TransactionHistory
            transactions={portfolioTransactions}
            isLoading={transactionsLoading}
            accountCurrency={account.baseCurrency}
          />
        </div>

        {/* Add/Edit Position & Day Trade Dialog */}
        <AddPositionDialog
          open={addPositionOpen}
          onClose={() => {
            setAddPositionOpen(false);
            setEditingPosition(null);
            setEditingDayTrade(null);
          }}
          onSubmit={handleAddPosition}
          onSubmitDayTrade={handleAddDayTrade}
          isLoading={createPositionMutation.isPending || updatePositionMutation.isPending || createDayTradeMutation.isPending || updateDayTradeMutation.isPending}
          accountCurrency={account.baseCurrency}
          editPosition={editingPosition}
          editDayTrade={editingDayTrade}
          cashBalance={totalCashBalance > 0 ? totalCashBalance : null}
          hasCashPosition={totalCashBalance > 0}
        />

        {/* Sell Position Dialog */}
        <SellPositionDialog
          open={sellPositionDialog.open}
          onClose={() => setSellPositionDialog({ open: false, position: null })}
          onSubmit={sellPositionMutation.mutate}
          isLoading={sellPositionMutation.isPending}
          position={sellPositionDialog.position}
          accountCurrency={account.baseCurrency}
          hasCashPosition={totalCashBalance > 0}
        />

        {/* Edit Account Dialog */}
        {editAccountOpen && (
          <AddAccountDialog
            open={editAccountOpen}
            onClose={() => setEditAccountOpen(false)}
            onSubmit={(data) => updateAccountMutation.mutate({ id: account.id, data })}
            isLoading={updateAccountMutation.isPending}
            editAccount={account}
          />
        )}
        </div>

      </div>
    </div>
  );
}