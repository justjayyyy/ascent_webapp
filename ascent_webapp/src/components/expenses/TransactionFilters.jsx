import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, X, Search } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';

export default function TransactionFilters({ filters, onFilterChange, onClearFilters, categories = [], searchQuery = '', onSearchChange }) {
  const { t, language, colors, isRTL } = useTheme();
  const hasActiveFilters = filters.type !== 'all' ||
    filters.category !== 'all' ||
    filters.dateFrom ||
    filters.dateTo ||
    searchQuery;

  const handleQuickFilter = (range) => {
    const today = new Date();
    let dateFrom, dateTo;

    switch (range) {
      case 'today':
        dateFrom = format(today, 'yyyy-MM-dd');
        dateTo = format(today, 'yyyy-MM-dd');
        break;
      case 'week':
        dateFrom = format(subDays(today, 7), 'yyyy-MM-dd');
        dateTo = format(today, 'yyyy-MM-dd');
        break;
      case 'month':
        dateFrom = format(startOfMonth(today), 'yyyy-MM-dd');
        dateTo = format(endOfMonth(today), 'yyyy-MM-dd');
        break;
      case 'all':
        dateFrom = '';
        dateTo = '';
        break;
      default:
        dateFrom = '';
        dateTo = '';
    }

    onFilterChange({ ...filters, dateFrom, dateTo });
  };

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "mb-6")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#5C8374]" />
            <h3 className={cn("font-semibold", colors.accentText)}>{t('filters')}</h3>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className={cn(colors.textTertiary, "hover:bg-[#5C8374]/20")}
            >
              <X className="w-4 h-4 mr-1" />
              {t('clear')}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className={cn(
              "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C8374]",
              isRTL ? "right-3" : "left-3"
            )} />
            <Input
              type="text"
              placeholder={t('searchTransactions') || 'Search transactions...'}
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className={cn(
                colors.bgTertiary,
                colors.border,
                colors.textPrimary,
                isRTL ? "pr-10 text-right" : "pl-10"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange?.('')}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[#5C8374]/20 transition-colors",
                  isRTL ? "left-2" : "right-2"
                )}
              >
                <X className={cn("w-4 h-4", colors.textTertiary)} />
              </button>
            )}
          </div>

          {/* Quick Date Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickFilter('today')}
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {t('today')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickFilter('week')}
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {t('last7Days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickFilter('month')}
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {t('thisMonth')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickFilter('all')}
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {t('allTime')}
            </Button>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={cn("text-sm", colors.textSecondary)}>{t('fromDate')}</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange({ ...filters, dateFrom: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>
            <div className="space-y-2">
              <Label className={cn("text-sm", colors.textSecondary)}>{t('toDate')}</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFilterChange({ ...filters, dateTo: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>
          </div>

          {/* Type and Category Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={cn("text-sm", colors.textSecondary)}>{t('type')}</Label>
              <Select value={filters.type} onValueChange={(value) => onFilterChange({ ...filters, type: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="all">{t('allTypes')}</SelectItem>
                  <SelectItem value="Expense">{t('expensesOnly')}</SelectItem>
                  <SelectItem value="Income">{t('incomeOnly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={cn("text-sm", colors.textSecondary)}>{t('category')}</Label>
              <Select value={filters.category} onValueChange={(value) => onFilterChange({ ...filters, category: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="all">{t('allCategories')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id || category.name} value={category.nameKey || category.name}>
                      {category.icon ? `${category.icon} ` : ''}{translateCategory(category.nameKey || category.name, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}