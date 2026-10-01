import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import BlurValue from '../BlurValue';
import { useMoney } from '@/hooks/useWorkspaceData';

function BudgetProgress({ budgets, transactions, formatCurrency, selectedYear, selectedMonths = [] }) {
  const { language, user, t } = useTheme();
  const userCurrency = user?.currency || 'ILS';
  const { amountOf, convert } = useMoney(userCurrency);

  // Filter budgets by selected period - only show budgets that match the exact year + month(s)
  const filteredBudgets = useMemo(() => {
    if (!selectedYear) {
      // If no year selected, don't show any budgets
      return [];
    }
    const yearNum = parseInt(selectedYear);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    if (selectedMonths && selectedMonths.length > 0) {
      // Filter by selected months - only show budgets for those specific months
      const monthNums = selectedMonths.map(m => parseInt(m));
      return budgets.filter(b => {
        // Handle budgets without year/month (backward compatibility - show for current month/year only)
        if (!b.year || !b.month) {
          // Only show old budgets if viewing current month/year
          return yearNum === currentYear && monthNums.includes(currentMonth);
        }
        // Convert month to number if it's a string
        const budgetMonth = typeof b.month === 'string' ? parseInt(b.month) : b.month;
        const budgetYear = typeof b.year === 'string' ? parseInt(b.year) : b.year;
        // Only include budgets with matching year and month
        return budgetYear === yearNum && monthNums.includes(budgetMonth);
      });
    } else {
      // If no months selected (yearly view), don't show budgets (budgets are month-specific)
      return [];
    }
  }, [budgets, selectedYear, selectedMonths]);

  // Calculate spending by category for selected period (memoized, using stored converted amounts)
  const spendingByCategory = useMemo(() => {
    if (!selectedYear) return {};
    const yearNum = parseInt(selectedYear);

    let periodTransactions = transactions.filter(t => {
      if (!t.date || t.type !== 'Expense') return false;
      const transDate = new Date(t.date);
      const transYear = transDate.getFullYear();

      if (selectedMonths && selectedMonths.length > 0) {
        // Filter by selected months
        const transMonth = transDate.getMonth() + 1; // getMonth returns 0-11
        const monthNums = selectedMonths.map(m => parseInt(m));
        return transYear === yearNum && monthNums.includes(transMonth);
      } else {
        // Filter by year only
        return transYear === yearNum;
      }
    });

    const spending = {};
    periodTransactions.forEach(t => {
      if (!spending[t.category]) {
        spending[t.category] = 0;
      }

      spending[t.category] += amountOf(t);
    });

    return spending;
  }, [transactions, amountOf, selectedYear, selectedMonths]);

  const budgetData = useMemo(() => {
    return filteredBudgets.map(budget => {
      // Convert budget limit to user's currency if needed
      const budgetLimit = convert(budget.monthlyLimit, budget.currency) ?? budget.monthlyLimit;

      const spent = spendingByCategory[budget.category] || 0;
      const percentage = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;
      const remaining = budgetLimit - spent;
      const threshold = Number(budget.alertThreshold) || 80;
      const isOverBudget = percentage > 100;
      const isAtLimit = percentage === 100;
      const isNearLimit = percentage >= threshold && percentage < 100;

      return {
        ...budget,
        spent,
        monthlyLimit: budgetLimit, // Use converted limit
        remaining,
        percentage: Math.min(percentage, 100),
        displayPercentage: percentage,
        isOverBudget,
        isAtLimit,
        isNearLimit,
        originalCurrency: budget.currency, // Keep original currency for display
      };
    })
      .sort((a, b) => b.displayPercentage - a.displayPercentage);
  }, [filteredBudgets, spendingByCategory, convert]);

  // Don't show the module if there are no budgets for the selected period
  // Debug: Log to help troubleshoot
  if (filteredBudgets.length === 0) {
    return null;
  }

  if (budgetData.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{t('budgetTracking')}</h2>
      <ul className="mt-3 space-y-4">
        {budgetData.map((budget) => {
          const tone = budget.isOverBudget ? 'bg-danger' : budget.isAtLimit ? 'bg-orange-500' : budget.isNearLimit ? 'bg-yellow-500' : 'bg-success';
          return (
            <li key={budget.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{translateCategory(budget.category, language)}</span>
                  {budget.isOverBudget && <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-danger" />}
                  {budget.isAtLimit && <CheckCircle aria-hidden className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />}
                  {budget.isNearLimit && <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />}
                </span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", budget.isOverBudget ? 'text-danger' : 'text-foreground')} dir="ltr">
                  <BlurValue blur={user?.blurValues}>{formatCurrency(budget.remaining, userCurrency)}</BlurValue>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={Math.round(budget.displayPercentage)} aria-valuemin={0} aria-valuemax={100}
                aria-label={t('a11yBudgetUsed').replace('{category}', translateCategory(budget.category, language)).replace('{percent}', Math.round(budget.displayPercentage))}>
                <motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${budget.percentage}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span dir="ltr">
                  <BlurValue blur={user?.blurValues}>{formatCurrency(budget.spent, userCurrency)} / {formatCurrency(budget.monthlyLimit, userCurrency)}</BlurValue>
                </span>
                <span className="tabular-nums">
                  <BlurValue blur={user?.blurValues}>
                    {budget.isOverBudget
                      ? `${t('overBudgetBy')} ${formatCurrency(Math.abs(budget.remaining), userCurrency)}`
                      : budget.isAtLimit
                        ? t('reachedLimit')
                        : budget.isNearLimit
                          ? t('approachingLimit')
                          : `${budget.displayPercentage.toFixed(0)}%`}
                  </BlurValue>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default React.memo(BudgetProgress);
