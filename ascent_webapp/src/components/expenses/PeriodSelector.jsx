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
  selectedMonths = [], 
  onYearChange, 
  onMonthChange
}) {
  const { colors, t } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // Get available years from transactions (only years with data)
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    transactions.forEach(t => {
      yearsSet.add(getYear(parseISO(t.date)));
    });
    return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending
  }, [transactions]);

  // Check if this is the current month - memoized
  const isCurrentMonth = useCallback((year, month) => {
    return parseInt(year) === currentYear && month === currentMonth;
  }, [currentYear, currentMonth]);

  const hasSelectedMonths = selectedMonths && selectedMonths.length > 0;
  
  // Get display text for selected months
  const getSelectedMonthsDisplay = useMemo(() => {
    if (!hasSelectedMonths) {
      return `${selectedYear} (${t('all') || 'All'})`;
    }
    if (selectedMonths.length === 1) {
      const monthData = MONTHS.find(m => m.value === parseInt(selectedMonths[0]));
      return monthData ? `${t(monthData.fullLabelKey)} ${selectedYear}` : `${selectedYear}`;
    }
    return `${selectedMonths.length} ${t('months') || 'months'} ${selectedYear}`;
  }, [selectedMonths, selectedYear, hasSelectedMonths, t]);

  const isViewingCurrentMonth = hasSelectedMonths && selectedMonths.some(m => 
    isCurrentMonth(selectedYear, parseInt(m))
  );

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full p-2 sm:p-4 flex items-center justify-between",
          "hover:bg-[#5C8374]/5 transition-colors rounded-t-lg",
          !isExpanded && "rounded-b-lg"
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={cn(
            "p-1.5 sm:p-2 rounded-lg",
            isViewingCurrentMonth ? "bg-[#5C8374]/20" : colors.bgTertiary
          )}>
            <Calendar className={cn("w-4 h-4 sm:w-5 sm:h-5", isViewingCurrentMonth ? "text-[#5C8374]" : colors.textSecondary)} />
          </div>
          <div className="text-left">
            <p className={cn("text-base sm:text-lg font-semibold", colors.textPrimary)}>
              {getSelectedMonthsDisplay}
            </p>
            <p className={cn("text-[10px] sm:text-xs", colors.textTertiary)}>
              {isViewingCurrentMonth 
                ? t('currentMonth')
                : hasSelectedMonths
                ? t('clickToChangePeriod')
                : t('yearlyView') || 'Yearly view'
              }
            </p>
          </div>
        </div>
        <ChevronDown 
          className={cn(
            "w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200",
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
        <CardContent className="p-2 sm:p-4 pt-0 space-y-3 sm:space-y-4">
          {/* Years Row */}
          <div>
            <p className={cn("text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2 uppercase tracking-wider", colors.textTertiary)}>
              {t('year')}
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {availableYears.map(year => {
                  const isSelected = parseInt(selectedYear) === year;
                  const isCurrent = year === currentYear;
                  
                  return (
                    <button
                      key={year}
                      onClick={() => {
                        onYearChange(year.toString());
                        // Reset selected months when year changes
                        onMonthChange([]);
                      }}
                      className={cn(
                        "px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200",
                        "border-2 min-w-[60px] sm:min-w-[70px]",
                        isSelected
                          ? "bg-[#5C8374] text-white border-[#5C8374] shadow-md"
                          : isCurrent
                          ? cn("border-[#5C8374]/50 hover:border-[#5C8374]", colors.textPrimary, colors.bgTertiary)
                          : cn("border-transparent hover:border-[#5C8374]/30", colors.textSecondary, colors.bgTertiary)
                      )}
                    >
                      {year}
                      {isCurrent && !isSelected && (
                        <span className="ml-0.5 sm:ml-1 text-[8px] sm:text-[10px] text-[#5C8374]">●</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Months Row */}
          <div>
            <p className={cn("text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2 uppercase tracking-wider", colors.textTertiary)}>
              {t('month')}
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {MONTHS.map(month => {
                const monthValueStr = month.value.toString();
                const isSelected = selectedMonths.includes(monthValueStr);
                const isCurrent = isCurrentMonth(selectedYear, month.value);

                return (
                  <button
                    key={month.value}
                    onClick={() => {
                      // Toggle month selection
                      if (isSelected) {
                        // Deselect: remove from array
                        const newSelectedMonths = selectedMonths.filter(m => m !== monthValueStr);
                        onMonthChange(newSelectedMonths);
                      } else {
                        // Select: add to array
                        const newSelectedMonths = [...selectedMonths, monthValueStr];
                        onMonthChange(newSelectedMonths);
                      }
                      // Don't collapse - allow multiple selections
                    }}
                    title={t(month.fullLabelKey)}
                    className={cn(
                      "px-1.5 sm:px-2 py-1.5 sm:py-2.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200",
                      "border-2 relative",
                      isSelected
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
