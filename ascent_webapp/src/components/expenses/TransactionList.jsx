import React, { useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Edit, Trash2, TrendingUp, TrendingDown, Calendar, DollarSign, CreditCard, Banknote, ArrowLeftRight, MoreVertical, Copy, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
import { useHousehold } from '@/hooks/useHousehold';

const categoryColors = {
  'Food & Dining': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  'Groceries': 'bg-success/10 text-success border-success/30',
  'Rent & Housing': 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  'Transportation': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  'Healthcare': 'bg-danger/10 text-danger border-danger/30',
  'Entertainment': 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30',
  'Shopping': 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  'Utilities': 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  'Insurance': 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  'Investment Fees': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'Taxes': 'bg-danger/10 text-danger border-danger/30',
  'Salary': 'bg-success/10 text-success border-success/30',
  'Investment Income': 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30',
  'Other': 'bg-muted text-muted-foreground border-border',
};

const TransactionItem = React.memo(({ transaction, onEdit, onDelete, onDuplicate, cards, colors, language, user, t, canEdit = true, author = null }) => {
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'ILS';

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
      currency: currency || user?.currency || 'ILS',
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
    <div key={transaction.id} className="group rounded-2xl border border-border/50 bg-muted/40 transition-all hover:border-primary/40 hover:bg-muted/70">
      <div className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Type Icon */}
            <span className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl",
              transaction.type === 'Income' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
            )}>
              {transaction.type === 'Income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </span>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {!isObjId && (
                  <Badge className={cn('text-xs border', categoryColors[transaction.category] || categoryColors['Other'])}>
                    {translateCategory(transaction.category, language)}
                  </Badge>
                )}
                {transaction.isRecurring && (
                  <Badge className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary border-primary/30 flex items-center gap-1">
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
                <span className="text-primary">•</span>
                <span className="uppercase">{transaction.currency}</span>
                {author && (
                  <>
                    <span className="text-primary">•</span>
                    <span className="flex items-center gap-1" title={`${t('addedBy')} ${author.name}`}>
                      <span
                        aria-hidden
                        className="grid h-5 w-5 place-items-center rounded-full text-xs font-semibold leading-none text-background"
                        style={{ backgroundColor: author.color }}
                      >
                        {author.initials.slice(0, 1)}
                      </span>
                      <span className="truncate max-w-[6rem]">{author.isMe ? t('me') : author.name}</span>
                    </span>
                  </>
                )}
                {transaction.paymentMethod && (
                  <>
                    <span className="text-primary">•</span>
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
                'text-base font-bold tabular-nums whitespace-nowrap',
                transaction.type === 'Income' ? 'text-success' : 'text-danger'
              )}>
                {transaction.type === 'Income' ? '+' : '-'}
                {formatCurrency(transaction.amount, transaction.currency)}
              </span>
              {convertedAmount !== null && convertedAmount !== undefined && (
                <span className={cn("text-xs text-muted-foreground dark:text-muted-foreground whitespace-nowrap")}>
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
                    aria-label={t('moreActions')}
                    variant="ghost"
                    className={cn("h-11 w-11 sm:h-8 sm:w-8 hover:bg-primary/20", colors.textSecondary)}
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
                    className={cn("cursor-pointer", colors.textPrimary, "hover:bg-primary/20")}
                  >
                    <Edit className="w-4 h-4 me-2" />
                    <span>{t('edit')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDuplicate}
                    className={cn("cursor-pointer", colors.textPrimary, "hover:bg-primary/20")}
                  >
                    <Copy className="w-4 h-4 me-2" />
                    <span>{t('duplicate')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className={cn("cursor-pointer text-danger hover:text-danger hover:bg-danger/20")}
                  >
                    <Trash2 className="w-4 h-4 me-2" />
                    <span>{t('delete')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';

/**
 * @typedef {Object} TransactionListProps
 * @property {Array} transactions
 * @property {Array} cards
 * @property {Function} onEdit
 * @property {Function} onDelete
 * @property {Function} onDuplicate
 * @property {boolean} canEdit
 */

/**
 * @param {TransactionListProps} props
 */
function TransactionList({
  transactions,
  cards = [],
  onEdit,
  onDelete,
  onDuplicate,
  canEdit = true
}) {
  const { t, language, colors, user } = useTheme();
  const { byEmail, isShared } = useHousehold();

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
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
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
          author={isShared ? byEmail[transaction.created_by] || null : null}
        />
      ))}
    </div>
  );
}

export default React.memo(TransactionList);