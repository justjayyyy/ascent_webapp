import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingDown, TrendingUp, DollarSign, CreditCard, Banknote, Loader2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import TransactionList from './TransactionList';
import BudgetProgress from './BudgetProgress';
import BlurValue from '../BlurValue';
import { cn } from '@/lib/utils';
import { useTheme, translateCategory } from '../ThemeProvider';
import { useDebounce } from '@/hooks/useDebounce';

const COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

export default function ExpenseMonthView({ 
  transactions, 
  budgets, 
  cards,
  categories = [],
  onEdit, 
  onDelete,
  onDuplicate,
  isLoading,
  monthLabel
}) {
  const { user, colors, t, language, theme, isRTL } = useTheme();
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const hasActiveFilters = searchQuery || categoryFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('all');
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
      
      return true;
    });
    
    return filtered;
  }, [transactions, debouncedSearchQuery, categoryFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  // Reset page when filters change (using debounced search)
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, categoryFilter]);

  const formatCurrency = useCallback((value, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }, [user?.currency]);

  // Calculate metrics for the given transactions
  const metrics = useMemo(() => {
    const totalIncome = transactions
      .filter(t => t.type === 'Income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter(t => t.type === 'Expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netAmount = totalIncome - totalExpenses;

    return { totalIncome, totalExpenses, netAmount };
  }, [transactions]);

  // Expenses by category (uses filtered transactions for chart)
  const categoryData = useMemo(() => {
    const expenseTransactions = filteredTransactions.filter(t => t.type === 'Expense');
    const categoryTotals = {};

    expenseTransactions.forEach(t => {
      if (!categoryTotals[t.category]) {
        categoryTotals[t.category] = 0;
      }
      categoryTotals[t.category] += t.amount;
    });

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  // Card vs Cash breakdown (uses all transactions for totals)
  const cardVsCash = useMemo(() => {
    const userCurrency = user?.currency || 'USD';
    const expenseTransactions = transactions.filter(t => 
      t.type === 'Expense' && t.currency === userCurrency
    );
    
    const cardTotal = expenseTransactions
      .filter(t => t.paymentMethod === 'Card')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const cashTotal = expenseTransactions
      .filter(t => t.paymentMethod === 'Cash')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const otherTotal = expenseTransactions
      .filter(t => t.paymentMethod !== 'Card' && t.paymentMethod !== 'Cash')
      .reduce((sum, t) => sum + t.amount, 0);

    return { cardTotal, cashTotal, otherTotal };
  }, [transactions, user?.currency]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={cn(colors.cardBg, colors.cardBorder)}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('income')}</CardTitle>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">
              <BlurValue blur={user?.blurValues}>
                {formatCurrency(metrics.totalIncome, user?.currency)}
              </BlurValue>
            </p>
          </CardContent>
        </Card>

        <Card className={cn(colors.cardBg, colors.cardBorder)}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('expenses')}</CardTitle>
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-400">
              <BlurValue blur={user?.blurValues}>
                {formatCurrency(metrics.totalExpenses, user?.currency)}
              </BlurValue>
            </p>
          </CardContent>
        </Card>

        <Card className={cn(colors.cardBg, colors.cardBorder)}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>{t('net')}</CardTitle>
              <DollarSign className="w-5 h-5 text-[#5C8374]" />
            </div>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${metrics.netAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <BlurValue blur={user?.blurValues}>
                {formatCurrency(metrics.netAmount, user?.currency)}
              </BlurValue>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card vs Cash */}
      {(cardVsCash.cardTotal > 0 || cardVsCash.cashTotal > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>
                  {t('cardPayments')}
                </CardTitle>
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-blue-400">
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(cardVsCash.cardTotal, user?.currency)}
                </BlurValue>
              </p>
            </CardContent>
          </Card>

          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-sm font-medium", colors.textTertiary)}>
                  {t('cashPayments')}
                </CardTitle>
                <Banknote className="w-5 h-5 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-emerald-400">
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(cardVsCash.cashTotal, user?.currency)}
                </BlurValue>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Budget Progress */}
        {budgets && budgets.length > 0 && (
          <BudgetProgress 
            budgets={budgets} 
            transactions={transactions} 
            formatCurrency={formatCurrency}
          />
        )}

        {/* Expenses by Category */}
        <Card className={cn(colors.cardBg, colors.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className={colors.accentText}>{t('expensesByCategory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="flex flex-col">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={(props) => {
                        const { name, value, x, y, cx } = props;
                        const total = categoryData.reduce((sum, item) => sum + item.value, 0);
                        const percent = ((value / total) * 100).toFixed(0);
                        if (percent < 5) return null;
                        const amountStr = user?.blurValues ? '••••' : formatCurrency(value, user?.currency);
                        return (
                          <g>
                            <text 
                              x={x} 
                              y={y - 6} 
                              fill={theme === 'light' ? '#1e293b' : '#ffffff'} 
                              textAnchor={x > cx ? 'start' : 'end'} 
                              dominantBaseline="central"
                              style={{ fontSize: '11px', fontWeight: '500' }}
                            >
                              {`${translateCategory(name, language)} ${percent}%`}
                            </text>
                            <text 
                              x={x} 
                              y={y + 8} 
                              fill={theme === 'light' ? '#64748b' : '#9ca3af'} 
                              textAnchor={x > cx ? 'start' : 'end'} 
                              dominantBaseline="central"
                              style={{ fontSize: '10px', fontWeight: '400' }}
                            >
                              {amountStr}
                            </text>
                          </g>
                        );
                      }}
                      outerRadius={60}
                      innerRadius={20}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]}
                          stroke={theme === 'light' ? '#ffffff' : '#092635'}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'light' ? '#ffffff' : '#1B4242',
                        border: `1px solid ${theme === 'light' ? '#e2e8f0' : '#5C8374'}`,
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                      itemStyle={{ color: theme === 'light' ? '#1e293b' : '#ffffff' }}
                      formatter={(value, name) => [
                        user?.blurValues ? '••••••' : formatCurrency(value, user?.currency),
                        translateCategory(name, language)
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 max-h-20 overflow-y-auto custom-scrollbar">
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {categoryData.slice(0, 8).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1 text-xs">
                        <div 
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className={colors.textSecondary}>{translateCategory(entry.name, language)}</span>
                      </div>
                    ))}
                  </div>
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
      <Card className={cn(colors.cardBg, colors.cardBorder)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className={colors.accentText}>{t('transactions')}</CardTitle>
              <span className={cn("text-sm", colors.textTertiary)}>
                ({filteredTransactions.length} {filteredTransactions.length === 1 ? t('result') : t('results')})
              </span>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className={cn(colors.textTertiary, "hover:bg-[#5C8374]/20")}
              >
                <X className="w-4 h-4 mr-1" />
                {t('clear')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className={cn(
                "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C8374]",
                isRTL ? "right-3" : "left-3"
              )} />
              <Input
                type="text"
                placeholder={t('searchTransactions') || 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "h-9",
                  colors.bgTertiary,
                  colors.border,
                  colors.textPrimary,
                  isRTL ? "pr-9 text-right" : "pl-9"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[#5C8374]/20 transition-colors",
                    isRTL ? "left-2" : "right-2"
                  )}
                >
                  <X className={cn("w-3 h-3", colors.textTertiary)} />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={cn("w-full sm:w-[180px] h-9", colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue placeholder={t('allCategories')} />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value="all" className={cn(colors.textPrimary, "hover:bg-[#5C8374]/20 focus:bg-[#5C8374]/20")}>
                  {t('allCategories')}
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem 
                    key={category.id || category.name} 
                    value={category.nameKey || category.name}
                    className={cn(colors.textPrimary, "hover:bg-[#5C8374]/20 focus:bg-[#5C8374]/20")}
                  >
                    {category.icon ? `${category.icon} ` : ''}{translateCategory(category.nameKey || category.name, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transaction List */}
          <TransactionList
            transactions={paginatedTransactions}
            cards={cards}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
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
                  className={cn("h-8 w-8 p-0 bg-transparent hover:bg-[#5C8374]/20 disabled:opacity-50", colors.border, colors.textPrimary)}
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
                  className={cn("h-8 w-8 p-0 bg-transparent hover:bg-[#5C8374]/20 disabled:opacity-50", colors.border, colors.textPrimary)}
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
