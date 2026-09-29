import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Edit, Trash2, Target, Calendar, TrendingUp, Link2, TrendingDown } from 'lucide-react';
import { format, differenceInDays, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';

const categoryColors = {
  Retirement: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  'Emergency Fund': 'bg-success/10 text-success border-success/30',
  Investment: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  Savings: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  'Debt Payoff': 'bg-danger/10 text-danger border-danger/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

const statusColors = {
  Active: 'bg-success/10 text-success border-success/30',
  Completed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  Paused: 'bg-muted text-muted-foreground border-border',
};

import BlurValue from '../BlurValue';

export default function GoalProgressCard({ goal, onEdit, onDelete, linkedAccounts = [] }) {
  const { colors, user } = useTheme();
  const formatCurrency = (value, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  // Calculate current amount from linked accounts or use manual amount
  const currentAmount = linkedAccounts.length > 0 
    ? linkedAccounts.reduce((sum, acc) => sum + (acc.totalValue || 0), 0)
    : goal.currentAmount;

  const progress = Math.min(100, ((currentAmount / goal.targetAmount) * 100) || 0);
  const remaining = Math.max(0, goal.targetAmount - currentAmount);
  const daysLeft = differenceInDays(new Date(goal.targetDate), new Date());

  // Calculate projected achievement date based on target return
  const calculateProjectedDate = () => {
    if (currentAmount >= goal.targetAmount) return null;
    if (currentAmount === 0) return null;
    
    const monthlyReturn = (goal.targetReturnPercent || 8) / 100 / 12;
    let amount = currentAmount;
    let months = 0;
    
    while (amount < goal.targetAmount && months < 1200) { // Cap at 100 years
      amount = amount * (1 + monthlyReturn);
      months++;
    }
    
    return addMonths(new Date(), months);
  };

  const projectedDate = calculateProjectedDate();
  const projectedDaysFromNow = projectedDate ? differenceInDays(projectedDate, new Date()) : null;
  const onTrack = projectedDate ? projectedDate <= new Date(goal.targetDate) : null;

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "hover:border-primary/40 transition-all")}>
      <CardContent className="p-5">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn('text-xs border', categoryColors[goal.category] || categoryColors['Other'])}>
                  {goal.category}
                </Badge>
                <Badge className={cn('text-xs border', statusColors[goal.status])}>
                  {goal.status}
                </Badge>
              </div>
              <h3 className={cn("font-semibold text-lg truncate", colors.textPrimary)}>{goal.title}</h3>
            </div>
            <div className="flex gap-2">
              <Button
                size="icon"
                aria-label={t('edit')}
                variant="ghost"
                onClick={() => onEdit(goal)}
                className={cn("h-11 w-11 sm:h-8 sm:w-8 hover:bg-primary/20", colors.textSecondary)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                aria-label={t('delete')}
                variant="ghost"
                onClick={() => onDelete(goal.id)}
                className="h-11 w-11 sm:h-8 sm:w-8 text-danger hover:text-danger hover:bg-danger/20"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className={colors.textTertiary}>Progress</span>
              <span className={cn("font-semibold", colors.textPrimary)}>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className={cn("h-2", colors.bgTertiary)} />
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <div className={cn("flex items-center gap-1 text-xs", colors.textTertiary)}>
                <TrendingUp className="w-3 h-3" />
                Current / Target
              </div>
              <p className={cn("text-sm font-semibold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(currentAmount, user?.currency)} / {formatCurrency(goal.targetAmount, user?.currency)}
                </BlurValue>
              </p>
              {linkedAccounts.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-primary">
                  <Link2 className="w-3 h-3" />
                  <span>Auto-tracked from {linkedAccounts.length} account{linkedAccounts.length > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className={cn("flex items-center gap-1 text-xs", colors.textTertiary)}>
                <Target className="w-3 h-3" />
                Remaining
              </div>
              <p className={cn("text-sm font-semibold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(remaining, user?.currency)}
                </BlurValue>
              </p>
            </div>
          </div>

          {/* Projection Info */}
          {projectedDate && goal.status === 'Active' && (
            <div className={cn("pt-3 border-t", colors.borderLight)}>
              <div className={cn("rounded-lg p-3 space-y-2", colors.bgTertiary)}>
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs", colors.textTertiary)}>Projected Achievement</span>
                  {onTrack ? (
                    <Badge className="text-xs bg-success/10 text-success border-success/30">
                      <TrendingUp className="w-3 h-3 me-1" />
                      On Track
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-danger/10 text-danger border-danger/30">
                      <TrendingDown className="w-3 h-3 me-1" />
                      Behind
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-semibold", colors.textPrimary)}>
                    {format(projectedDate, 'MMM dd, yyyy')}
                  </span>
                  <span className={cn("text-xs", colors.textTertiary)}>
                    ~{Math.round(projectedDaysFromNow / 30)} months
                  </span>
                </div>
                <p className={cn("text-xs", colors.textTertiary)}>
                  Based on {goal.targetReturnPercent || 8}% annual return
                </p>
              </div>
            </div>
          )}

          {/* Date Info */}
          <div className={cn("flex items-center justify-between pt-2 border-t", colors.borderLight)}>
            <div className={cn("flex items-center gap-2 text-xs", colors.textTertiary)}>
              <Calendar className="w-3 h-3" />
              Target: {format(new Date(goal.targetDate), 'MMM dd, yyyy')}
            </div>
            <span className={cn(
              'text-xs font-medium',
              daysLeft < 30 ? 'text-danger' : daysLeft < 90 ? 'text-yellow-600 dark:text-yellow-400' : 'text-success'
            )}>
              {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}