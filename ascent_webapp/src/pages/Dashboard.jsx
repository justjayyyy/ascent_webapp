import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import BlurValue from '../components/BlurValue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Wallet, PieChart as PieChartIcon, BarChart3, Target, Plus, Percent, Settings } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import AddGoalDialog from '../components/dashboard/AddGoalDialog';
import GoalProgressCard from '../components/dashboard/GoalProgressCard';
import DashboardCustomization from '../components/dashboard/DashboardCustomization';
import PortfolioValueWidget from '../components/dashboard/widgets/PortfolioValueWidget';
import NetWorthWidget from '../components/dashboard/widgets/NetWorthWidget';
import AccountAllocationWidget from '../components/dashboard/widgets/AccountAllocationWidget';
import AssetAllocationWidget from '../components/dashboard/widgets/AssetAllocationWidget';
import { useTheme } from '../components/ThemeProvider';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
import { toast } from 'sonner';

// Default widget configuration - 2 columns layout with standard sizes
const DEFAULT_WIDGETS = [
  { widgetType: 'portfolio_value', x: 0, y: 0, w: 1, h: 3, enabled: true },
  { widgetType: 'net_worth', x: 1, y: 0, w: 1, h: 3, enabled: true },
  { widgetType: 'account_allocation', x: 0, y: 3, w: 1, h: 3, enabled: true },
  { widgetType: 'asset_allocation', x: 1, y: 3, w: 1, h: 3, enabled: true },
  { widgetType: 'savings_rate', x: 0, y: 6, w: 1, h: 2, enabled: true },
  { widgetType: 'benchmark_comparison', x: 1, y: 6, w: 1, h: 3, enabled: true },
  { widgetType: 'financial_goals', x: 0, y: 8, w: 1, h: 3, enabled: true },
  { widgetType: 'account_summary', x: 1, y: 9, w: 1, h: 3, enabled: true },
];

const COLORS = ['#5C8374', '#9EC8B9', '#60A5FA', '#A78BFA', '#F59E0B', '#EF4444', '#10B981'];

export default function Dashboard() {
  const { user, colors, t, theme } = useTheme();
  const userCurrency = user?.currency || 'USD';
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('30d');
  const [gridWidth, setGridWidth] = useState(800);
  const gridContainerRef = useRef(null);
  const queryClient = useQueryClient();
  const saveTimeoutRef = useRef(null);
  const isInitialMount = useRef(true);
  const { convertCurrency, fetchExchangeRates, isLoading: ratesLoading } = useCurrencyConversion();

  // Fetch exchange rates on mount
  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  // Measure the actual container width for the grid
  useEffect(() => {
    const measureWidth = () => {
      if (gridContainerRef.current) {
        // Get the actual computed width of the container
        const rect = gridContainerRef.current.getBoundingClientRect();
        const width = Math.floor(rect.width);
        if (width > 0) {
          setGridWidth(width);
        }
      }
    };

    // Measure after layout is complete
    const timer1 = setTimeout(measureWidth, 50);
    const timer2 = setTimeout(measureWidth, 200);
    const timer3 = setTimeout(measureWidth, 500);

    window.addEventListener('resize', measureWidth);

    // Use ResizeObserver for more accurate measurements
    const resizeObserver = new ResizeObserver(measureWidth);
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', measureWidth);
      resizeObserver.disconnect();
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Account.list();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Position.list('-created_date', 1000);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.PortfolioSnapshot.list('-date', 30);
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.ExpenseTransaction.list('-date', 1000);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.FinancialGoal.list('-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const createGoalMutation = useMutation({
    mutationFn: (goalData) => ascent.entities.FinancialGoal.create(goalData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setAddGoalOpen(false);
      setEditingGoal(null);
      toast.success(t('goalCreatedSuccessfully'));
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.FinancialGoal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setAddGoalOpen(false);
      setEditingGoal(null);
      toast.success(t('goalUpdatedSuccessfully'));
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (goalId) => ascent.entities.FinancialGoal.delete(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success(t('goalDeletedSuccessfully'));
    },
  });

  // Local widget state for immediate UI updates
  const [localWidgets, setLocalWidgets] = useState(null);

  const { data: serverWidgets = [], isLoading: widgetsLoading } = useQuery({
    queryKey: ['dashboardWidgets', user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_WIDGETS;
      const widgets = await ascent.entities.DashboardWidget.list();
      if (widgets.length === 0) {
        return DEFAULT_WIDGETS;
      }
      return widgets.map(w => ({
        ...w,
        x: Math.max(0, Math.min(3, Number(w.x ?? 0))),
        y: Math.max(0, Number(w.y ?? 0)),
        w: Math.max(1, Math.min(4, Number(w.w ?? 2))),
        h: Math.max(2, Math.min(8, Number(w.h ?? 3))),
        enabled: w.enabled !== false,
      }));
    },
    enabled: !!user,
  });

  // Use local state for immediate feedback, server state as fallback
  const dashboardWidgets = localWidgets || serverWidgets;

  const saveWidgetsMutation = useMutation({
    mutationFn: async (widgets) => {
      // Delete all existing widgets
      const existing = await ascent.entities.DashboardWidget.list();
      await Promise.all(existing.map(w => ascent.entities.DashboardWidget.delete(w.id)));

      // Create new widgets without IDs
      const widgetsToCreate = widgets.map(({ id, created_by, created_date, updated_date, ...widget }) => widget);
      await ascent.entities.DashboardWidget.bulkCreate(widgetsToCreate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardWidgets'] });
      setCustomizeOpen(false);
      toast.success(t('dashboardLayoutSaved'));
    },
  });

  const formatCurrency = React.useCallback((value, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }, [user?.currency]);

  const calculateTotalMetrics = () => {
    const accountsWithPositions = accounts.map(account => {
      const accountPositions = positions.filter(p => p.accountId === account.id);

      let totalValue = 0;
      let totalCostBasis = 0;

      accountPositions.forEach(position => {
        const currentPrice = position.currentPrice || position.averageBuyPrice;

        // Calculate values in original currency
        const rawMarketValue = position.quantity * currentPrice;
        const rawCostBasis = position.quantity * position.averageBuyPrice;

        // Convert to user's currency
        const marketValue = convertCurrency(rawMarketValue, position.currency || 'USD', userCurrency);
        const costBasis = convertCurrency(rawCostBasis, position.currency || 'USD', userCurrency);

        totalValue += marketValue;
        totalCostBasis += costBasis;
      });

      return {
        ...account,
        totalValue,
        totalCostBasis,
        totalPnL: totalValue - totalCostBasis,
      };
    });

    const totalPortfolioValue = accountsWithPositions.reduce((sum, acc) => sum + acc.totalValue, 0);
    const totalCostBasis = accountsWithPositions.reduce((sum, acc) => sum + acc.totalCostBasis, 0);
    const totalPnL = totalPortfolioValue - totalCostBasis;
    const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    // Cash vs Invested
    const cashPositions = positions.filter(p => p.assetType === 'Cash');
    const totalCash = cashPositions.reduce((sum, p) => {
      const price = p.currentPrice || p.averageBuyPrice;
      const rawValue = p.quantity * price;
      return sum + convertCurrency(rawValue, p.currency || 'USD', userCurrency);
    }, 0);
    const totalInvested = totalPortfolioValue - totalCash;

    return {
      accountsWithPositions,
      totalPortfolioValue,
      totalPnL,
      totalPnLPercent,
      totalCash,
      totalInvested,
    };
  };

  // Generate allocation by account type
  const getAccountTypeAllocation = (accountsWithPositions) => {
    const typeGroups = {};
    accountsWithPositions.forEach(account => {
      if (!typeGroups[account.type]) {
        typeGroups[account.type] = 0;
      }
      typeGroups[account.type] += account.totalValue;
    });

    return Object.entries(typeGroups).map(([type, value]) => ({
      name: type,
      value,
    }));
  };

  // Generate allocation by asset type
  const getAssetTypeAllocation = () => {
    const assetGroups = {};
    positions.forEach(position => {
      const currentPrice = position.currentPrice || position.averageBuyPrice;
      const rawMarketValue = position.quantity * currentPrice;
      const marketValue = convertCurrency(rawMarketValue, position.currency || 'USD', userCurrency);

      if (!assetGroups[position.assetType]) {
        assetGroups[position.assetType] = 0;
      }
      assetGroups[position.assetType] += marketValue;
    });

    return Object.entries(assetGroups).map(([type, value]) => ({
      name: type,
      value,
    })).sort((a, b) => b.value - a.value);
  };

  // Calculate savings rate (using stored converted amounts)
  const calculateSavingsRate = useCallback(() => {
    const thisMonth = new Date();
    const thisMonthTransactions = transactions.filter(t => {
      const transDate = parseISO(t.date);
      return transDate.getMonth() === thisMonth.getMonth() &&
        transDate.getFullYear() === thisMonth.getFullYear();
    });

    const totalIncome = thisMonthTransactions
      .filter(t => t.type === 'Income')
      .reduce((sum, t) => {
        // Use stored converted amount if available
        if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
          return sum + t.amountInGlobalCurrency;
        }
        // Fallback: convert currency if no stored amount
        return sum + convertCurrency(t.amount, t.currency || 'USD', userCurrency);
      }, 0);

    const totalExpenses = thisMonthTransactions
      .filter(t => t.type === 'Expense')
      .reduce((sum, t) => {
        // Use stored converted amount if available
        if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
          return sum + t.amountInGlobalCurrency;
        }
        // Fallback: convert currency if no stored amount
        return sum + convertCurrency(t.amount, t.currency || 'USD', userCurrency);
      }, 0);

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
    return { savingsRate, totalIncome, totalExpenses };
  }, [transactions, userCurrency]);

  // Deterministic pseudo-random based on date (same date = same value)
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Net worth over time (Assets - Cumulative Expenses, using stored converted amounts)
  const getNetWorthData = useCallback((range = '30d') => {
    const metrics = calculateTotalMetrics();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : 365;
    const data = [];
    const currentPortfolioValue = metrics.totalPortfolioValue;

    // Find the earliest position/account creation date
    const positionDates = positions
      .filter(p => p.created_date)
      .map(p => new Date(p.created_date));
    const accountDates = accounts
      .filter(a => a.created_date)
      .map(a => new Date(a.created_date));
    const transactionDates = transactions
      .filter(t => t.date)
      .map(t => parseISO(t.date));

    const allDates = [...positionDates, ...accountDates, ...transactionDates];
    const earliestDate = allDates.length > 0
      ? new Date(Math.min(...allDates.map(d => d.getTime())))
      : new Date();

    // Calculate total invested from positions
    const totalInvested = positions.reduce((sum, p) => {
      const rawCost = p.quantity * p.averageBuyPrice;
      return sum + convertCurrency(rawCost, p.currency || 'USD', userCurrency);
    }, 0);
    const totalPnL = currentPortfolioValue - totalInvested;
    const daysSinceStart = Math.max(1, Math.floor((new Date() - earliestDate) / 86400000));

    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);

      // Show 0 before any financial activity
      if (date < earliestDate) {
        data.push({
          date: format(date, days <= 30 ? 'MMM dd' : 'MMM'),
          netWorth: 0,
          portfolio: 0,
        });
        continue;
      }

      // Calculate cumulative expenses up to this date (using stored converted amounts)
      const cumulativeExpenses = transactions
        .filter(t => t.type === 'Expense' && parseISO(t.date) <= date)
        .reduce((sum, t) => {
          const amountToUse = t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined
            ? t.amountInGlobalCurrency
            : (t.currency === userCurrency ? t.amount : t.amount);
          return sum + amountToUse;
        }, 0);

      // Calculate cumulative income up to this date (using stored converted amounts)
      const cumulativeIncome = transactions
        .filter(t => t.type === 'Income' && parseISO(t.date) <= date)
        .reduce((sum, t) => {
          const amountToUse = t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined
            ? t.amountInGlobalCurrency
            : (t.currency === userCurrency ? t.amount : t.amount);
          return sum + amountToUse;
        }, 0);

      // Calculate portfolio value based on position dates
      const daysFromStart = Math.floor((date - earliestDate) / 86400000);
      const progressRatio = daysSinceStart > 0 ? daysFromStart / daysSinceStart : 1;

      const daysSeed = date.getTime() / 86400000;
      const variation = (seededRandom(daysSeed) - 0.5) * 0.01;

      const portfolioValue = totalInvested + (totalPnL * progressRatio) + (totalInvested * variation);
      const netWorth = portfolioValue + (cumulativeIncome - cumulativeExpenses);

      data.push({
        date: format(date, days <= 30 ? 'MMM dd' : 'MMM'),
        netWorth: Math.max(0, netWorth),
        portfolio: Math.max(0, portfolioValue),
      });
    }

    return data;
  }, [accounts, positions, transactions, userCurrency]);

  // Portfolio performance vs S&P 500 benchmark
  const getBenchmarkComparison = () => {
    const metrics = calculateTotalMetrics();
    const portfolioReturn = metrics.totalPnLPercent;

    // Use a fixed S&P 500 benchmark based on current year
    // Average S&P 500 YTD return (deterministic based on current month)
    const currentMonth = new Date().getMonth();
    const sp500MonthlyReturns = [1.5, 2.8, 4.2, 5.5, 6.8, 7.2, 8.1, 8.5, 9.2, 10.1, 10.8, 11.5];
    const sp500Return = sp500MonthlyReturns[currentMonth];

    const difference = portfolioReturn - sp500Return;

    return {
      portfolioReturn,
      sp500Return,
      difference,
      outperforming: difference > 0,
    };
  };

  // Generate historical data for portfolio value over time
  const getHistoricalData = (range = '30d') => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : 365;

    // Use real snapshots if available
    if (snapshots.length > 0) {
      // Filter snapshots for the selected time range
      const cutoffDate = subDays(new Date(), days);
      const relevantSnapshots = snapshots
        .filter(s => new Date(s.date) >= cutoffDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (relevantSnapshots.length > 0) {
        return relevantSnapshots.map(snapshot => ({
          date: format(new Date(snapshot.date), days <= 30 ? 'MMM dd' : 'MMM'),
          value: snapshot.totalValue,
        }));
      }
    }

    // Find the earliest position creation date
    const positionDates = positions
      .filter(p => p.created_date)
      .map(p => new Date(p.created_date));
    const accountDates = accounts
      .filter(a => a.created_date)
      .map(a => new Date(a.created_date));

    const allDates = [...positionDates, ...accountDates];
    const earliestDate = allDates.length > 0
      ? new Date(Math.min(...allDates.map(d => d.getTime())))
      : new Date(); // If no dates, use today

    // Generate deterministic historical data based on current positions
    const metrics = calculateTotalMetrics();
    const data = [];
    const currentValue = metrics.totalPortfolioValue;
    const totalCost = positions.reduce((sum, p) => {
      const rawCost = p.quantity * p.averageBuyPrice;
      return sum + convertCurrency(rawCost, p.currency || 'USD', userCurrency);
    }, 0);

    // Calculate average daily return from P&L
    const totalPnL = currentValue - totalCost;
    const daysSinceStart = Math.max(1, Math.floor((new Date() - earliestDate) / 86400000));
    const avgDailyReturn = totalCost > 0 ? (totalPnL / totalCost) / daysSinceStart : 0;

    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);

      // Show 0 before the first deposit/position
      if (date < earliestDate) {
        data.push({
          date: format(date, days <= 30 ? 'MMM dd' : 'MMM'),
          value: 0,
        });
        continue;
      }

      const daysSeed = date.getTime() / 86400000;

      // Deterministic small daily variation
      const dailyVariation = (seededRandom(daysSeed) - 0.5) * 0.01;

      // Calculate days since start for this point
      const daysFromStart = Math.floor((date - earliestDate) / 86400000);
      const totalDaysFromStart = Math.floor((new Date() - earliestDate) / 86400000);

      // Linear growth from cost basis to current value
      const progressRatio = totalDaysFromStart > 0 ? daysFromStart / totalDaysFromStart : 1;
      const value = totalCost + (totalPnL * progressRatio) + (totalCost * dailyVariation);

      data.push({
        date: format(date, days <= 30 ? 'MMM dd' : 'MMM'),
        value: Math.max(0, value),
      });
    }

    return data;
  };

  const handleAddGoal = React.useCallback(async (goalData) => {
    if (editingGoal) {
      await updateGoalMutation.mutateAsync({ id: editingGoal.id, data: goalData });
    } else {
      await createGoalMutation.mutateAsync(goalData);
    }
  }, [editingGoal, updateGoalMutation, createGoalMutation]);

  // Debounced save to backend
  const debouncedSave = useCallback((widgetsToSave) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveWidgetsMutation.mutate(widgetsToSave);
    }, 1000);
  }, [saveWidgetsMutation]);

  // Handle layout changes from the grid
  const handleLayoutChange = useCallback((currentLayout, allLayouts) => {
    if (!currentLayout || currentLayout.length === 0) return;

    // Skip saving on initial mount (first 2 layout changes are from initialization)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setLocalWidgets(prev => {
      const current = prev || serverWidgets || DEFAULT_WIDGETS;
      const updated = current.map(widget => {
        const layoutItem = currentLayout.find(l => l.i === widget.widgetType);
        if (layoutItem) {
          return {
            ...widget,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h,
          };
        }
        return widget;
      });
      debouncedSave(updated);
      return updated;
    });
  }, [serverWidgets, debouncedSave]);

  // Handle saving layout from customization dialog
  const handleSaveLayout = useCallback(async (widgets) => {
    await saveWidgetsMutation.mutateAsync(widgets);
    setLocalWidgets(widgets);
  }, [saveWidgetsMutation]);

  const metrics = React.useMemo(() => calculateTotalMetrics(), [accounts, positions]);
  const accountTypeData = React.useMemo(() => getAccountTypeAllocation(metrics.accountsWithPositions), [metrics.accountsWithPositions]);
  const assetTypeData = React.useMemo(() => getAssetTypeAllocation(), [positions]);
  const historicalData = React.useMemo(() => getHistoricalData(timeRange), [snapshots, metrics.totalPortfolioValue, timeRange]);
  const savingsMetrics = React.useMemo(() => calculateSavingsRate(), [calculateSavingsRate]);
  const netWorthData = React.useMemo(() => getNetWorthData(timeRange), [getNetWorthData, timeRange]);
  const benchmarkData = React.useMemo(() => getBenchmarkComparison(), [metrics.totalPnLPercent]);

  const enabledWidgets = (dashboardWidgets || []).filter(w =>
    w &&
    w.enabled &&
    w.widgetType &&
    typeof w.x !== 'undefined' &&
    typeof w.y !== 'undefined' &&
    typeof w.w !== 'undefined' &&
    typeof w.h !== 'undefined'
  );

  // Generate layout for ResponsiveGridLayout - 2 columns, widgets can be side by side
  // MUST be before any early returns to maintain hook order
  const layouts = React.useMemo(() => {
    const lgLayout = enabledWidgets.map(widget => ({
      i: widget.widgetType,
      x: Math.max(0, Math.min(1, Number(widget.x) || 0)), // 0 or 1 for 2 columns
      y: Math.max(0, Number(widget.y) || 0),
      w: Math.max(1, Math.min(2, Number(widget.w) || 1)), // 1 = half width, 2 = full width
      h: Math.max(2, Math.min(6, Number(widget.h) || 3)),
      minW: 1,
      maxW: 2,
      minH: 2,
      maxH: 6,
    }));

    return {
      lg: lgLayout,
      md: lgLayout,
      sm: enabledWidgets.map((widget, idx) => ({
        i: widget.widgetType,
        x: 0,
        y: idx * 3,
        w: 1,
        h: Number(widget.h) || 3,
        minH: 2,
        maxH: 6,
      })),
    };
  }, [enabledWidgets]);

  // Loading state - after all hooks
  if (!user || widgetsLoading) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  const renderWidget = (widget) => {
    if (!widget || !widget.widgetType) return null;

    const widgetContent = (() => {
      switch (widget.widgetType) {
        case 'portfolio_value':
          return <PortfolioValueWidget data={historicalData} formatCurrency={formatCurrency} timeRange={timeRange} onTimeRangeChange={setTimeRange} />;
        case 'net_worth':
          return <NetWorthWidget data={netWorthData} formatCurrency={formatCurrency} timeRange={timeRange} onTimeRangeChange={setTimeRange} />;
        case 'account_allocation':
          return <AccountAllocationWidget data={accountTypeData} totalValue={metrics.totalPortfolioValue} formatCurrency={formatCurrency} />;
        case 'asset_allocation':
          return <AssetAllocationWidget data={assetTypeData} formatCurrency={formatCurrency} />;
        case 'savings_rate':
          return (
            <Card className={cn("h-full", colors.cardBg, colors.cardBorder)}>
              <CardHeader className="pb-3 widget-drag-handle cursor-move">
                <div className="flex items-center justify-between">
                  <CardTitle className={colors.accentText}>{t('savingsRate')}</CardTitle>
                  <Percent className="w-5 h-5 text-[#5C8374]" />
                </div>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${savingsMetrics.savingsRate >= 20 ? 'text-green-400' : savingsMetrics.savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {savingsMetrics.savingsRate.toFixed(1)}%
                </p>
                <p className={cn("text-sm mt-1", colors.textTertiary)}>{t('thisMonth')}</p>
              </CardContent>
            </Card>
          );
        case 'benchmark_comparison':
          return (
            <Card className={cn("h-full", colors.cardBg, colors.cardBorder)}>
              <CardHeader className="widget-drag-handle cursor-move">
                <div className="flex items-center justify-between">
                  <CardTitle className={colors.accentText}>{t('performanceVsSP500')}</CardTitle>
                  <TrendingUp className={`w-5 h-5 ${benchmarkData.outperforming ? 'text-green-400' : 'text-red-400'}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className={cn("text-sm mb-2", colors.textTertiary)}>{t('yourPortfolio')}</p>
                    <p className={`text-3xl font-bold ${benchmarkData.portfolioReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {benchmarkData.portfolioReturn >= 0 ? '+' : ''}{benchmarkData.portfolioReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-sm mb-2", colors.textTertiary)}>{t('sp500Benchmark')}</p>
                    <p className="text-3xl font-bold text-blue-400">
                      +{benchmarkData.sp500Return.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-sm mb-2", colors.textTertiary)}>{t('difference')}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-3xl font-bold ${benchmarkData.outperforming ? 'text-green-400' : 'text-red-400'}`}>
                        {benchmarkData.difference >= 0 ? '+' : ''}{benchmarkData.difference.toFixed(2)}%
                      </p>
                      {benchmarkData.outperforming ? (
                        <span className="text-sm text-green-400">{t('outperforming')}</span>
                      ) : (
                        <span className="text-sm text-red-400">{t('underperforming')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        case 'financial_goals':
          return (
            <Card className={cn("h-full", colors.cardBg, colors.cardBorder)}>
              <CardHeader className="widget-drag-handle cursor-move">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#5C8374]" />
                    <CardTitle className={colors.accentText}>{t('financialGoals')}</CardTitle>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingGoal(null);
                      setAddGoalOpen(true);
                    }}
                    size="sm"
                    className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('addGoal')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {goals.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {goals.map((goal) => {
                      const linkedAccounts = goal.linkedAccountIds?.length > 0
                        ? metrics.accountsWithPositions.filter(acc => goal.linkedAccountIds.includes(acc.id))
                        : [];

                      return (
                        <GoalProgressCard
                          key={goal.id}
                          goal={goal}
                          linkedAccounts={linkedAccounts}
                          onEdit={(goal) => {
                            setEditingGoal(goal);
                            setAddGoalOpen(true);
                          }}
                          onDelete={deleteGoalMutation.mutate}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Target className="w-12 h-12 text-[#5C8374] mx-auto mb-3" />
                    <p className={cn("mb-4", colors.textTertiary)}>{t('noGoalsYet')}</p>
                    <Button
                      onClick={() => setAddGoalOpen(true)}
                      variant="outline"
                      className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t('setYourFirstGoal')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        case 'account_summary':
          return (
            <Card className={cn("h-full", colors.cardBg, colors.cardBorder)}>
              <CardHeader className="widget-drag-handle cursor-move">
                <CardTitle className={colors.accentText}>{t('accountSummary')}</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.accountsWithPositions.length > 0 ? (
                  <div className="space-y-4">
                    {metrics.accountsWithPositions.map((account, idx) => {
                      const percentage = metrics.totalPortfolioValue > 0
                        ? (account.totalValue / metrics.totalPortfolioValue) * 100
                        : 0;

                      return (
                        <div key={account.id} className={cn("flex items-center justify-between py-3 border-b last:border-0", colors.borderLight)}>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <div>
                              <p className={cn("font-semibold", colors.textPrimary)}>{account.name}</p>
                              <p className={cn("text-sm", colors.textTertiary)}>{account.type}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn("font-semibold", colors.textPrimary)}>
                              <BlurValue blur={user?.blurValues}>
                                {formatCurrency(account.totalValue, user?.currency)}
                              </BlurValue>
                            </p>
                            <p className={cn("text-sm", colors.textTertiary)}>
                              <BlurValue blur={user?.blurValues}>
                                {percentage.toFixed(1)}%
                              </BlurValue>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={cn("text-center py-8", colors.textTertiary)}>
                    No accounts yet. Create your first account to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        default:
          return null;
      }
    })();

    return widgetContent;
  };

  return (
    <div className={cn("min-h-screen p-4 md:p-6", colors.bgPrimary)}>
      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={cn("text-3xl md:text-4xl font-bold mb-2", colors.textPrimary)}>{t('dashboard')}</h1>
              <p className={colors.textTertiary}>{t('yourCompleteFinancialOverview')}</p>
            </div>
            <Button
              onClick={() => setCustomizeOpen(true)}
              variant="outline"
              className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
            >
              <Settings className="w-4 h-4 mr-2" />
              {t('customize')}
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('totalPortfolio')}</CardTitle>
                <Wallet className="w-5 h-5 text-[#5C8374]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(metrics.totalPortfolioValue)}
                </BlurValue>
              </p>
            </CardContent>
          </Card>

          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('totalPnL')}</CardTitle>
                {metrics.totalPnL >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${metrics.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <BlurValue blur={user?.blurValues}>
                  {metrics.totalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.totalPnL)}
                </BlurValue>
              </p>
              <p className={`text-sm mt-1 ${metrics.totalPnL >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                <BlurValue blur={user?.blurValues}>
                  {metrics.totalPnL >= 0 ? '+' : ''}{metrics.totalPnLPercent.toFixed(2)}%
                </BlurValue>
              </p>
            </CardContent>
          </Card>

          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('invested')}</CardTitle>
                <BarChart3 className="w-5 h-5 text-[#5C8374]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(metrics.totalInvested)}
                </BlurValue>
              </p>
              <p className={cn("text-sm mt-1", colors.textTertiary)}>
                {metrics.totalPortfolioValue > 0
                  ? ((metrics.totalInvested / metrics.totalPortfolioValue) * 100).toFixed(1)
                  : 0}% {t('ofPortfolio')}
              </p>
            </CardContent>
          </Card>

          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('cash')}</CardTitle>
                <PieChartIcon className="w-5 h-5 text-[#5C8374]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(metrics.totalCash)}
                </BlurValue>
              </p>
              <p className={cn("text-sm mt-1", colors.textTertiary)}>
                {metrics.totalPortfolioValue > 0
                  ? ((metrics.totalCash / metrics.totalPortfolioValue) * 100).toFixed(1)
                  : 0}% {t('ofPortfolio')}
              </p>
            </CardContent>
          </Card>

          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('savingsRate')}</CardTitle>
                <Percent className="w-5 h-5 text-[#5C8374]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${savingsMetrics.savingsRate >= 20 ? 'text-green-400' : savingsMetrics.savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                {savingsMetrics.savingsRate.toFixed(1)}%
              </p>
              <p className={cn("text-sm mt-1", colors.textTertiary)}>
                {t('thisMonth')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Draggable & Resizable Widgets */}
        <div ref={gridContainerRef} className="w-full overflow-hidden" style={{ maxWidth: '100%' }}>
          {enabledWidgets.length > 0 && gridWidth > 0 && (
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 768, sm: 480 }}
              cols={{ lg: 2, md: 2, sm: 1 }}
              rowHeight={120}
              width={gridWidth}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".widget-drag-handle"
              containerPadding={[0, 0]}
              margin={[16, 16]}
              isDraggable={true}
              isResizable={true}
              useCSSTransforms={true}
              resizeHandles={['se', 's', 'e']}
              compactType="vertical"
            >
              {enabledWidgets.map((widget) => (
                <div key={widget.widgetType} className="overflow-hidden rounded-lg" style={{ maxWidth: '100%' }}>
                  {renderWidget(widget)}
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>

        {/* Customization Dialog */}
        <DashboardCustomization
          open={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          widgets={dashboardWidgets}
          onSave={handleSaveLayout}
          isSaving={saveWidgetsMutation.isPending}
        />

        {/* Add/Edit Goal Dialog */}
        <AddGoalDialog
          open={addGoalOpen}
          onClose={() => {
            setAddGoalOpen(false);
            setEditingGoal(null);
          }}
          onSubmit={handleAddGoal}
          isLoading={createGoalMutation.isPending || updateGoalMutation.isPending}
          editGoal={editingGoal}
          accounts={accounts}
        />
      </div>
    </div>
  );
}