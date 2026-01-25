import React, { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, TrendingUp, TrendingDown, FileText, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import BlurValue from '../BlurValue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const assetTypeColors = {
  Stock: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ETF: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Option: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  Cash: 'bg-green-500/10 text-green-400 border-green-500/30',
  Crypto: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  Other: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function PositionTable({ positions, dayTrades = [], onEdit, onDelete, onSell, onEditDayTrade, onDeleteDayTrade, totalAccountValue }) {
  const { colors, t, user } = useTheme();
  const [notesDialog, setNotesDialog] = useState({ open: false, notes: '', title: '' });

  const formatCurrency = useCallback((value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  // Aggregate positions by symbol (memoized)
  const aggregatePositions = useCallback((positionsList) => {
    const grouped = {};
    
    positionsList.forEach(position => {
      const key = position.symbol;
      
      if (!grouped[key]) {
        grouped[key] = {
          ...position,
          quantity: 0,
          totalCostBasis: 0,
          totalCurrentValue: 0,
          originalPositions: [],
          notes: '',
        };
      }
      
      const currentPrice = position.currentPrice || position.averageBuyPrice;
      grouped[key].quantity += position.quantity;
      grouped[key].totalCostBasis += position.quantity * position.averageBuyPrice;
      grouped[key].totalCurrentValue += position.quantity * currentPrice;
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
    return Object.values(grouped).map(group => ({
      ...group,
      averageBuyPrice: group.quantity > 0 ? group.totalCostBasis / group.quantity : 0,
      currentPrice: group.quantity > 0 ? group.totalCurrentValue / group.quantity : 0,
      isAggregated: group.originalPositions.length > 1,
      positionCount: group.originalPositions.length,
    }));
  }, []);

  const aggregatedPositions = useMemo(() => aggregatePositions(positions), [positions, aggregatePositions]);

  const calculatePositionMetrics = useCallback((position) => {
    const currentPrice = position.currentPrice || position.averageBuyPrice;
    const marketValue = position.quantity * currentPrice;
    const costBasis = position.quantity * position.averageBuyPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
    const weight = totalAccountValue > 0 ? (marketValue / totalAccountValue) * 100 : 0;

    return { currentPrice, marketValue, pnl, pnlPercent, weight };
  }, [totalAccountValue]);

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

  // Mobile card component for positions
  const MobilePositionCard = ({ item }) => {
    if (item.itemType === 'daytrade') {
      const isPositive = item.profitLoss >= 0;
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
            <div className="flex items-center gap-0.5">
              {isPositive ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
              <span className={cn("font-semibold text-xs", isPositive ? 'text-green-400' : 'text-red-400')}>
                <BlurValue blur={user?.blurValues}>
                  {isPositive ? '+' : ''}{formatCurrency(item.profitLoss)}
                </BlurValue>
              </span>
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
            <Button size="sm" variant="ghost" onClick={() => onDeleteDayTrade(item.id)} className="h-6 px-1.5 text-red-400">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    const metrics = calculatePositionMetrics(item);
    const isPositive = metrics.pnl >= 0;
    const isAggregated = item.isAggregated;
    
    const handleDelete = () => {
      if (isAggregated && item.originalPositions) {
        item.originalPositions.forEach(pos => onDelete(pos.id));
      } else {
        onDelete(item.id);
      }
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
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className={cn("font-bold text-sm truncate", colors.textPrimary)}>{item.symbol}</span>
            {isAggregated && (
              <span className="text-[9px] px-1 py-0 rounded bg-[#5C8374]/20 text-[#9EC8B9] flex-shrink-0">×{item.positionCount}</span>
            )}
          </div>
          <Badge className={cn('text-[9px] border px-1 py-0 flex-shrink-0', assetTypeColors[item.assetType])}>{item.assetType}</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{quantityLabel}</p>
            <p className={cn("font-medium text-xs", colors.textPrimary)}>
              <BlurValue blur={user?.blurValues}>{item.quantity.toLocaleString()}</BlurValue>
            </p>
          </div>
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{avgPriceLabel}</p>
            <p className={cn("font-medium text-xs", colors.textPrimary)}>
              <BlurValue blur={user?.blurValues}>{formatCurrency(item.averageBuyPrice, item.currency)}</BlurValue>
            </p>
          </div>
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{currentAmountLabel}</p>
            <p className={cn("font-medium text-xs", colors.textPrimary)}>
              <BlurValue blur={user?.blurValues}>{formatCurrency(metrics.currentPrice, item.currency)}</BlurValue>
            </p>
          </div>
          <div>
            <p className={cn("text-[9px] mb-0.5", colors.textTertiary)}>{totalValueLabel}</p>
            <p className={cn("font-semibold text-xs", colors.textPrimary)}>
              <BlurValue blur={user?.blurValues}>{formatCurrency(metrics.marketValue, item.currency)}</BlurValue>
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-between py-1.5 border-t border-[#5C8374]/10 mb-1.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isPositive ? <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />}
            <div className="min-w-0">
              <span className={cn("font-semibold text-xs", isPositive ? 'text-green-400' : 'text-red-400')}>
                <BlurValue blur={user?.blurValues}>{isPositive ? '+' : ''}{formatCurrency(metrics.pnl, item.currency)}</BlurValue>
              </span>
              <span className={cn("text-[9px] ml-0.5", isPositive ? 'text-green-400/70' : 'text-red-400/70')}>
                ({isPositive ? '+' : ''}{metrics.pnlPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
          <span className={cn("text-[9px] flex-shrink-0", colors.textTertiary)}>{metrics.weight.toFixed(1)}% {weightLabel}</span>
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
              const isPositive = item.profitLoss >= 0;
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
                            {isPositive ? '+' : ''}{formatCurrency(item.profitLoss)}
                          </BlurValue>
                        </div>
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
                        onClick={() => onDeleteDayTrade(item.id)}
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
              const isPositive = metrics.pnl >= 0;
              const isAggregated = item.isAggregated;
              
              // Handle delete for aggregated positions (delete all)
              const handleDelete = () => {
                if (isAggregated && item.originalPositions) {
                  // Delete all original positions
                  item.originalPositions.forEach(pos => onDelete(pos.id));
                } else {
                  onDelete(item.id);
                }
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
                    <div className="flex items-center gap-2">
                      {item.symbol}
                      {isAggregated && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#5C8374]/20 text-[#9EC8B9]">
                          ×{item.positionCount}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs border', assetTypeColors[item.assetType])}>
                      {item.assetType}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    <BlurValue blur={user?.blurValues}>
                      {item.quantity.toLocaleString()}
                    </BlurValue>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    <BlurValue blur={user?.blurValues}>
                      {formatCurrency(item.averageBuyPrice, item.currency)}
                    </BlurValue>
                  </TableCell>
                  <TableCell className={cn("text-right", colors.textSecondary)}>
                    <BlurValue blur={user?.blurValues}>
                      {formatCurrency(metrics.currentPrice, item.currency)}
                    </BlurValue>
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", colors.textPrimary)}>
                    <BlurValue blur={user?.blurValues}>
                      {formatCurrency(metrics.marketValue, item.currency)}
                    </BlurValue>
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
                            {isPositive ? '+' : ''}{formatCurrency(metrics.pnl, item.currency)}
                          </BlurValue>
                        </div>
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