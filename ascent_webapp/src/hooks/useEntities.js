// Custom hooks for entity data fetching with optimized caching
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ascent } from '@/api/client';
import { toast } from 'sonner';

// Stale times for different data types
const STALE_TIMES = {
  user: 10 * 60 * 1000,      // 10 minutes
  accounts: 5 * 60 * 1000,   // 5 minutes
  positions: 2 * 60 * 1000,  // 2 minutes (prices change)
  transactions: 5 * 60 * 1000,
  goals: 5 * 60 * 1000,
  widgets: 10 * 60 * 1000,
  snapshots: 10 * 60 * 1000,
};

// Generic list hook
export function useEntityList(entityName, options = {}) {
  const { 
    enabled = true, 
    staleTime = STALE_TIMES.accounts,
    filters = {},
    sort = '-created_date',
    limit = 1000,
  } = options;

  const entity = ascent.entities[entityName];
  if (!entity) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return useQuery({
    queryKey: [entityName.toLowerCase(), 'list', filters],
    queryFn: () => Object.keys(filters).length > 0 
      ? entity.filter(filters, sort, limit)
      : entity.list(sort, limit),
    enabled,
    staleTime,
  });
}

// Generic single item hook
export function useEntity(entityName, id, options = {}) {
  const { enabled = true, staleTime = STALE_TIMES.accounts } = options;

  const entity = ascent.entities[entityName];
  if (!entity) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return useQuery({
    queryKey: [entityName.toLowerCase(), id],
    queryFn: async () => {
      try {
        return await entity.get(id);
      } catch {
        return null;
      }
    },
    enabled: enabled && !!id,
    staleTime,
  });
}

// Generic mutations
export function useEntityMutations(entityName, options = {}) {
  const { 
    onCreateSuccess,
    onUpdateSuccess, 
    onDeleteSuccess,
    invalidateKeys = [[entityName.toLowerCase(), 'list']],
  } = options;

  const queryClient = useQueryClient();
  const entity = ascent.entities[entityName];

  const invalidate = () => {
    invalidateKeys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  };

  const createMutation = useMutation({
    mutationFn: (data) => entity.create(data),
    onSuccess: (data) => {
      invalidate();
      onCreateSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error.message || `Failed to create ${entityName}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => entity.update(id, data),
    onSuccess: (data) => {
      invalidate();
      onUpdateSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error.message || `Failed to update ${entityName}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => entity.delete(id),
    onSuccess: (data) => {
      invalidate();
      onDeleteSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error.message || `Failed to delete ${entityName}`);
    },
  });

  return {
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
  };
}

// Specific hooks for common entities
export function useAccounts(options = {}) {
  return useEntityList('Account', {
    staleTime: STALE_TIMES.accounts,
    ...options,
  });
}

export function useAccount(id) {
  return useEntity('Account', id, { staleTime: STALE_TIMES.accounts });
}

export function usePositions(accountId, options = {}) {
  const filters = accountId ? { accountId } : {};
  return useEntityList('Position', {
    staleTime: STALE_TIMES.positions,
    filters,
    ...options,
  });
}

export function useDayTrades(accountId, options = {}) {
  const filters = accountId ? { accountId } : {};
  return useEntityList('DayTrade', {
    staleTime: STALE_TIMES.transactions,
    filters,
    sort: '-date',
    ...options,
  });
}

export function useTransactions(options = {}) {
  return useEntityList('ExpenseTransaction', {
    staleTime: STALE_TIMES.transactions,
    sort: '-date',
    ...options,
  });
}

export function useGoals(options = {}) {
  return useEntityList('FinancialGoal', {
    staleTime: STALE_TIMES.goals,
    ...options,
  });
}

export function useBudgets(options = {}) {
  return useEntityList('Budget', {
    staleTime: STALE_TIMES.goals,
    ...options,
  });
}

export function useCategories(options = {}) {
  return useEntityList('Category', {
    staleTime: STALE_TIMES.goals,
    ...options,
  });
}

export function useCards(options = {}) {
  return useEntityList('Card', {
    staleTime: STALE_TIMES.goals,
    ...options,
  });
}

export function useDashboardWidgets(options = {}) {
  return useEntityList('DashboardWidget', {
    staleTime: STALE_TIMES.widgets,
    ...options,
  });
}

export function useSnapshots(options = {}) {
  return useEntityList('PortfolioSnapshot', {
    staleTime: STALE_TIMES.snapshots,
    sort: '-date',
    limit: 30,
    ...options,
  });
}

// Combined hook for portfolio data
export function usePortfolioData() {
  const accounts = useAccounts();
  const positions = usePositions();
  const dayTrades = useDayTrades();
  const snapshots = useSnapshots();

  const isLoading = accounts.isLoading || positions.isLoading;
  const isError = accounts.isError || positions.isError;

  // Calculate portfolio metrics
  const metrics = {
    accounts: accounts.data || [],
    positions: positions.data || [],
    dayTrades: dayTrades.data || [],
    snapshots: snapshots.data || [],
    
    get totalValue() {
      return this.positions.reduce((sum, p) => {
        const price = p.currentPrice || p.averageBuyPrice;
        return sum + (p.quantity * price);
      }, 0);
    },
    
    get totalCostBasis() {
      return this.positions.reduce((sum, p) => {
        return sum + (p.quantity * p.averageBuyPrice);
      }, 0);
    },
    
    get totalPnL() {
      return this.totalValue - this.totalCostBasis;
    },
    
    get totalPnLPercent() {
      return this.totalCostBasis > 0 
        ? (this.totalPnL / this.totalCostBasis) * 100 
        : 0;
    },
  };

  return {
    ...metrics,
    isLoading,
    isError,
    refetch: () => {
      accounts.refetch();
      positions.refetch();
    },
  };
}

