import React, { useState, useEffect } from 'react';
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

export default function AccountCard({ account, totalValue, totalPnL, totalPnLPercent, editMode, onDelete }) {
  const { user, t, colors } = useTheme();
  const Icon = accountTypeIcons[account.type] || Coins;
  const isPositive = totalPnL >= 0;

  const formatCurrency = (value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const handleEdit = (e) => {
    e.preventDefault();
    window.location.href = createPageUrl(`AccountDetail?id=${account.id}`);
  };

  const handleDelete = (e) => {
    e.preventDefault();
    if (window.confirm(`Are you sure you want to delete "${account.name}"? This will also delete all positions in this account.`)) {
      onDelete();
    }
  };

  const cardContent = (
    <Card className={cn(
      colors.cardBg,
      colors.cardBorder,
      !editMode && "hover:border-[#5C8374] transition-all duration-300 cursor-pointer group hover:shadow-lg hover:shadow-[#5C8374]/20"
    )}>
      <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#5C8374]/20 group-hover:bg-[#5C8374]/30 transition-colors">
                <Icon className={cn("w-5 h-5", colors.accentText)} />
              </div>
              <div>
                <h3 className={cn("font-semibold text-base", colors.textPrimary)}>{account.name}</h3>
                <Badge className={cn('text-xs border mt-1', accountTypeColors[account.type])}>
                  {t(`accountType${account.type}`)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className={cn("text-xs mb-1", colors.textTertiary)}>{t('totalValue')}</p>
              <p className={cn("text-2xl font-bold", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(totalValue, account.baseCurrency)}
                </BlurValue>
              </p>
            </div>

            <div className={cn("flex items-center justify-between pt-3 border-t", colors.border)}>
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className={cn(
                  'text-sm font-semibold',
                  isPositive ? 'text-green-400' : 'text-red-400'
                )}>
                  <BlurValue blur={user?.blurValues}>
                    {isPositive ? '+' : ''}{formatCurrency(totalPnL, account.baseCurrency)}
                  </BlurValue>
                </span>
              </div>
              <span className={cn(
                'text-sm font-semibold',
                isPositive ? 'text-green-400' : 'text-red-400'
              )}>
                <BlurValue blur={user?.blurValues}>
                  {isPositive ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                </BlurValue>
              </span>
            </div>

            {editMode && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-[#5C8374]/20">
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  size="sm"
                  className={cn("flex-1 bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-transparent hover:bg-red-500/20 border-red-500/30 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
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