import React, { useMemo, useState, useCallback, memo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingDown, TrendingUp, DollarSign, CreditCard, Banknote, Loader2, Search, X, ChevronLeft, ChevronRight, ArrowLeftRight, Wallet } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import DonutChart, { useDonutPalette } from '@/components/charts/DonutChart';
import TransactionList from './TransactionList';
import BudgetProgress from './BudgetProgress';
import BlurValue from '../BlurValue';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useDebounce } from '@/hooks/useDebounce';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
import { useHousehold } from '@/hooks/useHousehold';

const CARD_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#EF4444', '#6366F1', '#F97316'];

function ExpenseMonthView({
  transactions,
  budgets,
  cards,
  categories = [],
  onEdit,
  onDelete,
  onDuplicate,
  isLoading,
  monthLabel,
  selectedYear,
  selectedMonths = [],
  canEdit = true
}) {
  const { user, colors, t, language, theme, isRTL } = useTheme();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'ILS';
  const palette = useDonutPalette();
  const numLocale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';

  // Fetch exchange rates on mount
  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const { members, isShared } = useHousehold();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const hasActiveFilters = searchQuery || categoryFilter !== 'all' || personFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('all');
    setPersonFilter('all');
    setCurrentPage(1);
  }, []);

  // Apply filters to transactions (using debounced search)
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t => {
      // Search filter - match any text field (using debounced query)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase().trim();
        const description = (t.description || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const amount = t.amount?.toString() || '';
        const paymentMethod = (t.paymentMethod || '').toLowerCase();
        const type = (t.type || '').toLowerCase();
        const date = (t.date || '').toLowerCase();

        const matches = description.includes(query) ||
          category.includes(query) ||
          notes.includes(query) ||
          amount.includes(query) ||
          paymentMethod.includes(query) ||
          type.includes(query) ||
          date.includes(query);

        if (!matches) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

      // Person filter (who added it)
      if (personFilter !== 'all' && t.created_by !== personFilter) return false;

      return true;
    });

    return filtered;
  }, [transactions, debouncedSearchQuery, categoryFilter, personFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  // Reset page when filters change (using debounced search)
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, categoryFilter, personFilter]);

  // Adjust current page if it's beyond total pages (e.g., after deleting last transaction on a page)
  React.useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const formatCurrency = useCallback((value, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }, [user?.currency]);

  // Calculate metrics for the given transactions (using stored converted amounts)
  const metrics = useMemo(() => {
    const totalIncome = transactions
      .filter(t => t.type === 'Income')
      .reduce((sum, t) => {
        // Use stored converted amount if available
        if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
          return sum + t.amountInGlobalCurrency;
        }
        // Fallback: use amount directly if currency matches user's currency
        if (t.currency === userCurrency) {
          return sum + t.amount;
        }
        // Fallback: convert on the fly for older transactions without stored conversion
        if (rates && Object.keys(rates).length > 0) {
          return sum + convertCurrency(t.amount, t.currency || 'USD', userCurrency, rates);
        }
        return sum;
      }, 0);

    const totalExpenses = transactions
      .filter(t => t.type === 'Expense')
      .reduce((sum, t) => {
        // Use stored converted amount if available
        if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
          return sum + t.amountInGlobalCurrency;
        }
        // Fallback: use amount directly if currency matches user's currency
        if (t.currency === userCurrency) {
          return sum + t.amount;
        }
        // Fallback: convert on the fly for older transactions without stored conversion
        if (rates && Object.keys(rates).length > 0) {
          return sum + convertCurrency(t.amount, t.currency || 'USD', userCurrency, rates);
        }
        return sum;
      }, 0);

    const netAmount = totalIncome - totalExpenses;

    return { totalIncome, totalExpenses, netAmount };
  }, [transactions, userCurrency, rates, convertCurrency]);

  // Expenses by category (uses filtered transactions for chart, using stored converted amounts)
  const categoryData = useMemo(() => {
    const expenseTransactions = filteredTransactions.filter(t => t.type === 'Expense');
    const categoryTotals = {};

    expenseTransactions.forEach(t => {
      if (!categoryTotals[t.category]) {
        categoryTotals[t.category] = 0;
      }

      let amountToUse = 0;

      // Use stored converted amount if available
      if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
        amountToUse = t.amountInGlobalCurrency;
      } else if (t.currency === userCurrency) {
        // Fallback: use amount directly if currency matches user's currency
        amountToUse = t.amount;
      } else if (rates && Object.keys(rates).length > 0) {
        // Fallback: convert on the fly for older transactions without stored conversion
        amountToUse = convertCurrency(t.amount, t.currency || 'USD', userCurrency, rates);
      }

      categoryTotals[t.category] += amountToUse;
    });

    // Filter out categories with 0 or negative values
    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, userCurrency, rates, convertCurrency]);

  // Payment methods breakdown (uses all transactions for totals, using stored converted amounts)
  const paymentMethodsBreakdown = useMemo(() => {
    const expenseTransactions = transactions.filter(t => t.type === 'Expense');

    const getConvertedAmount = (t) => {
      // Use stored converted amount if available
      if (t.amountInGlobalCurrency !== null && t.amountInGlobalCurrency !== undefined) {
        return t.amountInGlobalCurrency;
      }
      // Fallback: use amount directly if currency matches user's currency
      if (t.currency === userCurrency) {
        return t.amount;
      }
      // Fallback: convert on the fly for older transactions without stored conversion
      if (rates && Object.keys(rates).length > 0) {
        return convertCurrency(t.amount, t.currency || 'USD', userCurrency, rates);
      }
      return 0;
    };

    // Calculate total for percentage calculation
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + getConvertedAmount(t), 0);

    // Group by payment method
    const methodGroups = {};
    const cardIdToIndex = new Map(); // Track card color assignment
    const cardLabel = t('card');

    expenseTransactions.forEach(t => {
      const amount = getConvertedAmount(t);
      if (amount <= 0) return;

      const method = t.paymentMethod || 'Other';

      if (method === 'Card' && t.cardId) {
        // For cards, group by cardId
        const card = cards.find(c => c.id === t.cardId);
        const key = `Card_${t.cardId}`;
        if (!cardIdToIndex.has(t.cardId)) {
          cardIdToIndex.set(t.cardId, cardIdToIndex.size);
        }
        // A card that was deleted or deactivated still gets a distinct, numbered label
        const cardName = card
          ? (user?.blurValues ? '••••••' : `${card.name || card.cardName || cardLabel} •••• ${card.lastFourDigits || ''}`)
          : `${cardLabel} ${cardIdToIndex.get(t.cardId) + 1}`;

        if (!methodGroups[key]) {
          const colorIndex = cardIdToIndex.get(t.cardId);

          methodGroups[key] = {
            method: 'Card',
            name: cardName,
            cardId: t.cardId,
            total: 0,
            count: 0,
            color: CARD_COLORS[colorIndex % CARD_COLORS.length]
          };
        }
        methodGroups[key].total += amount;
        methodGroups[key].count += 1;
      } else {
        // For other payment methods, group by method name
        if (!methodGroups[method]) {
          methodGroups[method] = {
            method: method,
            name: method === 'Other' || !method ? 'Other' : method,
            total: 0,
            count: 0,
            color: null // Use default color logic
          };
        }
        methodGroups[method].total += amount;
        methodGroups[method].count += 1;
      }
    });

    // Convert to array and calculate percentages, format for pie chart
    const breakdown = Object.values(methodGroups)
      .map(item => ({
        ...item,
        percentage: totalExpenses > 0 ? (item.total / totalExpenses) * 100 : 0,
        value: item.total, // For pie chart
        name: item.name // For pie chart
      }))
      .sort((a, b) => b.total - a.total);

    return { breakdown, totalExpenses };
  }, [transactions, userCurrency, rates, convertCurrency, cards, user?.blurValues, t]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-6">
      {/* Summary tiles */}
      <div className="order-1 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { key: 'income', label: t('income'), value: metrics.totalIncome, Icon: TrendingUp, tone: 'text-success', chip: 'bg-success/15' },
          { key: 'expenses', label: t('expenses'), value: metrics.totalExpenses, Icon: TrendingDown, tone: 'text-danger', chip: 'bg-danger/15' },
          { key: 'net', label: t('net'), value: metrics.netAmount, Icon: DollarSign, tone: metrics.netAmount >= 0 ? 'text-success' : 'text-danger', chip: 'bg-primary/15' },
        ].map(({ key, label, value, Icon, tone, chip }, i) => (
          <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            <Card>
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-center justify-between gap-1">
                  <span className={cn("truncate text-xs sm:text-sm", colors.textTertiary)}>{label}</span>
                  <span className={cn("hidden h-7 w-7 shrink-0 place-items-center rounded-lg sm:grid", chip, key === 'net' ? 'text-primary' : tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className={cn("mt-1.5 truncate text-base font-bold tracking-tight sm:mt-3 sm:text-2xl lg:text-3xl", tone)}>
                  {user?.blurValues ? <BlurValue blur /> : (
                    <NumberFlow value={value} locales={numLocale} trend={0}
                      format={{ style: 'currency', currency: user?.currency || 'ILS', maximumFractionDigits: 0 }} />
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Payment Methods Breakdown - Pie Chart */}
      {paymentMethodsBreakdown.breakdown.length > 0 && (
        <Card className={cn(colors.cardBg, colors.cardBorder, "order-4 md:order-2")}>
          <CardHeader className="pb-2 sm:pb-2">
            <CardTitle className={cn("text-sm sm:text-base", colors.accentText)}>
              {t('expensesByPaymentMethod') || 'Expenses by Payment Method'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Pie Chart */}
              <div className="w-full sm:w-1/2 flex-shrink-0 sm:flex-shrink">
                <DonutChart
                  height={190}
                  ariaLabel={t('expensesByPaymentMethod')}
                  blur={!!user?.blurValues}
                  formatValue={(v) => formatCurrency(v, userCurrency)}
                  centerLabel={formatCurrency(paymentMethodsBreakdown.totalExpenses, userCurrency)}
                  centerSub={t('expenses')}
                  data={paymentMethodsBreakdown.breakdown.map((e) => ({
                    name: e.name,
                    value: e.value,
                    color: e.method === 'Card' && e.color ? e.color : ({ Cash: '#10B981', Transfer: '#A78BFA', Paybox: '#F59E0B', PayPal: '#06B6D4', Bit: '#EAB308' }[e.method] || '#9CA3AF'),
                  }))}
                />
              </div>

              {/* Legend - Side by side on desktop, compact, hidden on mobile */}
              <div className="hidden sm:block w-full sm:w-1/2 space-y-1.5 sm:space-y-2">
                {paymentMethodsBreakdown.breakdown.map((entry, index) => {
                  const getMethodColor = () => {
                    if (entry.method === 'Card' && entry.color) {
                      return entry.color;
                    }
                    switch (entry.method) {
                      case 'Cash': return '#10B981';
                      case 'Transfer': return '#A78BFA';
                      case 'Paybox': return '#F59E0B';
                      case 'PayPal': return '#06B6D4';
                      case 'Bit': return '#EAB308';
                      default: return '#9CA3AF';
                    }
                  };
                  const color = getMethodColor();
                  const total = paymentMethodsBreakdown.totalExpenses;
                  const percent = total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0;
                  return (
                    <div key={`${entry.method}_${entry.cardId || index}`} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        <div
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className={cn("text-xs sm:text-sm truncate", colors.textSecondary)}>
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <span className={cn("text-xs font-medium", colors.textTertiary)}>{percent}%</span>
                        <span className={cn("text-xs sm:text-sm font-semibold min-w-[50px] sm:min-w-[60px] text-end", colors.textPrimary)}>
                          <BlurValue blur={user?.blurValues}>
                            {formatCurrency(entry.value, userCurrency)}
                          </BlurValue>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="order-2 grid grid-cols-1 gap-4 md:order-3 md:grid-cols-2">
        {/* Budget Progress */}
        <BudgetProgress
          budgets={budgets}
          transactions={transactions}
          formatCurrency={formatCurrency}
          selectedYear={selectedYear}
          selectedMonths={selectedMonths}
        />

        {/* Expenses by Category */}
        <Card className={cn(colors.cardBg, colors.cardBorder, !budgets?.length && 'md:col-span-2')}>
          <CardHeader className="pb-2 sm:pb-2">
            <CardTitle className={cn("text-sm sm:text-base", colors.accentText)}>{t('expensesByCategory')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {categoryData.length > 0 ? (
              <div className={cn("flex flex-col gap-4", !budgets?.length && "md:flex-row md:items-center")}>
                {/* Chart */}
                <div className={cn("w-full", !budgets?.length && "md:w-1/2")}>
                  <DonutChart
                    height={190}
                    ariaLabel={t('expensesByCategory')}
                    blur={!!user?.blurValues}
                    formatValue={(v) => formatCurrency(v, user?.currency)}
                    centerLabel={formatCurrency(categoryData.reduce((sum, item) => sum + item.value, 0), user?.currency)}
                    centerSub={t('expenses')}
                    data={categoryData.map((e) => ({ name: translateCategory(e.name, language), value: e.value }))}
                  />
                </div>
                {/* Category List - Hidden on mobile, visible on desktop */}
                <div className={cn("hidden sm:block space-y-2", !budgets?.length && "md:w-1/2")}>
                  {categoryData.map((entry, index) => {
                    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
                    const percent = ((entry.value / total) * 100).toFixed(0);
                    return (
                      <div key={entry.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: palette[index % palette.length] || '#888' }}
                          />
                          <span className={cn("text-sm truncate", colors.textSecondary)}>
                            {translateCategory(entry.name, language)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={cn("text-xs font-medium", colors.textTertiary)}>{percent}%</span>
                          <span className={cn("text-sm font-semibold min-w-[60px] text-end", colors.textPrimary)}>
                            <BlurValue blur={user?.blurValues}>
                              {formatCurrency(entry.value, user?.currency)}
                            </BlurValue>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={cn("flex items-center justify-center h-[180px]", colors.textTertiary)}>
                {t('noExpenseData')}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Transaction List with Filters */}
      <Card className={cn(colors.cardBg, colors.cardBorder, "order-3 md:order-4")}>
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CardTitle className={cn("text-sm sm:text-base", colors.accentText)}>{t('transactions')}</CardTitle>
              <span className={cn("text-xs sm:text-sm", colors.textTertiary)}>
                ({filteredTransactions.length} {filteredTransactions.length === 1 ? t('result') : t('results')})
              </span>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className={cn("h-7 sm:h-8 text-xs sm:text-sm", colors.textTertiary, "hover:bg-primary/20")}
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4 me-0.5 sm:me-1" />
                {t('clear')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 space-y-2 sm:space-y-4">
          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className={cn(
                "absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary",
                "start-2 sm:start-3"
              )} />
              <Input
                type="text"
                placeholder={t('searchTransactions') || 'Search...'}
                aria-label={t('searchTransactions')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "h-9",
                  colors.bgTertiary,
                  colors.border,
                  colors.textPrimary,
                  "ps-9"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-primary/20 transition-colors",
                    "end-2"
                  )}
                >
                  <X className={cn("w-3 h-3", colors.textTertiary)} />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={cn("w-full sm:w-[180px] h-8 sm:h-9 text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue placeholder={t('allCategories')} />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value="all" className={cn(colors.textPrimary, "hover:bg-primary/20 focus:bg-primary/20")}>
                  {t('allCategories')}
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem
                    key={category.id || category.name}
                    value={category.nameKey || category.name}
                    className={cn(colors.textPrimary, "hover:bg-primary/20 focus:bg-primary/20")}
                  >
                    {category.icon ? `${category.icon} ` : ''}{translateCategory(category.nameKey || category.name, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Who added it: only meaningful when the workspace is shared */}
          {isShared && (
            <div role="group" aria-label={t('filterByPerson')} className="flex flex-wrap gap-2">
              {[{ email: 'all', label: t('everyone') }, ...members.map((m) => ({ email: m.email, label: m.isMe ? t('me') : m.name, member: m }))].map((opt) => {
                const active = personFilter === opt.email;
                return (
                  <button
                    key={opt.email}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPersonFilter(opt.email)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 sm:px-3",
                      active ? "border-primary bg-primary/15 text-primary" : cn(colors.border, colors.textSecondary, "hover:bg-primary/10")
                    )}
                  >
                    {opt.member && (
                      <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full text-xs font-semibold leading-none text-background" style={{ backgroundColor: opt.member.color }}>
                        {opt.member.initials.slice(0, 1)}
                      </span>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Transaction List */}
          <TransactionList
            transactions={paginatedTransactions}
            cards={cards}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            canEdit={canEdit}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={cn("flex items-center justify-between pt-4 border-t", colors.borderLight)}>
              <p className={cn("text-sm", colors.textTertiary)}>
                {t('showing')} {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)} {t('of')} {filteredTransactions.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={cn("h-8 w-8 p-0 bg-transparent hover:bg-primary/20 disabled:opacity-50", colors.border, colors.textPrimary)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className={cn("text-sm min-w-[80px] text-center", colors.textSecondary)}>
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={cn("h-8 w-8 p-0 bg-transparent hover:bg-primary/20 disabled:opacity-50", colors.border, colors.textPrimary)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default memo(ExpenseMonthView);
