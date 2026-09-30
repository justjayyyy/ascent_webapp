import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Target, Tag, RefreshCw } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { parseISO, eachMonthOfInterval, format as formatDate, getYear, getMonth } from 'date-fns';
import AddTransactionDialog from '../components/expenses/AddTransactionDialog';
import BudgetManager from '../components/expenses/BudgetManager';
import CategoryManager from '../components/expenses/CategoryManager';
import ExpenseMonthView from '../components/expenses/ExpenseMonthView';
import PeriodSelector from '../components/expenses/PeriodSelector';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function Expenses() {
  const { user, colors, t } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('editExpenses');
  const canEditBudgets = hasPermission('editBudgets');
  const canViewBudgets = hasPermission('viewBudgets');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState([(new Date().getMonth() + 1).toString()]); // Array of selected months
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const queryClient = useQueryClient();

  // Memoize user identifiers to prevent unnecessary query refetches
  const userId = useMemo(() => user?.id || user?._id, [user?.id, user?._id]);
  const userEmail = useMemo(() => user?.email, [user?.email]);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.ExpenseTransaction.list('-date', 1000);
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000, // 3 minutes
    // Payments can arrive from the phone at any time (Apple Pay taps): refresh on return to the app and while it is open
    refetchOnWindowFocus: 'always',
    refetchInterval: 30 * 1000,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.Card.list();
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.Account.list();
    },
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.Budget.list('-created_date');
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      // Use list() which triggers default category creation on first access
      return await ascent.entities.Category.list('-created_date');
    },
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
  });

  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);

  const createTransactionMutation = useMutation({
    mutationFn: (transactionData) => ascent.entities.ExpenseTransaction.create(transactionData),
    onSuccess: () => {
      // Skip success message if we're creating recurring transactions (will show batch message instead)
      if (isCreatingRecurring) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setAddDialogOpen(false);
      setEditingTransaction(null);
      toast.success(t('transactionAddedSuccessfully') || 'Transaction added successfully');
    },
    onError: () => {
      toast.error(t('failedToAddTransaction') || 'Failed to add transaction');
    },
  });

  const updateTransactionMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.ExpenseTransaction.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setAddDialogOpen(false);
      setEditingTransaction(null);
      toast.success(t('transactionUpdatedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToUpdateTransaction'));
    },
  });

  const confirmTransactionMutation = useMutation({
    mutationFn: (tx) => ascent.entities.ExpenseTransaction.update(tx.id, { status: 'confirmed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('transactionConfirmed'));
    },
    onError: () => toast.error(t('failedToConfirm')),
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: (transactionId) => ascent.entities.ExpenseTransaction.delete(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('transactionDeletedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToDeleteTransaction'));
    },
  });

  const createBudgetMutation = useMutation({
    mutationFn: (budgetData) => ascent.entities.Budget.create(budgetData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(t('budgetCreatedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToCreateBudget'));
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Budget.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(t('budgetUpdatedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToUpdateBudget'));
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId) => ascent.entities.Budget.delete(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(t('budgetDeletedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToDeleteBudget'));
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (categoryData) => ascent.entities.Category.create(categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(t('categoryCreatedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToCreateCategory'));
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId) => {
      await ascent.entities.Category.delete(categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(t('categoryDeletedSuccessfully'));
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error(t('failedToDeleteCategory'));
    },
  });

  const handleEditTransaction = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setAddDialogOpen(true);
  }, []);

  const handleDeleteTransaction = useCallback((id) => {
    setTransactionToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDeleteTransaction = useCallback(() => {
    if (transactionToDelete) {
      deleteTransactionMutation.mutate(transactionToDelete);
      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
    }
  }, [transactionToDelete, deleteTransactionMutation]);

  const handleDuplicateTransaction = useCallback((transaction) => {
    // Create a duplicate with today's date - remove all ID and timestamp fields
    const {
      id,
      _id,
      created_date,
      updated_date,
      created_by,
      ...transactionFields
    } = transaction;

    const duplicatedTransaction = {
      ...transactionFields,
      date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      // Explicitly remove any ID fields to ensure it's treated as a new transaction
      id: undefined,
      _id: undefined,
    };

    setEditingTransaction(duplicatedTransaction);
    setAddDialogOpen(true);
  }, []);

  const handleAddTransaction = useCallback(async (transactionData) => {
    // Check if we're editing an existing transaction (has valid ID)
    const isEditing = editingTransaction && editingTransaction.id && editingTransaction._id;

    if (isEditing) {
      // Editing existing transaction
      await updateTransactionMutation.mutateAsync({
        id: editingTransaction.id,
        // Saving an automatically added payment after looking at it counts as reviewing it
        data: editingTransaction.status === 'pending' ? { ...transactionData, status: 'confirmed' } : transactionData,
      });
    } else {
      // Creating new transaction(s)
      const cleanData = { ...transactionData };
      delete cleanData.id;
      delete cleanData._id;
      delete cleanData.created_date;
      delete cleanData.updated_date;

      // Handle recurring transactions
      if (cleanData.isRecurring && cleanData.recurringFrequency === 'monthly' && cleanData.recurringStartDate && cleanData.recurringEndDate) {
        const startDate = parseISO(cleanData.recurringStartDate);
        const endDate = parseISO(cleanData.recurringEndDate);
        const dayOfMonth = startDate.getDate();

        // Generate all monthly dates between start and end
        const monthlyDates = eachMonthOfInterval({ start: startDate, end: endDate });

        // Create a transaction for each month, using the same day of month
        const transactionsToCreate = [];
        for (const monthDate of monthlyDates) {
          // Use the same day of month, but handle months with fewer days (e.g., Jan 31 -> Feb 28)
          const transactionDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOfMonth);

          // Only add if the date is within the end date range
          if (transactionDate <= endDate && transactionDate >= startDate) {
            transactionsToCreate.push({
              ...cleanData,
              date: formatDate(transactionDate, 'yyyy-MM-dd'),
              isRecurring: true,
              recurringFrequency: 'monthly',
              recurringStartDate: cleanData.recurringStartDate,
              recurringEndDate: cleanData.recurringEndDate,
            });
          }
        }

        // Create all transactions sequentially without triggering individual success messages
        setIsCreatingRecurring(true);
        try {
          // Create all transactions using mutation (but success message is suppressed)
          for (const transaction of transactionsToCreate) {
            await createTransactionMutation.mutateAsync(transaction);
          }

          // Show single success message with count and refresh
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          setAddDialogOpen(false);
          setEditingTransaction(null);
          setIsCreatingRecurring(false);
          const translationKey = t('recurringTransactionsCreated');
          const successMessage = translationKey !== 'recurringTransactionsCreated'
            ? translationKey.replace('{count}', transactionsToCreate.length)
            : `${transactionsToCreate.length} monthly recurring transactions created successfully`;
          toast.success(successMessage);
        } catch (error) {
          setIsCreatingRecurring(false);
          toast.error(t('failedToCreateRecurringTransactions') || 'Failed to create recurring transactions');
        }
      } else {
        // Single transaction - remove recurring fields if not recurring
        if (!cleanData.isRecurring) {
          delete cleanData.isRecurring;
          delete cleanData.recurringFrequency;
          delete cleanData.recurringStartDate;
          delete cleanData.recurringEndDate;
        }
        await createTransactionMutation.mutateAsync(cleanData);
      }
    }
    // Note: editingTransaction and dialog are cleared in mutation onSuccess callbacks
  }, [editingTransaction, updateTransactionMutation, createTransactionMutation, queryClient, setAddDialogOpen, setEditingTransaction, toast, t]);

  // Selected period transactions (filtered by selected months/year)
  const selectedPeriodTransactions = useMemo(() => {
    const selectedYearNum = parseInt(selectedYear);
    const hasSelectedMonths = selectedMonths && selectedMonths.length > 0;

    if (hasSelectedMonths) {
      // Filter by selected months/year
      const selectedMonthNums = selectedMonths.map(m => parseInt(m));
      return transactions.filter(t => {
        if (!t.date) return false;
        const d = parseISO(t.date);
        const transactionYear = getYear(d);
        const transactionMonth = getMonth(d) + 1; // getMonth returns 0-11, we need 1-12

        return transactionYear === selectedYearNum && selectedMonthNums.includes(transactionMonth);
      });
    } else {
      // Filter by year only (all months) when no months are selected
      return transactions.filter(t => {
        if (!t.date) return false;
        const d = parseISO(t.date);
        const transactionYear = getYear(d);
        return transactionYear === selectedYearNum;
      });
    }
  }, [transactions, selectedYear, selectedMonths]);

  // Get selected period label
  const selectedPeriodLabel = useMemo(() => {
    const hasSelectedMonths = selectedMonths && selectedMonths.length > 0;

    if (hasSelectedMonths) {
      const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];
      if (selectedMonths.length === 1) {
        const monthKey = monthKeys[parseInt(selectedMonths[0]) - 1] || '';
        return `${t(monthKey)} ${selectedYear}`;
      } else {
        return `${selectedMonths.length} ${t('months') || 'months'} ${selectedYear}`;
      }
    } else {
      return `${selectedYear} (${t('all') || 'All'})`;
    }
  }, [selectedYear, selectedMonths, t]);

  const pullY = useMotionValue(0);
  const pullRotate = useTransform(pullY, [0, 72], [0, 270]);
  const pullOpacity = useTransform(pullY, [0, 24, 72], [0, 0.6, 1]);
  const pullIndicatorY = useTransform(pullY, (v) => v - 40);
  const pullStart = useRef(null);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e) => {
    if (window.scrollY <= 0 && !refreshing) pullStart.current = e.touches[0].clientY;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (pullStart.current === null) return;
    const dy = e.touches[0].clientY - pullStart.current;
    if (dy > 0 && window.scrollY <= 0) pullY.set(Math.min(dy * 0.5, 96));
    else pullStart.current = null;
  }, [pullY]);

  const onTouchEnd = useCallback(async () => {
    if (pullStart.current === null) return;
    pullStart.current = null;
    if (pullY.get() >= 72) {
      setRefreshing(true);
      if (navigator.vibrate) navigator.vibrate(10);
      animate(pullY, 56, { duration: 0.2 });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setRefreshing(false);
    }
    animate(pullY, 0, { type: 'spring', stiffness: 400, damping: 36 });
  }, [pullY, queryClient]);

  // Loading state - after all hooks
  if (!user) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col md:min-h-dvh p-2 pb-24 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.16),transparent_70%)]" />
      <div className="max-w-7xl mx-auto flex flex-col md:block w-full">
        <header className="mb-2 flex flex-shrink-0 items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className={cn("text-3xl font-bold tracking-tight md:text-4xl", colors.textPrimary)}>{t('expenses')}</h1>
            <p className={cn("mt-1 hidden text-base sm:block", colors.textTertiary)}>{t('trackYourIncomeExpenses')}</p>
          </div>
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button onClick={() => setCategoryDialogOpen(true)} variant="ghost" aria-label={t('categories')} className="h-11 w-11 rounded-full p-0 text-muted-foreground hover:bg-foreground/10 md:w-auto md:px-4">
                <Tag className="h-5 w-5 md:me-2" />
                <span className="hidden md:inline">{t('categories')}</span>
              </Button>
            )}
            {canViewBudgets && (
              <Button onClick={() => setBudgetDialogOpen(true)} variant="ghost" aria-label={t('budgets')} className="h-11 w-11 rounded-full p-0 text-muted-foreground hover:bg-foreground/10 md:w-auto md:px-4">
                <Target className="h-5 w-5 md:me-2" />
                <span className="hidden md:inline">{t('budgets')}</span>
              </Button>
            )}
            {canEdit && (
              <Button
                onClick={() => { setEditingTransaction(null); setAddDialogOpen(true); }}
                className="hidden h-10 rounded-full bg-primary px-5 text-base text-primary-foreground hover:bg-primary/85 sm:inline-flex"
              >
                <Plus className="me-2 h-5 w-5" />
                {t('addTransaction')}
              </Button>
            )}
          </div>
        </header>

        <div className="flex-shrink-0">
          <PeriodSelector
            transactions={transactions}
            selectedYear={selectedYear}
            selectedMonths={selectedMonths}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonths}
          />
        </div>

        <div className="relative mt-3 sm:mt-5">
          <motion.div
            aria-hidden={!refreshing}
            style={{ opacity: refreshing ? 1 : pullOpacity, y: pullIndicatorY }}
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center md:hidden"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-popover text-primary shadow-lg">
              <motion.span style={{ rotate: refreshing ? undefined : pullRotate }} className={cn(refreshing && "animate-spin")}>
                <RefreshCw className="h-4 w-4" />
              </motion.span>
            </span>
          </motion.div>
          <motion.div
            style={{ y: pullY }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="touch-pan-y"
          >
            <ExpenseMonthView
              transactions={selectedPeriodTransactions}
              budgets={budgets}
              cards={cards}
              categories={categories}
              onEdit={handleEditTransaction}
              onDelete={handleDeleteTransaction}
              onDuplicate={handleDuplicateTransaction}
              onConfirm={confirmTransactionMutation.mutate}
              isLoading={isLoading}
              monthLabel={selectedPeriodLabel}
              selectedYear={selectedYear}
              selectedMonths={selectedMonths}
              canEdit={canEdit}
            />
          </motion.div>
        </div>

        {/* Thumb-reach quick add (phones) */}
        {canEdit && (
          <Button
            onClick={() => { setEditingTransaction(null); setAddDialogOpen(true); }}
            aria-label={t('addTransaction')}
            className="fixed end-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full p-0 shadow-[0_10px_30px_-8px_hsl(var(--glow)/0.7)] transition-transform active:scale-90 sm:hidden"
          >
            <Plus className="!size-6" />
          </Button>
        )}

        {/* Add/Edit Transaction Dialog */}
        <AddTransactionDialog
          open={addDialogOpen}
          onClose={() => {
            setAddDialogOpen(false);
            setEditingTransaction(null);
          }}
          onSubmit={handleAddTransaction}
          isLoading={createTransactionMutation.isPending || updateTransactionMutation.isPending}
          accounts={accounts}
          categories={categories}
          editTransaction={editingTransaction}
        />

        {/* Budget Manager Dialog */}
        <BudgetManager
          open={budgetDialogOpen}
          onClose={() => setBudgetDialogOpen(false)}
          budgets={budgets}
          categories={categories}
          onAdd={createBudgetMutation.mutate}
          onUpdate={(id, data) => updateBudgetMutation.mutate({ id, data })}
          onDelete={deleteBudgetMutation.mutate}
          isLoading={createBudgetMutation.isPending || updateBudgetMutation.isPending || deleteBudgetMutation.isPending}
          selectedYear={selectedYear}
          selectedMonths={selectedMonths}
          canEdit={canEditBudgets}
        />

        {/* Category Manager Dialog */}
        <CategoryManager
          open={categoryDialogOpen}
          onClose={() => setCategoryDialogOpen(false)}
          categories={categories}
          onAdd={createCategoryMutation.mutate}
          onDelete={deleteCategoryMutation.mutate}
          isLoading={createCategoryMutation.isPending || deleteCategoryMutation.isPending}
          canEdit={canEdit}
        />

        {/* Delete Transaction Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className={cn(colors.cardBg, colors.cardBorder)}>
            <AlertDialogHeader>
              <AlertDialogTitle className={cn(colors.textPrimary)}>
                {t('deleteTransaction')}
              </AlertDialogTitle>
              <AlertDialogDescription className={colors.textTertiary}>
                {t('deleteTransactionConfirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setTransactionToDelete(null);
                }}
                className={cn(colors.border, colors.textSecondary)}
              >
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteTransaction}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default memo(Expenses);
