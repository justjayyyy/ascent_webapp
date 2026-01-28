import React, { useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Edit, Trash2, TrendingUp, TrendingDown, Calendar, DollarSign, CreditCard, Banknote, ArrowLeftRight, MoreVertical, Copy, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTheme, translateCategory } from '../ThemeProvider';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

const categoryColors = {
  'Food & Dining': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  'Groceries': 'bg-green-500/10 text-green-400 border-green-500/30',
  'Rent & Housing': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'Transportation': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Healthcare': 'bg-red-500/10 text-red-400 border-red-500/30',
  'Entertainment': 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  'Shopping': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  'Utilities': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  'Insurance': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  'Investment Fees': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Taxes': 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  'Salary': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'Investment Income': 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  'Other': 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

const TransactionItem = React.memo(({ transaction, onEdit, onDelete, onDuplicate, cards, colors, language, user, t, canEdit = true }) => {
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'USD';

  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  const getPaymentMethodIcon = useCallback((method) => {
    switch (method) {
      case 'Card': return CreditCard;
      case 'Cash': return Banknote;
      case 'Transfer': return ArrowLeftRight;
      default: return null;
    }
  }, []);

  const getCardInfo = useCallback((cardId) => {
    const card = cards.find(c => c.id === cardId);
    return card ? `${card.name || card.cardName || ''} •••• ${card.lastFourDigits || ''}` : 'Card';
  }, [cards]);

  const isObjectId = useCallback((str) => {
    return str && /^[0-9a-fA-F]{24}$/.test(str);
  }, []);

  const formatCurrency = useCallback((value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }, [user?.currency]);

  // Calculate converted amount (use stored value if available, otherwise calculate on the fly)
  const convertedAmount = useMemo(() => {
    if (transaction.currency === userCurrency) {
      return null; // No conversion needed
    }
    
    // Use stored converted amount if available
    if (transaction.amountInGlobalCurrency !== null && transaction.amountInGlobalCurrency !== undefined) {
      return transaction.amountInGlobalCurrency;
    }
    
    // Fallback: calculate on the fly if rates are available
    if (rates && Object.keys(rates).length > 0) {
      return convertCurrency(transaction.amount, transaction.currency || 'USD', userCurrency, rates);
    }
    
    return null;
  }, [transaction.amount, transaction.currency, transaction.amountInGlobalCurrency, userCurrency, rates, convertCurrency]);

  const handleEdit = useCallback(() => {
    onEdit(transaction);
  }, [onEdit, transaction]);

  const handleDelete = useCallback(() => {
    onDelete(transaction.id);
  }, [onDelete, transaction.id]);

  const handleDuplicate = useCallback(() => {
    onDuplicate(transaction);
  }, [onDuplicate, transaction]);

  const isObjId = isObjectId(transaction.category);
  const Icon = getPaymentMethodIcon(transaction.paymentMethod);

  return (
    <Card key={transaction.id} className={cn(colors.cardBg, colors.cardBorder, "hover:border-[#5C8374]/40 transition-all")}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Type Icon */}
            {transaction.type === 'Income' ? (
              <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            
            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {!isObjId && (
                  <Badge className={cn('text-xs border', categoryColors[transaction.category] || categoryColors['Other'])}>
                    {translateCategory(transaction.category, language)}
                  </Badge>
                )}
                {transaction.isRecurring && (
                  <Badge className="text-[10px] px-1.5 py-0.5 bg-[#5C8374]/20 text-[#5C8374] border-[#5C8374]/30 flex items-center gap-1">
                    <Repeat className="w-2.5 h-2.5" />
                    {transaction.recurringFrequency === 'monthly' ? 'Monthly' : transaction.recurringFrequency}
                  </Badge>
                )}
                <h3 className={cn("font-semibold truncate text-sm", colors.textPrimary)}>
                  {transaction.description}
                </h3>
              </div>
              
              <div className={cn("flex items-center gap-2 text-xs", colors.textTertiary)}>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(transaction.date), 'MMM dd, yyyy')}
                </div>
                <span className="text-[#5C8374]">•</span>
                <span className="uppercase">{transaction.currency}</span>
                {transaction.paymentMethod && (
                  <>
                    <span className="text-[#5C8374]">•</span>
                    <div className="flex items-center gap-1">
                      {Icon && <Icon className="w-3 h-3" />}
                      <span>
                        {transaction.paymentMethod === 'Card' && transaction.cardId
                          ? getCardInfo(transaction.cardId)
                          : transaction.paymentMethod}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Amount and Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex flex-col items-end">
              <span className={cn(
                'text-base font-bold whitespace-nowrap',
                transaction.type === 'Income' ? 'text-green-400' : 'text-red-400'
              )}>
                {transaction.type === 'Income' ? '+' : '-'}
                {formatCurrency(transaction.amount, transaction.currency)}
              </span>
              {convertedAmount !== null && convertedAmount !== undefined && (
                <span className={cn("text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap")}>
                  {formatCurrency(convertedAmount, userCurrency)}
                </span>
              )}
            </div>
            
            {/* 3-dots Dropdown Menu */}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className={cn(colors.cardBg, colors.cardBorder, "min-w-[160px]")}
                >
                  <DropdownMenuItem
                    onClick={handleEdit}
                    className={cn("cursor-pointer", colors.textPrimary, "hover:bg-[#5C8374]/20")}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    <span>{t('edit')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDuplicate}
                    className={cn("cursor-pointer", colors.textPrimary, "hover:bg-[#5C8374]/20")}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    <span>{t('duplicate')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className={cn("cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/20")}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span>{t('delete')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

TransactionItem.displayName = 'TransactionItem';

function TransactionList({ transactions, onEdit, onDelete, onDuplicate, cards = [], canEdit = true }) {
  const { t, language, colors, user } = useTheme();

  const handleEdit = useCallback((transaction) => {
    onEdit(transaction);
  }, [onEdit]);

  const handleDelete = useCallback((id) => {
    onDelete(id);
  }, [onDelete]);

  const handleDuplicate = useCallback((transaction) => {
    onDuplicate(transaction);
  }, [onDuplicate]);

  if (transactions.length === 0) {
    return (
      <Card className={cn(colors.cardBg, colors.cardBorder)}>
        <CardContent className="p-12">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#5C8374]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className={cn("w-8 h-8", colors.accentText)} />
            </div>
            <h3 className={cn("text-xl font-semibold mb-2", colors.textPrimary)}>{t('noTransactionsFound')}</h3>
            <p className={colors.textTertiary}>
              {t('addFirstTransactionOrAdjust')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((transaction) => (
        <TransactionItem
          key={transaction.id}
          transaction={transaction}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          cards={cards}
          colors={colors}
          language={language}
          user={user}
          t={t}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

export default React.memo(TransactionList);