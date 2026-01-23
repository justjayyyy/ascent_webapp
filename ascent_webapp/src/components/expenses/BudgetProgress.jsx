import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, translateCategory } from '../ThemeProvider';
import BlurValue from '../BlurValue';

function BudgetProgress({ budgets, transactions, formatCurrency }) {
  const { colors, language, user, t } = useTheme();

  // Calculate current month spending by category (memoized)
  const spendingByCategory = useMemo(() => {
    const now = new Date();
    const thisMonthTransactions = transactions.filter(t => {
      const transDate = new Date(t.date);
      return t.type === 'Expense' &&
        transDate.getMonth() === now.getMonth() &&
        transDate.getFullYear() === now.getFullYear() &&
        t.currency === user?.currency;
    });

    const spending = {};
    thisMonthTransactions.forEach(t => {
      if (!spending[t.category]) {
        spending[t.category] = 0;
      }
      spending[t.category] += t.amount;
    });

    return spending;
  }, [transactions, user?.currency]);

  const budgetData = useMemo(() => budgets
    .filter(b => b.currency === user?.currency)
    .map(budget => {
      const spent = spendingByCategory[budget.category] || 0;
      const percentage = (spent / budget.monthlyLimit) * 100;
      const remaining = budget.monthlyLimit - spent;
      const threshold = Number(budget.alertThreshold) || 80;
      const isOverBudget = percentage > 100;
      const isAtLimit = percentage === 100;
      const isNearLimit = percentage >= threshold && percentage < 100;

      return {
        ...budget,
        spent,
        remaining,
        percentage: Math.min(percentage, 100),
        displayPercentage: percentage,
        isOverBudget,
        isAtLimit,
        isNearLimit,
      };
    })
    .sort((a, b) => b.displayPercentage - a.displayPercentage), [budgets, spendingByCategory, user?.currency]);

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
                    {formatCurrency(budget.spent, budget.currency)}
                  </BlurValue>
                  {' / '}
                  <BlurValue blur={user?.blurValues}>
                    {formatCurrency(budget.monthlyLimit, budget.currency)}
                  </BlurValue>
                </span>
                <span className={cn(
                  "font-medium",
                  budget.isOverBudget ? "text-red-400" : "text-green-400"
                )}>
                  <BlurValue blur={user?.blurValues}>
                    {budget.remaining >= 0 ? '+' : ''}{formatCurrency(budget.remaining, budget.currency)}
                  </BlurValue>
                </span>
              </div>

              {budget.isOverBudget && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-md px-2 py-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('overBudgetBy')} {formatCurrency(Math.abs(budget.remaining), budget.currency)}
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