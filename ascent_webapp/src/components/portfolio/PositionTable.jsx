import React, { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, TrendingUp, TrendingDown, FileText, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import BlurValue from '../BlurValue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

const assetTypeColors = {
  Stock: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ETF: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Option: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  Cash: 'bg-green-500/10 text-green-400 border-green-500/30',
  Crypto: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  Other: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function PositionTable({ positions, dayTrades = [], onEdit, onDelete, onSell, onEditDayTrade, onDeleteDayTrade, totalAccountValue, userCurrency = 'USD', accountCurrency = 'USD', exchangeRates = null, convertCurrency = null }) {
  const { colors, t, user } = useTheme();
  const [notesDialog, setNotesDialog] = useState({ open: false, notes: '', title: '' });
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, item: null, isDayTrade: false, isAggregated: false });

  const formatCurrency = useCallback((value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }, []);

  // Helper to convert amount to global currency
  const convertToGlobalCurrency = useCallback((amount, fromCurrency = accountCurrency) => {
    if (fromCurrency === userCurrency) {
      return amount;
    }
    if (exchangeRates && Object.keys(exchangeRates).length > 0 && convertCurrency) {
      return convertCurrency(amount, fromCurrency, userCurrency, exchangeRates);
    }
    return amount;
  }, [userCurrency, accountCurrency, exchangeRates, convertCurrency]);

  // Helper to convert amount to USD
  const convertToUSD = useCallback((amount, fromCurrency = userCurrency) => {
    if (fromCurrency === 'USD') {
      return amount;
    }
    if (exchangeRates && Object.keys(exchangeRates).length > 0 && convertCurrency) {
      return convertCurrency(amount, fromCurrency, 'USD', exchangeRates);
    }
    return null;
  }, [userCurrency, exchangeRates, convertCurrency]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  // Aggregate positions by symbol (memoized)
  const aggregatePositions = useCallback((positionsList) => {
    const grouped = {};
    
    positionsList.forEach(position => {
      // For options, create unique key including option details to avoid aggregating different strikes/types
      // For cash, include currency in key to avoid aggregating different currencies
      let key = position.symbol;
      if (position.assetType === 'Option') {
        const strike = position.strikePrice || '';
        const optType = position.optionType || '';
        const optAction = position.optionAction || '';
        const expDate = position.expirationDate || '';
        key = `${position.symbol}_${strike}_${optType}_${optAction}_${expDate}`;
      } else if (position.assetType === 'Cash') {
        // Include currency in key for cash positions to keep different currencies separate
        const positionCurrency = position.currency || accountCurrency;
        key = `${position.symbol}_${positionCurrency}`;
      }
      
      if (!grouped[key]) {
        grouped[key] = {
          ...position,
          quantity: 0,
          totalCostBasis: 0,
          totalCurrentValue: 0,
          originalPositions: [],
          notes: '',
          // Preserve currency for cash positions
          currency: position.currency || accountCurrency,
        };
      }
      
      let currentPrice, averageBuyPrice;
      if (position.assetType === 'Option') {
        averageBuyPrice = position.premiumPrice || position.averageBuyPrice || 0;
        currentPrice = position.currentPrice || averageBuyPrice;
        const contractMultiplier = 100;
        grouped[key].totalCostBasis += position.quantity * averageBuyPrice * contractMultiplier;
        grouped[key].totalCurrentValue += position.quantity * currentPrice * contractMultiplier;
      } else {
        currentPrice = position.currentPrice || position.averageBuyPrice;
        averageBuyPrice = position.averageBuyPrice;
        grouped[key].totalCostBasis += position.quantity * averageBuyPrice;
        grouped[key].totalCurrentValue += position.quantity * currentPrice;
      }
      
      grouped[key].quantity += position.quantity;
      grouped[key].originalPositions.push(position);
      
      // Use most recent date
      if (new Date(position.date) > new Date(grouped[key].date)) {
        grouped[key].date = position.date;
      }
      
      // Combine notes
      if (position.notes) {
        grouped[key].notes = grouped[key].notes 
          ? `${grouped[key].notes}\n---\n${position.notes}` 
          : position.notes;
      }
    });
    
    // Calculate weighted average prices
    return Object.values(grouped).map(group => {
      if (group.assetType === 'Option') {
        const contractMultiplier = 100;
        const totalPremium = group.originalPositions.reduce((sum, p) => {
          const premium = p.premiumPrice || p.averageBuyPrice || 0;
          return sum + (p.quantity * premium * contractMultiplier);
        }, 0);
        const totalCurrent = group.originalPositions.reduce((sum, p) => {
          const current = p.currentPrice || p.premiumPrice || p.averageBuyPrice || 0;
          return sum + (p.quantity * current * contractMultiplier);
        }, 0);
        return {
          ...group,
          averageBuyPrice: group.quantity > 0 ? totalPremium / (group.quantity * contractMultiplier) : 0,
          currentPrice: group.quantity > 0 ? totalCurrent / (group.quantity * contractMultiplier) : 0,
          isAggregated: group.originalPositions.length > 1,
          positionCount: group.originalPositions.length,
        };
      } else {
        return {
          ...group,
          averageBuyPrice: group.quantity > 0 ? group.totalCostBasis / group.quantity : 0,
          currentPrice: group.quantity > 0 ? group.totalCurrentValue / group.quantity : 0,
          isAggregated: group.originalPositions.length > 1,
          positionCount: group.originalPositions.length,
        };
      }
    });
  }, []);

  const aggregatedPositions = useMemo(() => aggregatePositions(positions), [positions, aggregatePositions]);

  const calculatePositionMetrics = useCallback((position) => {
    const positionCurrency = position.currency || accountCurrency;
    
    // Special handling for Cash positions
    if (position.assetType === 'Cash') {
      // For cash, show original value (not converted) and no price/P&L
      const originalValue = position.quantity; // Original value in its currency
      const weight = totalAccountValue > 0 ? (convertToGlobalCurrency(originalValue, positionCurrency) / totalAccountValue) * 100 : 0;
      
      return { 
        currentPrice: null, // Don't show current price for cash
        averageBuyPrice: null, // Don't show avg price for cash
        marketValue: originalValue, // Show original value in original currency
        pnl: null, // Don't show P&L for cash
        pnlPercent: null, // Don't show P&L % for cash
        weight,
        isCash: true,
        cashCurrency: positionCurrency,
      };
    }
    
    // For options, use premiumPrice as the price, and multiply by 100 (standard contract multiplier)
    let currentPrice, averageBuyPrice;
    if (position.assetType === 'Option') {
      averageBuyPrice = position.premiumPrice || position.averageBuyPrice || 0;
      currentPrice = position.currentPrice || averageBuyPrice;
      // Options are typically priced per share, but contracts represent 100 shares
      // So we multiply by 100 for the contract value
      const contractMultiplier = 100;
      const marketValue = position.quantity * currentPrice * contractMultiplier;
      const costBasis = position.quantity * averageBuyPrice * contractMultiplier;
      const pnl = marketValue - costBasis;
      const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
      
      // Convert to global currency
      const convertedCurrentPrice = convertToGlobalCurrency(currentPrice, positionCurrency);
      const convertedMarketValue = convertToGlobalCurrency(marketValue, positionCurrency);
      const convertedCostBasis = convertToGlobalCurrency(costBasis, positionCurrency);
      const convertedPnL = convertedMarketValue - convertedCostBasis;
      const weight = totalAccountValue > 0 ? (convertedMarketValue / totalAccountValue) * 100 : 0;

      return { 
        currentPrice: convertedCurrentPrice, 
        averageBuyPrice: convertToGlobalCurrency(averageBuyPrice, positionCurrency),
        marketValue: convertedMarketValue, 
        pnl: convertedPnL, 
        pnlPercent, 
        weight 
      };
    } else {
      // Standard calculation for non-options
      currentPrice = position.currentPrice || position.averageBuyPrice;
      averageBuyPrice = position.averageBuyPrice;
      const marketValue = position.quantity * currentPrice;
      const costBasis = position.quantity * averageBuyPrice;
      const pnl = marketValue - costBasis;
      const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
      
      // Convert to global currency
      const convertedCurrentPrice = convertToGlobalCurrency(currentPrice, positionCurrency);
      const convertedMarketValue = convertToGlobalCurrency(marketValue, positionCurrency);
      const convertedCostBasis = convertToGlobalCurrency(costBasis, positionCurrency);
      const convertedPnL = convertedMarketValue - convertedCostBasis;
      const weight = totalAccountValue > 0 ? (convertedMarketValue / totalAccountValue) * 100 : 0;

      return { 
        currentPrice: convertedCurrentPrice, 
        averageBuyPrice: convertToGlobalCurrency(averageBuyPrice, positionCurrency),
        marketValue: convertedMarketValue, 
        pnl: convertedPnL, 
        pnlPercent, 
        weight 
      };
    }
  }, [totalAccountValue, convertToGlobalCurrency, accountCurrency]);

  const combinedItems = useMemo(() => [
    ...aggregatedPositions.map(p => ({ ...p, itemType: 'position' })),
    ...dayTrades.map(dt => ({ ...dt, itemType: 'daytrade' }))
  ].sort((a, b) => {
    if (a.itemType === 'daytrade' && b.itemType === 'position') return 1;
    if (a.itemType === 'position' && b.itemType === 'daytrade') return -1;
    return 0;
  }), [aggregatedPositions, dayTrades]);

  if (combinedItems.length === 0) {
    return (
      <div className={cn("text-center py-12 rounded-lg border", colors.bgTertiary, colors.border)}>
        <p className={colors.textTertiary}>{t('noPositionsYet')}</p>
      </div>
    );
  }

  // Confirm delete handler
  const confirmDelete = useCallback(() => {
    if (deleteConfirmDialog.isDayTrade) {
      onDeleteDayTrade(deleteConfirmDialog.item.id);
    } else if (deleteConfirmDialog.isAggregated && deleteConfirmDialog.item.originalPositions) {
      deleteConfirmDialog.item.originalPositions.forEach(pos => onDelete(pos.id));
    } else {
      onDelete(deleteConfirmDialog.item.id);
    }
    setDeleteConfirmDialog({ open: false, item: null, isDayTrade: false, isAggregated: false });
  }, [deleteConfirmDialog, onDelete, onDeleteDayTrade]);

  // Mobile card component for positions
  const MobilePositionCard = ({ item }) => {
    if (item.itemType === 'daytrade') {
      const dayTradeCurrency = item.currency || accountCurrency;
      const convertedProfitLoss = convertToGlobalCurrency(item.profitLoss, dayTradeCurrency);
      const isPositive = convertedProfitLoss >= 0;
      const dayTradeLabel = t('dayTrade') !== 'dayTrade' ? t('dayTrade') : 'Day Trade';
      const dayTradeNotesTitle = t('dayTradeNotes') !== 'dayTradeNotes' ? t('dayTradeNotes') : 'Day Trade Notes';
      return (
        <div className={cn("p-2 rounded-lg border", colors.cardBg, colors.cardBorder)}>
          <div className="flex items-center justify-between mb-2">
            <Badge className={cn('text-[9px] border px-1 py-0', 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30')}>
              {dayTradeLabel}
            </Badge>
            <span className={cn("text-[9px]", colors.textTertiary)}>{formatDate(item.date)}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-[10px]", colors.textSecondary)}>{t('totalPnL') !== 'totalPnL' ? t('totalPnL') : 'P&L'}</span>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-0.5">
                {isPositive ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                <span className={cn("font-semibold text-xs", isPositive ? 'text-green-400' : 'text-red-400')}>
                  <BlurValue blur={user?.blurValues}>
                    {isPositive ? '+' : ''}{formatCurrency(convertedProfitLoss, userCurrency)}
                  </BlurValue>
                </span>
              </div>
              {userCurrency !== 'USD' && (() => {
                const usdValue = convertToUSD(convertedProfitLoss);
                return usdValue !== null ? (
                  <span className={cn("text-[9px]", isPositive ? 'text-green-400/70' : 'text-red-400/70')}>
                    <BlurValue blur={user?.blurValues}>
                      {isPositive && usdValue >= 0 ? '+' : ''}{formatCurrency(usdValue, 'USD')}
                    </BlurValue>
                  </span>
                ) : null;
              })()}
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-[#5C8374]/10">
            {item.notes && (
              <Button size="sm" variant="ghost" onClick={() => setNotesDialog({ open: true, notes: item.notes, title: dayTradeNotesTitle })} className={cn("h-6 px-1.5", colors.textSecondary)}>
                <FileText className="w-3 h-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onEditDayTrade(item)} className={cn("h-6 px-1.5", colors.textSecondary)}>
              <Edit className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmDialog({ open: true, item: item, isDayTrade: true, isAggregated: false })} className="h-6 px-1.5 text-red-400">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    const metrics = calculatePositionMetrics(item);
    const isPositive = metrics.pnl !== null && metrics.pnl >= 0;
    const isAggregated = item.isAggregated;
    
    const handleDelete = () => {
      setDeleteConfirmDialog({ 
        open: true, 
        item: item, 
        isDayTrade: false, 
        isAggregated: isAggregated 
      });
    };
    
    const handleEdit = () => {
      if (isAggregated && item.originalPositions) {
        onEdit(item.originalPositions[0]);
      } else {
        onEdit(item);
      }
    };

    const quantityLabel = t('quantity') !== 'quantity' ? t('quantity') : 'Quantity';
    const avgPriceLabel = t('avgPrice') !== 'avgPrice' ? t('avgPrice') : 'Avg Price';
    const currentAmountLabel = t('currentAmount') !== 'currentAmount' ? t('currentAmount') : 'Current Price';
    const totalValueLabel = t('totalValue') !== 'totalValue' ? t('totalValue') : 'Total Value';
    const weightLabel = t('weight') !== 'weight' ? t('weight') : 'weight';
    const notesTitle = t('notes') !== 'notes' ? `${item.symbol} ${t('notes')}` : `${item.symbol} Notes`;

    return (
      <div className={cn("p-2 rounded-lg border", colors.cardBg, colors.cardBorder)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("font-bold text-sm truncate", colors.textPrimary)}>
                {item.symbol}
                {item.assetType === 'Cash' && item.currency && (
                  <span className={cn("text-xs font-normal ml-1", colors.textTertiary)}>
                    ({item.currency})
                  </span>
                )}
              </span>
              {isAggregated && (
                <span className="text-[9px] px-1 py-0 rounded bg-[#5C8374]/20 text-[#9EC8B9] flex-shrink-0">×{item.positionCount}</span>
              )}
            </div>
            {item.assetType === 'Option' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn("text-[8px] px-1 py-0 rounded", 
                  item.optionType === 'Call' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                )}>
                  {item.optionType || 'Call'}
                </span>
                <span className={cn("text-[8px] px-1 py-0 rounded",
                  item.optionAction === 'Buy' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'
                )}>
                  {item.optionAction || 'Buy'}
                </span>
                {item.strikePrice && (
                  <span className={cn("text-[8px]", colors.textTertiary)}>
                    Strike: {formatCurrency(item.strikePrice, item.currency || accountCurrency)}
                  </span>
                )}
              </div>
            )}
          </div>
          <Badge className={cn('text-[9px] border px-1 py-0 flex-shrink-0', assetTypeColors[item.assetType])}>{item.assetType}</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-2">
          {item.assetType !== 'Cash' && (
            <div>
              <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{quantityLabel}</p>
              <p className={cn("font-medium text-xs", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>{item.quantity.toLocaleString()}</BlurValue>
              </p>
            </div>
          )}
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>
              {item.assetType === 'Option' ? 'Premium' : avgPriceLabel}
            </p>
            <div className="flex flex-col items-end">
              {item.assetType === 'Cash' ? (
                <span className={cn("text-xs", colors.textTertiary)}>-</span>
              ) : item.assetType === 'Option' && item.premiumPrice ? (
                <>
                  <p className={cn("font-medium text-xs", colors.textPrimary)}>
                    <BlurValue blur={user?.blurValues}>{formatCurrency(item.premiumPrice, userCurrency)}</BlurValue>
                  </p>
                  {userCurrency !== 'USD' && (() => {
                    const usdValue = convertToUSD(item.premiumPrice);
                    return usdValue !== null ? (
                      <p className={cn("text-[8px] font-normal", colors.textTertiary)}>
                        <BlurValue blur={user?.blurValues}>{formatCurrency(usdValue, 'USD')}</BlurValue>
                      </p>
                    ) : null;
                  })()}
                </>
              ) : (
                <>
                  <p className={cn("font-medium text-xs", colors.textPrimary)}>
                    <BlurValue blur={user?.blurValues}>{formatCurrency(metrics.averageBuyPrice, userCurrency)}</BlurValue>
                  </p>
                  {userCurrency !== 'USD' && (() => {
                    const usdValue = convertToUSD(metrics.averageBuyPrice);
                    return usdValue !== null ? (
                      <p className={cn("text-[8px] font-normal", colors.textTertiary)}>
                        <BlurValue blur={user?.blurValues}>{formatCurrency(usdValue, 'USD')}</BlurValue>
                      </p>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          </div>
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{currentAmountLabel}</p>
            <div className="flex flex-col items-end">
              <p className={cn("font-medium text-xs", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>{formatCurrency(metrics.currentPrice, userCurrency)}</BlurValue>
              </p>
              {userCurrency !== 'USD' && (() => {
                const usdValue = convertToUSD(metrics.currentPrice);
                return usdValue !== null ? (
                  <p className={cn("text-[8px] font-normal", colors.textTertiary)}>
                    <BlurValue blur={user?.blurValues}>{formatCurrency(usdValue, 'USD')}</BlurValue>
                  </p>
                ) : null;
              })()}
            </div>
          </div>
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{totalValueLabel}</p>
            <div className="flex flex-col items-end">
              <p className={cn("font-semibold text-xs", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>{formatCurrency(metrics.marketValue, userCurrency)}</BlurValue>
              </p>
              {userCurrency !== 'USD' && (() => {
                const usdValue = convertToUSD(metrics.marketValue);
                return usdValue !== null ? (
                  <p className={cn("text-[8px] font-normal", colors.textTertiary)}>
                    <BlurValue blur={user?.blurValues}>{formatCurrency(usdValue, 'USD')}</BlurValue>
                  </p>
                ) : null;
              })()}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between py-1.5 border-t border-[#5C8374]/10 mb-1.5">
          {item.assetType === 'Cash' ? (
            <>
              <span className={cn("text-xs", colors.textTertiary)}>-</span>
              <span className={cn("text-[9px] flex-shrink-0", colors.textTertiary)}>{metrics.weight.toFixed(1)}% {weightLabel}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {isPositive ? <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <span className={cn("font-semibold text-xs", isPositive ? 'text-green-400' : 'text-red-400')}>
                    <BlurValue blur={user?.blurValues}>{isPositive ? '+' : ''}{formatCurrency(metrics.pnl, userCurrency)}</BlurValue>
                  </span>
                  {userCurrency !== 'USD' && (() => {
                    const usdValue = convertToUSD(metrics.pnl);
                    return usdValue !== null ? (
                      <span className={cn("text-[8px] ml-0.5 block", isPositive ? 'text-green-400/70' : 'text-red-400/70')}>
                        <BlurValue blur={user?.blurValues}>{isPositive && usdValue >= 0 ? '+' : ''}{formatCurrency(usdValue, 'USD')}</BlurValue>
                      </span>
                    ) : null;
                  })()}
                  <span className={cn("text-[9px] ml-0.5", isPositive ? 'text-green-400/70' : 'text-red-400/70')}>
                    ({isPositive ? '+' : ''}{metrics.pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <span className={cn("text-[9px] flex-shrink-0", colors.textTertiary)}>{metrics.weight.toFixed(1)}% {weightLabel}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-[#5C8374]/10">
          {item.notes && (
            <Button size="sm" variant="ghost" onClick={() => setNotesDialog({ open: true, notes: item.notes, title: notesTitle })} className={cn("h-6 px-1.5", colors.textSecondary)}>
              <FileText className="w-3 h-3" />
            </Button>
          )}
          {item.assetType !== 'Cash' && onSell && (
            <Button size="sm" variant="ghost" onClick={() => onSell(item)} className="h-6 px-1.5 text-green-400">
              <DollarSign className="w-3 h-3" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleEdit} className={cn("h-6 px-1.5", colors.textSecondary)}>
            <Edit className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete} className="h-6 px-1.5 text-red-400">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={notesDialog.open} onOpenChange={(open) => setNotesDialog({ ...notesDialog, open })}>
        <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
          <DialogHeader>
            <DialogTitle className={cn("text-lg font-bold", colors.accentText)}>{notesDialog.title}</DialogTitle>
          </DialogHeader>
          <div className={cn("mt-4 p-4 rounded-lg", colors.bgTertiary, colors.textSecondary)}>
            {notesDialog.notes || 'No notes available'}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.open} onOpenChange={(open) => setDeleteConfirmDialog({ ...deleteConfirmDialog, open })}>
        <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
          <DialogHeader>
            <DialogTitle className={cn("text-lg font-bold", colors.accentText)}>
              {t('confirmDelete') || 'Confirm Delete'}
            </DialogTitle>
            <DialogDescription className={cn("mt-2", colors.textSecondary)}>
              {deleteConfirmDialog.isDayTrade 
                ? (t('confirmDeleteDayTrade') || 'Are you sure you want to delete this day trade? This action cannot be undone.')
                : deleteConfirmDialog.isAggregated
                ? (t('confirmDeleteAllPositions')?.replace('{symbol}', deleteConfirmDialog.item?.symbol || 'this symbol') || `Are you sure you want to delete all positions for ${deleteConfirmDialog.item?.symbol || 'this symbol'}? This action cannot be undone.`)
                : (t('confirmDeletePosition') || `Are you sure you want to delete this position? This action cannot be undone.`)
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmDialog({ open: false, item: null, isDayTrade: false, isAggregated: false })}
              className={cn("border", colors.border, colors.textPrimary, "hover:bg-opacity-50", colors.bgTertiary)}
            >
              {t('cancel') || 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className={cn("bg-red-500 hover:bg-red-600 text-white border-red-500")}
            >
              {t('delete') || 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2">
        {combinedItems.map((item) => (
          <MobilePositionCard key={item.itemType === 'daytrade' ? `dt-${item.id}` : item.symbol} item={item} />
        ))}
      </div>

      {/* Desktop Table View */}
      <div className={cn("hidden md:block overflow-x-auto custom-scrollbar rounded-lg border", colors.border)}>
        <Table>
          <TableHeader>
            <TableRow className={cn(colors.bgSecondary, colors.border, "border-b")}>
              <TableHead className={cn("font-semibold", colors.textSecondary)}>{t('date') !== 'date' ? t('date') : 'Date'}</TableHead>
              <TableHead className={cn("font-semibold", colors.textSecondary)}>{t('symbol') !== 'symbol' ? t('symbol') : 'Symbol'}</TableHead>
              <TableHead className={cn("font-semibold", colors.textSecondary)}>{t('type') !== 'type' ? t('type') : 'Type'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('quantity') !== 'quantity' ? t('quantity') : 'Quantity'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('avgPrice') !== 'avgPrice' ? t('avgPrice') : 'Avg Price'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('currentAmount') !== 'currentAmount' ? t('currentAmount') : 'Current Price'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('totalValue') !== 'totalValue' ? t('totalValue') : 'Total Value'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('totalPnL') !== 'totalPnL' ? t('totalPnL') : 'Total P&L'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('weight') !== 'weight' ? t('weight') : 'Weight'}</TableHead>
              <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>{t('edit') !== 'edit' ? t('edit') : 'Edit'}</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {combinedItems.map((item) => {
            if (item.itemType === 'daytrade') {
              const dayTradeCurrency = item.currency || accountCurrency;
              const convertedProfitLoss = convertToGlobalCurrency(item.profitLoss, dayTradeCurrency);
              const isPositive = convertedProfitLoss >= 0;
              return (
                <TableRow
                  key={`daytrade-${item.id}`}
                  className={cn(colors.borderLight, "border-b hover:bg-opacity-50 transition-colors")}
                >
                  <TableCell className={cn("text-sm", colors.textSecondary)}>
                    {formatDate(item.date)}
                  </TableCell>
                  <TableCell className={cn("font-semibold", colors.textPrimary)}>
                    -
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs border', 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30')}>
                      {t('dayTrade') !== 'dayTrade' ? t('dayTrade') : 'Day Trade'}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    -
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    -
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    -
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", colors.textPrimary)}>
                    -
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3 text-green-400" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-400" />
                      )}
                      <div>
                        <div className={cn(
                          'font-semibold text-sm',
                          isPositive ? 'text-green-400' : 'text-red-400'
                        )}>
                          <BlurValue blur={user?.blurValues}>
                            {isPositive ? '+' : ''}{formatCurrency(convertedProfitLoss, userCurrency)}
                          </BlurValue>
                        </div>
                        {userCurrency !== 'USD' && (() => {
                          const usdValue = convertToUSD(convertedProfitLoss);
                          return usdValue !== null ? (
                            <div className={cn(
                              'text-xs',
                              isPositive ? 'text-green-400/70' : 'text-red-400/70'
                            )}>
                              <BlurValue blur={user?.blurValues}>
                                {isPositive && usdValue >= 0 ? '+' : ''}{formatCurrency(usdValue, 'USD')}
                              </BlurValue>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    -
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.notes && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setNotesDialog({ open: true, notes: item.notes, title: (t('dayTradeNotes') !== 'dayTradeNotes' ? t('dayTradeNotes') : 'Day Trade Notes') })}
                          className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onEditDayTrade(item)}
                        className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirmDialog({ open: true, item: item, isDayTrade: true, isAggregated: false })}
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            } else {
              const metrics = calculatePositionMetrics(item);
              const isPositive = metrics.pnl !== null && metrics.pnl >= 0;
              const isAggregated = item.isAggregated;
              
              // Handle delete for aggregated positions (delete all)
              const handleDelete = () => {
                setDeleteConfirmDialog({ 
                  open: true, 
                  item: item, 
                  isDayTrade: false, 
                  isAggregated: isAggregated 
                });
              };
              
              // Handle edit - use first original position if aggregated
              const handleEdit = () => {
                if (isAggregated && item.originalPositions) {
                  onEdit(item.originalPositions[0]);
                } else {
                  onEdit(item);
                }
              };
              
              return (
                <TableRow
                  key={item.symbol}
                  className={cn(colors.borderLight, "border-b hover:bg-opacity-50 transition-colors")}
                >
                  <TableCell className={cn("text-sm", colors.textSecondary)}>
                    {formatDate(item.date)}
                  </TableCell>
                  <TableCell className={cn("font-semibold", colors.textPrimary)}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {item.symbol}
                        {item.assetType === 'Cash' && item.currency && (
                          <span className={cn("text-xs font-normal", colors.textTertiary)}>
                            ({item.currency})
                          </span>
                        )}
                        {isAggregated && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#5C8374]/20 text-[#9EC8B9]">
                            ×{item.positionCount}
                          </span>
                        )}
                      </div>
                      {item.assetType === 'Option' && (
                        <div className="flex items-center gap-2 text-xs opacity-75">
                          <span className={cn("px-1.5 py-0.5 rounded", 
                            item.optionType === 'Call' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {item.optionType || 'Call'}
                          </span>
                          <span className={cn("px-1.5 py-0.5 rounded",
                            item.optionAction === 'Buy' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'
                          )}>
                            {item.optionAction || 'Buy'}
                          </span>
                          {item.strikePrice && (
                            <span className={cn("text-xs", colors.textTertiary)}>
                              Strike: {formatCurrency(item.strikePrice, item.currency || accountCurrency)}
                            </span>
                          )}
                          {item.expirationDate && (
                            <span className={cn("text-xs", colors.textTertiary)}>
                              Exp: {new Date(item.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs border', assetTypeColors[item.assetType])}>
                      {item.assetType}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    {item.assetType === 'Cash' ? (
                      <span className={cn("text-xs", colors.textTertiary)}>-</span>
                    ) : (
                      <BlurValue blur={user?.blurValues}>
                        {item.quantity.toLocaleString()}
                      </BlurValue>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    {item.assetType === 'Cash' ? (
                      <span className={cn("text-xs", colors.textTertiary)}>-</span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <BlurValue blur={user?.blurValues}>
                          {formatCurrency(metrics.averageBuyPrice, userCurrency)}
                        </BlurValue>
                        {userCurrency !== 'USD' && (() => {
                          const usdValue = convertToUSD(metrics.averageBuyPrice);
                          return usdValue !== null ? (
                            <span className={cn("text-xs", colors.textTertiary)}>
                              <BlurValue blur={user?.blurValues}>
                                {formatCurrency(usdValue, 'USD')}
                              </BlurValue>
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    {item.assetType === 'Cash' ? (
                      <span className={cn("text-xs", colors.textTertiary)}>-</span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <BlurValue blur={user?.blurValues}>
                          {formatCurrency(metrics.currentPrice, userCurrency)}
                        </BlurValue>
                        {userCurrency !== 'USD' && (() => {
                          const usdValue = convertToUSD(metrics.currentPrice);
                          return usdValue !== null ? (
                            <span className={cn("text-xs", colors.textTertiary)}>
                              <BlurValue blur={user?.blurValues}>
                                {formatCurrency(usdValue, 'USD')}
                              </BlurValue>
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", colors.textPrimary)}>
                    <div className="flex flex-col items-end">
                      {item.assetType === 'Cash' ? (
                        <BlurValue blur={user?.blurValues}>
                          {formatCurrency(metrics.marketValue, metrics.cashCurrency || userCurrency)}
                        </BlurValue>
                      ) : (
                        <>
                          <BlurValue blur={user?.blurValues}>
                            {formatCurrency(metrics.marketValue, userCurrency)}
                          </BlurValue>
                          {userCurrency !== 'USD' && (() => {
                            const usdValue = convertToUSD(metrics.marketValue);
                            return usdValue !== null ? (
                              <span className={cn("text-xs font-normal", colors.textTertiary)}>
                                <BlurValue blur={user?.blurValues}>
                                  {formatCurrency(usdValue, 'USD')}
                                </BlurValue>
                              </span>
                            ) : null;
                          })()}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.assetType === 'Cash' ? (
                      <span className={cn("text-xs", colors.textTertiary)}>-</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3 text-green-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-400" />
                        )}
                        <div>
                          <div className={cn(
                            'font-semibold text-sm',
                            isPositive ? 'text-green-400' : 'text-red-400'
                          )}>
                            <BlurValue blur={user?.blurValues}>
                              {isPositive ? '+' : ''}{formatCurrency(metrics.pnl, userCurrency)}
                            </BlurValue>
                          </div>
                          {userCurrency !== 'USD' && (() => {
                            const usdValue = convertToUSD(metrics.pnl);
                            return usdValue !== null ? (
                              <div className={cn(
                                'text-xs',
                                isPositive ? 'text-green-400/70' : 'text-red-400/70'
                              )}>
                                <BlurValue blur={user?.blurValues}>
                                  {isPositive && usdValue >= 0 ? '+' : ''}{formatCurrency(usdValue, 'USD')}
                                </BlurValue>
                              </div>
                            ) : null;
                          })()}
                          <div className={cn(
                            'text-xs',
                            isPositive ? 'text-green-400/70' : 'text-red-400/70'
                          )}>
                            <BlurValue blur={user?.blurValues}>
                              {isPositive ? '+' : ''}{metrics.pnlPercent.toFixed(2)}%
                            </BlurValue>
                          </div>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    <BlurValue blur={user?.blurValues}>
                      {metrics.weight.toFixed(1)}%
                    </BlurValue>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.notes && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setNotesDialog({ open: true, notes: item.notes, title: (t('notes') !== 'notes' ? `${item.symbol} ${t('notes')}` : `${item.symbol} Notes`) })}
                          className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                          title={t('viewNotes') !== 'viewNotes' ? t('viewNotes') : 'View Notes'}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      )}
                      {/* Sell button - only for non-cash positions */}
                      {item.assetType !== 'Cash' && onSell && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onSell(item)}
                          className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-500/20"
                          title={t('sell') || 'Sell'}
                        >
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleEdit}
                        className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                        title={isAggregated ? (t('editFirst') || 'Edit first entry') : (t('edit') || 'Edit')}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleDelete}
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                        title={isAggregated ? (t('deleteAll') || 'Delete all') : (t('delete') || 'Delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
          })}
        </TableBody>
      </Table>
      </div>
    </>
  );
}

export default React.memo(PositionTable);