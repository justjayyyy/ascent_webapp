import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { getYear, getMonth, parseISO } from 'date-fns';

const MONTHS = [
  { value: 1, labelKey: 'jan', fullLabelKey: 'january' },
  { value: 2, labelKey: 'feb', fullLabelKey: 'february' },
  { value: 3, labelKey: 'mar', fullLabelKey: 'march' },
  { value: 4, labelKey: 'apr', fullLabelKey: 'april' },
  { value: 5, labelKey: 'may', fullLabelKey: 'may' },
  { value: 6, labelKey: 'jun', fullLabelKey: 'june' },
  { value: 7, labelKey: 'jul', fullLabelKey: 'july' },
  { value: 8, labelKey: 'aug', fullLabelKey: 'august' },
  { value: 9, labelKey: 'sep', fullLabelKey: 'september' },
  { value: 10, labelKey: 'oct', fullLabelKey: 'october' },
  { value: 11, labelKey: 'nov', fullLabelKey: 'november' },
  { value: 12, labelKey: 'dec', fullLabelKey: 'december' },
];

function PeriodSelector({ 
  transactions = [],
  selectedYear, 
  selectedMonth, 
  onYearChange, 
  onMonthChange
}) {
  const { colors, t } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // Get available years from transactions (only years with data)
  // Always include current year even if no data
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    yearsSet.add(currentYear); // Always include current year
    transactions.forEach(t => {
      yearsSet.add(getYear(parseISO(t.date)));
    });
    return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending
  }, [transactions, currentYear]);

  // Get months that have data for the selected year
  const monthsWithData = useMemo(() => {
    const monthsSet = new Set();
    transactions.forEach(t => {
      const date = parseISO(t.date);
      if (getYear(date) === parseInt(selectedYear)) {
        monthsSet.add(getMonth(date) + 1); // 1-indexed
      }
    });
    return monthsSet;
  }, [transactions, selectedYear]);

  // Check if a month should be disabled (future months or no data) - memoized
  const isMonthDisabled = useCallback((year, month) => {
    const selectedYearNum = parseInt(year);
    // Disable future months
    if (selectedYearNum > currentYear) return true;
    if (selectedYearNum === currentYear && month > currentMonth) return true;
    // Disable months without data (except current month which is always accessible)
    const isCurrent = selectedYearNum === currentYear && month === currentMonth;
    if (!isCurrent && !monthsWithData.has(month)) return true;
    return false;
  }, [currentYear, currentMonth, monthsWithData]);

  // Check if this is the current month - memoized
  const isCurrentMonth = useCallback((year, month) => {
    return parseInt(year) === currentYear && month === currentMonth;
  }, [currentYear, currentMonth]);

  // Check if month has data - memoized
  const hasDataForMonth = useCallback((month) => {
    return monthsWithData.has(month);
  }, [monthsWithData]);

  const selectedMonthData = MONTHS.find(m => m.value === parseInt(selectedMonth));
  const selectedMonthName = selectedMonthData ? t(selectedMonthData.fullLabelKey) : '';
  const isViewingCurrentMonth = isCurrentMonth(selectedYear, parseInt(selectedMonth));

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full p-4 flex items-center justify-between",
          "hover:bg-[#5C8374]/5 transition-colors rounded-t-lg",
          !isExpanded && "rounded-b-lg"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isViewingCurrentMonth ? "bg-[#5C8374]/20" : colors.bgTertiary
          )}>
            <Calendar className={cn("w-5 h-5", isViewingCurrentMonth ? "text-[#5C8374]" : colors.textSecondary)} />
          </div>
          <div className="text-left">
            <p className={cn("text-lg font-semibold", colors.textPrimary)}>
              {`${selectedMonthName} ${selectedYear}`}
            </p>
            <p className={cn("text-xs", colors.textTertiary)}>
              {isViewingCurrentMonth 
                ? t('currentMonth')
                : t('clickToChangePeriod')
              }
            </p>
          </div>
        </div>
        <ChevronDown 
          className={cn(
            "w-5 h-5 transition-transform duration-200",
            colors.textSecondary,
            isExpanded && "rotate-180"
          )} 
        />
      </button>

      {/* Expandable Content */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Years Row */}
          <div>
            <p className={cn("text-xs font-medium mb-2 uppercase tracking-wider", colors.textTertiary)}>
              {t('year')}
            </p>
            <div className="flex flex-wrap gap-2">
              {availableYears.map(year => {
                  const isSelected = parseInt(selectedYear) === year;
                  const isCurrent = year === currentYear;
                  
                  return (
                    <button
                      key={year}
                      onClick={() => onYearChange(year.toString())}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        "border-2 min-w-[70px]",
                        isSelected
                          ? "bg-[#5C8374] text-white border-[#5C8374] shadow-md"
                          : isCurrent
                          ? cn("border-[#5C8374]/50 hover:border-[#5C8374]", colors.textPrimary, colors.bgTertiary)
                          : cn("border-transparent hover:border-[#5C8374]/30", colors.textSecondary, colors.bgTertiary)
                      )}
                    >
                      {year}
                      {isCurrent && !isSelected && (
                        <span className="ml-1 text-[10px] text-[#5C8374]">●</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Months Row */}
          <div>
            <p className={cn("text-xs font-medium mb-2 uppercase tracking-wider", colors.textTertiary)}>
              {t('month')}
            </p>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
              {MONTHS.map(month => {
                const isSelected = parseInt(selectedMonth) === month.value;
                const isCurrent = isCurrentMonth(selectedYear, month.value);
                const disabled = isMonthDisabled(selectedYear, month.value);
                const hasData = hasDataForMonth(month.value);
                
                // Determine tooltip message
                const isFutureMonth = (parseInt(selectedYear) === currentYear && month.value > currentMonth) || 
                                      parseInt(selectedYear) > currentYear;
                const tooltipMsg = isFutureMonth 
                  ? t('futureMonth')
                  : !hasData && !isCurrent 
                  ? t('noTransactions')
                  : t(month.fullLabelKey);

                return (
                  <button
                    key={month.value}
                    onClick={() => {
                      if (!disabled) {
                        onMonthChange(month.value.toString());
                        setIsExpanded(false); // Collapse after selection
                      }
                    }}
                    disabled={disabled}
                    title={tooltipMsg}
                    className={cn(
                      "px-2 py-2.5 rounded-lg text-xs font-medium transition-all duration-200",
                      "border-2 relative",
                      disabled
                        ? cn("opacity-40 cursor-not-allowed border-transparent", colors.textTertiary, colors.bgTertiary)
                        : isSelected
                        ? "bg-[#5C8374] text-white border-[#5C8374] shadow-md"
                        : isCurrent
                        ? cn("border-[#5C8374] bg-[#5C8374]/10", colors.textPrimary)
                        : cn("border-transparent hover:border-[#5C8374]/30", colors.textSecondary, colors.bgTertiary)
                    )}
                  >
                    {t(month.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default React.memo(PeriodSelector);
