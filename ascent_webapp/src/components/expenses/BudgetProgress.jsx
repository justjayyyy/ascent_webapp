import React, { useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, translateCategory } from '../ThemeProvider';
import BlurValue from '../BlurValue';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

function BudgetProgress({ budgets, transactions, formatCurrency }) {
  const { colors, language, user, t } = useTheme();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'USD';

  // Fetch exchange rates on mount
  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  // Calculate current month spending by category (memoized, using stored converted amounts)
  const spendingByCategory = useMemo(() => {
    const now = new Date();
    const thisMonthTransactions = transactions.filter(t => {
      const transDate = new Date(t.date);
      return t.type === 'Expense' &&
        transDate.getMonth() === now.getMonth() &&
        transDate.getFullYear() === now.getFullYear();
    });

    const spending = {};
    thisMonthTransactions.forEach(t => {
      if (!spending[t.category]) {
        spending[t.category] = 0;
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
      
      spending[t.category] += amountToUse;
    });

    return spending;
  }, [transactions, userCurrency, rates, convertCurrency]);

  const budgetData = useMemo(() => {
    return budgets.map(budget => {
      // Convert budget limit to user's currency if needed
      let budgetLimit = budget.monthlyLimit;
      if (budget.currency !== userCurrency && rates && Object.keys(rates).length > 0) {
        budgetLimit = convertCurrency(budget.monthlyLimit, budget.currency, userCurrency, rates);
      }
      
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
  }, [budgets, spendingByCategory, userCurrency, rates, convertCurrency]);

  if (budgetData.length === 0) {
    return null;
  }

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "h-full")}>
      <CardHeader className="drag-handle cursor-move">
        <div className="flex items-center justify-between">
          <CardTitle className={colors.accentText}>{t('budgetTracking')}</CardTitle>
          <TrendingUp className="w-5 h-5 text-[#5C8374]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {budgetData.map((budget) => (
            <div key={budget.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("font-medium", colors.textPrimary)}>
                    {translateCategory(budget.category, language)}
                  </span>
                  {budget.isOverBudget && (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                  {budget.isAtLimit && (
                    <CheckCircle className="w-4 h-4 text-orange-400" />
                  )}
                  {budget.isNearLimit && (
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  )}
                </div>
                <span className={cn("text-sm", colors.textTertiary)}>
                  <BlurValue blur={user?.blurValues}>
                    {budget.displayPercentage.toFixed(0)}%
                  </BlurValue>
                </span>
              </div>
              
              <Progress 
                value={budget.percentage} 
                className={cn("h-2", colors.bgTertiary)}
                indicatorClassName={
                  budget.isOverBudget 
                    ? "bg-red-500" 
                    : budget.isAtLimit
                    ? "bg-orange-500"
                    : budget.isNearLimit 
                    ? "bg-yellow-500" 
                    : "bg-green-500"
                }
              />
              
              <div className="flex items-center justify-between text-sm">
                <span className={colors.textTertiary}>
                  <BlurValue blur={user?.blurValues}>
                    {formatCurrency(budget.spent, userCurrency)}
                  </BlurValue>
                  {' / '}
                  <BlurValue blur={user?.blurValues}>
                    {formatCurrency(budget.monthlyLimit, userCurrency)}
                  </BlurValue>
                </span>
                <span className={cn(
                  "font-medium",
                  budget.isOverBudget ? "text-red-400" : "text-green-400"
                )}>
                  <BlurValue blur={user?.blurValues}>
                    {budget.remaining >= 0 ? '+' : ''}{formatCurrency(budget.remaining, userCurrency)}
                  </BlurValue>
                </span>
              </div>

              {budget.isOverBudget && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-md px-2 py-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('overBudgetBy')} {formatCurrency(Math.abs(budget.remaining), userCurrency)}
                </div>
              )}
              {budget.isAtLimit && (
                <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 rounded-md px-2 py-1">
                  <CheckCircle className="w-3 h-3" />
                  {t('reachedLimit')}
                </div>
              )}
              {budget.isNearLimit && (
                <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-md px-2 py-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('approachingLimit')} ({budget.displayPercentage.toFixed(0)}%)
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default React.memo(BudgetProgress);