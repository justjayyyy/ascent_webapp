import React, { useState, useMemo, useCallback } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccountCard from '../components/portfolio/AccountCard';
import AddAccountDialog from '../components/portfolio/AddAccountDialog';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import BlurValue from '../components/BlurValue';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

export default function Portfolio() {
  const { user, colors, t } = useTheme();
  const userCurrency = user?.currency || 'USD';
  const { convertCurrency, fetchExchangeRates } = useCurrencyConversion();
  const { hasPermission } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();

  // Memoize user identifiers to prevent unnecessary effect runs
  const userId = useMemo(() => user?._id || user?.id, [user?._id, user?.id]);
  const userEmail = useMemo(() => user?.email, [user?.email]);

  // Refetch accounts when user changes (e.g., after login)
  React.useEffect(() => {
    if (userId && userEmail) {
      const queryKey = ['accounts', userId, userEmail];

      // Remove any cached data for this query key first
      queryClient.removeQueries({
        queryKey,
        exact: true
      });

      // Then invalidate and refetch
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'accounts'
      });
    } else if (!user) {
      // User logged out - clear all account queries
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === 'accounts'
      });
    }
  }, [userId, userEmail, user, queryClient]);

  // Fetch exchange rates on mount
  React.useEffect(() => {
    if (userCurrency) {
      fetchExchangeRates('USD');
    }
  }, [userCurrency, fetchExchangeRates]);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', user?._id || user?.id, user?.email],
    queryFn: async () => {
      if (!user || (!user._id && !user.id) || !user.email) {
        return [];
      }
      try {
        const result = await ascent.entities.Account.list('-created_date', 1000);
        const allAccounts = Array.isArray(result) ? result : [];

        // Filter based on granular permissions if they exist
        if (user.permissions?.allowedAccountIds && Array.isArray(user.permissions.allowedAccountIds)) {
          return allAccounts.filter(acc => user.permissions.allowedAccountIds.includes(acc.id || acc._id));
        }

        return allAccounts;
      } catch (error) {
        console.error('Error fetching accounts:', error);
        return [];
      }
    },
    enabled: !!(user && (user._id || user.id) && user.email),
    staleTime: 5 * 60 * 1000, // 5 minutes - reduce unnecessary refetches
    refetchOnMount: true, // Refetch when component mounts after login
    refetchOnWindowFocus: false, // Don't refetch on focus
    // Use structural sharing to prevent overwriting with stale/empty data
    structuralSharing: (oldData, newData) => {
      // Only prevent overwrite if we're doing an optimistic update
      if (!oldData || !Array.isArray(oldData) || oldData.length === 0) {
        return newData;
      }
      // If new data is empty array and old data has items, keep old data
      if (Array.isArray(newData) && newData.length === 0 && oldData.length > 0) {
        return oldData;
      }
      return newData;
    },
  });

  const { data: allPositions = [] } = useQuery({
    queryKey: ['positions', user?._id || user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Position.list('-created_date', 1000);
    },
    enabled: !!user,
  });

  const createAccountMutation = useMutation({
    mutationFn: async (accountData) => {
      try {
        // Backend automatically sets created_by from authenticated user
        const account = await ascent.entities.Account.create(accountData);

        const accountId = account.id || account._id?.toString();
        const accountWithId = accountId ? { ...account, id: accountId } : account;

        // Create initial Cash position with the initial investment (only if we have an ID)
        if (accountId && accountData.initialInvestment > 0) {
          try {
            await ascent.entities.Position.create({
              accountId,
              symbol: 'CASH',
              assetType: 'Cash',
              quantity: accountData.initialInvestment,
              averageBuyPrice: 1,
              currentPrice: 1,
              currency: accountData.baseCurrency,
              date: new Date().toISOString().split('T')[0],
            });
          } catch (positionError) {
            console.warn('Initial cash position failed after account creation:', positionError);
          }
        } else if (!accountId && accountData.initialInvestment > 0) {
          console.warn('Skipping initial cash position because account ID is missing', account);
        }

        return accountWithId;
      } catch (error) {
        console.error('Account creation failed:', error);
        throw error;
      }
    },
    onSuccess: async (account) => {
      // Close dialog first
      setAddDialogOpen(false);

      // Ensure account has id field
      const accountId = account?.id || account?._id?.toString();
      const accountWithId = accountId ? { ...account, id: accountId } : account;

      if (!accountId) {
        console.warn('Received account response without an ID. Cache update may be incomplete.', account);
      }

      // Show success message
      toast.success(t('accountCreatedSuccessfully'));

      const exactQueryKey = ['accounts', user?._id || user?.id, user?.email];

      // Optimistically update the cache
      queryClient.setQueryData(exactQueryKey, (oldAccounts = []) => {
        if (!Array.isArray(oldAccounts)) {
          return [accountWithId];
        }
        // Check if account already exists
        const exists = accountId && oldAccounts.some(acc => {
          const accId = acc.id || acc._id?.toString();
          return accId === accountId;
        });
        if (exists) {
          return oldAccounts.map(acc => {
            const accId = acc.id || acc._id?.toString();
            return accId === accountId ? accountWithId : acc;
          });
        }
        return accountId ? [accountWithId, ...oldAccounts] : oldAccounts;
      });

      // Invalidate queries - React Query will refetch in background
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'accounts'
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'positions'
      });
    },
    onError: (error) => {
      console.error('Account creation error:', error);
      toast.error(error.message || t('failedToCreateAccount'));
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId) => {
      // Delete all positions in this account first
      const positions = allPositions.filter(p => p.accountId === accountId);
      await Promise.all(positions.map(p => ascent.entities.Position.delete(p.id)));

      // Delete the account
      await ascent.entities.Account.delete(accountId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success(t('accountDeletedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToDeleteAccount'));
    },
  });

  const calculateAccountMetrics = useCallback((account) => {
    const positions = allPositions.filter(p => p.accountId === account.id);

    let totalValue = 0; // Account Currency
    let totalCostBasis = 0; // Account Currency
    let totalValueUser = 0; // User Currency
    let totalCostBasisUser = 0; // User Currency

    positions.forEach(position => {
      const currentPrice = position.currentPrice || position.averageBuyPrice;

      const rawMarketValue = position.quantity * currentPrice;
      const rawCostBasis = position.quantity * position.averageBuyPrice;

      // 1. Convert to Account Currency (for AccountCard)
      const marketValueAccount = convertCurrency(rawMarketValue, position.currency || 'USD', account.baseCurrency || 'USD');
      const costBasisAccount = convertCurrency(rawCostBasis, position.currency || 'USD', account.baseCurrency || 'USD');

      totalValue += marketValueAccount;
      totalCostBasis += costBasisAccount;

      // 2. Convert to User Currency (for Overall Summary)
      const marketValueUser = convertCurrency(rawMarketValue, position.currency || 'USD', userCurrency);
      const costBasisUser = convertCurrency(rawCostBasis, position.currency || 'USD', userCurrency);

      totalValueUser += marketValueUser;
      totalCostBasisUser += costBasisUser;
    });

    const totalPnL = totalValue - totalCostBasis;
    const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    const totalPnLUser = totalValueUser - totalCostBasisUser;

    return {
      totalValue,
      totalPnL,
      totalPnLPercent,
      totalValueUser,
      totalPnLUser
    };
  }, [allPositions, userCurrency, convertCurrency]);

  const formatCurrency = useCallback((value, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || user?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }, [user?.currency]);

  // Memoize account metrics to prevent recalculation on every render
  const accountMetricsMap = useMemo(() => {
    const map = new Map();
    accounts.forEach(account => {
      map.set(account.id, calculateAccountMetrics(account));
    });
    return map;
  }, [accounts, calculateAccountMetrics]);

  const overallMetrics = useMemo(() => {
    return accounts.reduce((acc, account) => {
      const metrics = accountMetricsMap.get(account.id) || { totalValueUser: 0, totalPnLUser: 0 };
      return {
        totalValue: acc.totalValue + (metrics.totalValueUser || 0),
        totalPnL: acc.totalPnL + (metrics.totalPnLUser || 0),
      };
    }, { totalValue: 0, totalPnL: 0 });
  }, [accounts, accountMetricsMap]);

  const overallPnLPercent = useMemo(() => {
    return overallMetrics.totalValue > 0
      ? ((overallMetrics.totalPnL / (overallMetrics.totalValue - overallMetrics.totalPnL)) * 100)
      : 0;
  }, [overallMetrics]);

  if (!user) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-3 md:p-8", colors.bgPrimary)}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 md:mb-8">
          <div className="flex items-center justify-between mb-3 md:mb-6">
            <div>
              <h1 className={cn("text-2xl md:text-4xl font-bold mb-1 md:mb-2", colors.textPrimary)}>{t('portfolio')}</h1>
              <p className={cn("text-sm md:text-base", colors.textTertiary)}>{t('trackAndManageAccounts')}</p>
            </div>
            <div className="flex gap-2">
              {hasPermission('editPortfolio') && (
                <>
                  <Button
                    onClick={() => setEditMode(!editMode)}
                    variant="outline"
                    className={cn(
                      "bg-transparent hover:bg-[#5C8374]/20",
                      colors.border,
                      colors.textSecondary,
                      editMode && "bg-[#5C8374]/20"
                    )}
                  >
                    <Edit2 className="w-5 h-5 mr-2" />
                    <span className="hidden sm:inline">{editMode ? t('done') : t('edit')}</span>
                  </Button>
                  <Button
                    onClick={() => setAddDialogOpen(true)}
                    className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white shadow-lg"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    <span className="hidden sm:inline">{t('addAccount')}</span>
                    <span className="sm:hidden">{t('add')}</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Overall Summary */}
          <div className="flex flex-row flex-nowrap gap-2 md:gap-4 mb-3 md:mb-6 overflow-x-auto">
            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalPortfolioValue')}</p>
              <p className={cn("text-sm md:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start", colors.textPrimary)}>
                <BlurValue blur={user?.blurValues}>
                  {formatCurrency(overallMetrics.totalValue, user?.currency)}
                </BlurValue>
              </p>
            </div>
            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalPnL')}</p>
              <p className={`text-sm md:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start ${overallMetrics.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <BlurValue blur={user?.blurValues}>
                  {overallMetrics.totalPnL >= 0 ? '+' : ''}{formatCurrency(overallMetrics.totalPnL, user?.currency)}
                </BlurValue>
              </p>
            </div>
            <div className={cn("flex-shrink-0 flex-1 rounded-lg md:rounded-xl p-3 md:p-6 border min-w-0 flex flex-col justify-center", colors.cardBg, colors.cardBorder)}>
              <p className={cn("text-[10px] md:text-sm mb-2 md:mb-2 w-full flex justify-center md:justify-start opacity-80", colors.textTertiary)}>{t('totalReturn')}</p>
              <p className={`text-sm md:text-3xl font-bold leading-tight w-full flex justify-center md:justify-start ${overallPnLPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {overallPnLPercent >= 0 ? '+' : ''}{overallPnLPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Accounts Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
          </div>
        ) : accounts.length === 0 ? (
          <div className={cn("text-center py-16 rounded-xl border", colors.cardBg, colors.cardBorder)}>
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#5C8374]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className={cn("w-8 h-8", colors.accentText)} />
              </div>
              <h3 className={cn("text-xl font-semibold mb-2", colors.textPrimary)}>{t('noAccountsYetTitle')}</h3>
              <p className={cn("mb-6", colors.textTertiary)}>
                {t('noAccountsCreateFirst')}
              </p>
              {hasPermission('editPortfolio') && (
                <Button
                  onClick={() => setAddDialogOpen(true)}
                  className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {t('createYourFirstAccount')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-6">
            {accounts.map((account) => {
              const metrics = accountMetricsMap.get(account.id) || { totalValue: 0, totalPnL: 0, totalPnLPercent: 0 };
              return (
                <AccountCard
                  key={account.id}
                  account={account}
                  totalValue={metrics.totalValue}
                  totalPnL={metrics.totalPnL}
                  totalPnLPercent={metrics.totalPnLPercent}
                  editMode={editMode}
                  onDelete={() => deleteAccountMutation.mutate(account.id)}
                />
              );
            })}
          </div>
        )}

        {/* Add Account Dialog */}
        <AddAccountDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          onSubmit={async (data) => {
            try {
              await createAccountMutation.mutateAsync(data);
            } catch (error) {
              // Error handled by mutation's onError
            }
          }}
          isLoading={createAccountMutation.isPending}
        />
      </div>
    </div>
  );
}