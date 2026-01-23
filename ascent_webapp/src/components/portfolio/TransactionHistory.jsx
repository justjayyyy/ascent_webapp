import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import BlurValue from '../BlurValue';

const typeConfig = {
  buy: {
    label: 'Buy',
    labelHe: 'קנייה',
    labelRu: 'Покупка',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    icon: ShoppingCart,
  },
  sell: {
    label: 'Sell',
    labelHe: 'מכירה',
    labelRu: 'Продажа',
    color: 'bg-green-500/10 text-green-400 border-green-500/30',
    icon: TrendingUp,
  },
  deposit: {
    label: 'Deposit',
    labelHe: 'הפקדה',
    labelRu: 'Депозит',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    icon: DollarSign,
  },
  withdrawal: {
    label: 'Withdrawal',
    labelHe: 'משיכה',
    labelRu: 'Снятие',
    color: 'bg-red-500/10 text-red-400 border-red-500/30',
    icon: TrendingDown,
  },
};

export default function TransactionHistory({ transactions = [], isLoading, accountCurrency }) {
  const { colors, t, user } = useTheme();
  const [isExpanded, setIsExpanded] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  const formatCurrency = (value, currency = accountCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredTransactions = typeFilter === 'all' 
    ? transactions 
    : transactions.filter(tx => tx.type === typeFilter);

  const getTypeLabel = (type) => {
    const config = typeConfig[type];
    if (!config) return type;
    
    const lang = user?.language || 'en';
    if (lang === 'he') return config.labelHe;
    if (lang === 'ru') return config.labelRu;
    return config.label;
  };

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn("p-1 h-8 w-8", colors.textSecondary)}
            >
              {isExpanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </Button>
            <CardTitle className={colors.accentText}>
              {t('transactionHistory') || 'Transaction History'}
            </CardTitle>
            <Badge className={cn("text-xs", colors.bgTertiary, colors.textSecondary)}>
              {filteredTransactions.length}
            </Badge>
          </div>
          
          {isExpanded && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={cn("w-[130px] h-8", colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value="all" className={colors.textPrimary}>
                  {t('allTypes') || 'All Types'}
                </SelectItem>
                <SelectItem value="buy" className={colors.textPrimary}>
                  {t('buy') || 'Buy'}
                </SelectItem>
                <SelectItem value="sell" className={colors.textPrimary}>
                  {t('sell') || 'Sell'}
                </SelectItem>
                <SelectItem value="deposit" className={colors.textPrimary}>
                  {t('deposit') || 'Deposit'}
                </SelectItem>
                <SelectItem value="withdrawal" className={colors.textPrimary}>
                  {t('withdrawal') || 'Withdrawal'}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className={cn("w-6 h-6 animate-spin", colors.accentText)} />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className={cn("text-center py-8 rounded-lg border", colors.bgTertiary, colors.border)}>
              <p className={colors.textTertiary}>
                {t('noTransactionsYet') || 'No transactions yet'}
              </p>
              <p className={cn("text-sm mt-1", colors.textTertiary)}>
                {t('transactionsWillAppear') || 'Buy, sell, and deposit transactions will appear here'}
              </p>
            </div>
          ) : (
            <div className={cn("overflow-x-auto custom-scrollbar rounded-lg border", colors.border)}>
              <Table>
                <TableHeader>
                  <TableRow className={cn(colors.bgSecondary, colors.border, "border-b")}>
                    <TableHead className={cn("font-semibold", colors.textSecondary)}>
                      {t('date') || 'Date'}
                    </TableHead>
                    <TableHead className={cn("font-semibold", colors.textSecondary)}>
                      {t('type') || 'Type'}
                    </TableHead>
                    <TableHead className={cn("font-semibold", colors.textSecondary)}>
                      {t('symbol') || 'Symbol'}
                    </TableHead>
                    <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>
                      {t('quantity') || 'Qty'}
                    </TableHead>
                    <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>
                      {t('price') || 'Price'}
                    </TableHead>
                    <TableHead className={cn("font-semibold text-right", colors.textSecondary)}>
                      {t('total') || 'Total'}
                    </TableHead>
                    <TableHead className={cn("font-semibold", colors.textSecondary)}>
                      {t('notes') || 'Notes'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx) => {
                    const config = typeConfig[tx.type] || typeConfig.buy;
                    const IconComponent = config.icon;
                    const isInflow = tx.type === 'sell' || tx.type === 'deposit';
                    
                    return (
                      <TableRow
                        key={tx.id}
                        className={cn(colors.borderLight, "border-b hover:bg-opacity-50 transition-colors")}
                      >
                        <TableCell className={cn("text-sm", colors.textSecondary)}>
                          {formatDate(tx.date)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs border flex items-center gap-1 w-fit', config.color)}>
                            <IconComponent className="w-3 h-3" />
                            {getTypeLabel(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("font-medium", colors.textPrimary)}>
                          {tx.symbol || '-'}
                        </TableCell>
                        <TableCell className={cn("text-right", colors.textSecondary)}>
                          <BlurValue blur={user?.blurValues}>
                            {tx.quantity?.toLocaleString() || '-'}
                          </BlurValue>
                        </TableCell>
                        <TableCell className={cn("text-right", colors.textSecondary)}>
                          <BlurValue blur={user?.blurValues}>
                            {tx.pricePerUnit ? formatCurrency(tx.pricePerUnit, tx.currency) : '-'}
                          </BlurValue>
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold", isInflow ? 'text-green-400' : 'text-red-400')}>
                          <BlurValue blur={user?.blurValues}>
                            {isInflow ? '+' : '-'}{formatCurrency(Math.abs(tx.totalAmount), tx.currency)}
                          </BlurValue>
                        </TableCell>
                        <TableCell className={cn("text-sm max-w-[150px] truncate", colors.textTertiary)}>
                          {tx.notes || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
