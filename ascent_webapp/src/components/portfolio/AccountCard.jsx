import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Wallet, Building2, Coins, PiggyBank, Briefcase, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ascent } from '@/api/client';
import BlurValue from '../BlurValue';
import { useTheme } from '../ThemeProvider';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

const accountTypeIcons = {
  Investment: Briefcase,
  IRA: Building2,
  Pension: Wallet,
  Savings: PiggyBank,
  Other: Coins,
};

const accountTypeColors = {
  Investment: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  IRA: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Pension: 'bg-green-500/10 text-green-400 border-green-500/30',
  Savings: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  Other: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function AccountCard({ account, totalValue, totalPnL, totalPnLPercent, editMode, onDelete }) {
  const { user, t, colors } = useTheme();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'USD';
  const accountCurrency = account.baseCurrency || 'USD';
  
  useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  const Icon = useMemo(() => accountTypeIcons[account.type] || Coins, [account.type]);
  const isPositive = useMemo(() => totalPnL >= 0, [totalPnL]);

  // Convert amounts to user's global currency
  const convertedTotalValue = useMemo(() => {
    if (accountCurrency === userCurrency) {
      return totalValue;
    }
    if (rates && Object.keys(rates).length > 0) {
      return convertCurrency(totalValue, accountCurrency, userCurrency, rates);
    }
    return totalValue;
  }, [totalValue, accountCurrency, userCurrency, rates, convertCurrency]);

  const convertedTotalPnL = useMemo(() => {
    if (accountCurrency === userCurrency) {
      return totalPnL;
    }
    if (rates && Object.keys(rates).length > 0) {
      return convertCurrency(totalPnL, accountCurrency, userCurrency, rates);
    }
    return totalPnL;
  }, [totalPnL, accountCurrency, userCurrency, rates, convertCurrency]);

  const formatCurrency = useCallback((value, currency = userCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }, [userCurrency]);

  const handleEdit = useCallback((e) => {
    e.preventDefault();
    window.location.href = createPageUrl(`AccountDetail?id=${account.id}`);
  }, [account.id]);

  const handleDelete = useCallback((e) => {
    e.preventDefault();
    if (window.confirm(`Are you sure you want to delete "${account.name}"? This will also delete all positions in this account.`)) {
      onDelete();
    }
  }, [account.name, onDelete]);

  const cardContent = (
    <Card className={cn(
      colors.cardBg,
      colors.cardBorder,
      !editMode && "hover:border-[#5C8374] transition-all duration-300 cursor-pointer group hover:shadow-lg hover:shadow-[#5C8374]/20"
    )}>
      <CardContent className="p-3 md:p-5">
          <div className="flex items-center justify-between mb-2 md:mb-4 gap-2">
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 p-1.5 md:p-2.5 rounded-lg md:rounded-xl bg-[#5C8374]/20 group-hover:bg-[#5C8374]/30 transition-colors">
                <Icon className={cn("w-4 h-4 md:w-5 md:h-5", colors.accentText)} />
              </div>
              <h3 className={cn("font-semibold text-sm md:text-base leading-tight truncate", colors.textPrimary)}>{account.name}</h3>
            </div>
            <Badge className={cn('text-xs border leading-tight flex-shrink-0', accountTypeColors[account.type])}>
              {t(`accountType${account.type}`)}
            </Badge>
          </div>

          <div className="space-y-2 md:space-y-3">
            <div>
              <p className={cn("text-xs mb-0.5 md:mb-1 leading-tight", colors.textTertiary)}>{t('totalValue')}</p>
              <p className={cn("text-xl md:text-2xl font-bold leading-tight", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(convertedTotalValue, userCurrency)}
                </BlurValue>
              </p>
              {accountCurrency !== userCurrency && (
                <p className={cn("text-[10px] md:text-xs leading-tight mt-0.5", colors.textTertiary)}>
                  {formatCurrency(totalValue, accountCurrency)}
                </p>
              )}
            </div>

            <div className={cn("flex items-center justify-between pt-2 md:pt-3 border-t", colors.border)}>
              <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-400 flex-shrink-0" />
                )}
                <span className={cn(
                  'text-xs md:text-sm font-semibold leading-tight truncate',
                  isPositive ? 'text-green-400' : 'text-red-400'
                )}>
                  <BlurValue blur={user?.blurValues}>
                    {isPositive ? '+' : ''}{formatCurrency(convertedTotalPnL, userCurrency)}
                  </BlurValue>
                </span>
                {accountCurrency !== userCurrency && (
                  <span className={cn("text-[10px] md:text-xs leading-tight ml-1", colors.textTertiary)}>
                    ({isPositive ? '+' : ''}{formatCurrency(totalPnL, accountCurrency)})
                  </span>
                )}
              </div>
              <span className={cn(
                'text-xs md:text-sm font-semibold leading-tight flex-shrink-0',
                isPositive ? 'text-green-400' : 'text-red-400'
              )}>
                <BlurValue blur={user?.blurValues}>
                  {isPositive ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                </BlurValue>
              </span>
            </div>

            {editMode && (
              <div className="flex gap-1.5 md:gap-2 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-[#5C8374]/20">
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  size="sm"
                  className={cn("flex-1 bg-transparent hover:bg-[#5C8374]/20 text-xs md:text-sm", colors.border, colors.textSecondary)}
                >
                  <Edit className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-transparent hover:bg-red-500/20 border-red-500/30 text-red-400 hover:text-red-300 text-xs md:text-sm"
                >
                  <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
  );

  if (editMode) {
    return cardContent;
  }

  return (
    <Link to={createPageUrl(`AccountDetail?id=${account.id}`)}>
      {cardContent}
    </Link>
  );
}

export default React.memo(AccountCard);