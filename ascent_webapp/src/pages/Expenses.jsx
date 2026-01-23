import React, { useState, useMemo, useCallback } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Target, Tag } from 'lucide-react';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import AddTransactionDialog from '../components/expenses/AddTransactionDialog';
import BudgetManager from '../components/expenses/BudgetManager';
import CategoryManager from '../components/expenses/CategoryManager';
import ExpenseMonthView from '../components/expenses/ExpenseMonthView';
import PeriodSelector from '../components/expenses/PeriodSelector';
import { useTheme } from '../components/ThemeProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Expenses() {
  const { user, colors, t } = useTheme();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.ExpenseTransaction.filter({ created_by: user.email }, '-date', 1000);
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000, // 3 minutes
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Card.filter({ created_by: user.email });
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Account.filter({ created_by: user.email });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Budget.filter({ created_by: user.email }, '-created_date');
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Use list() which triggers default category creation on first access
      return await ascent.entities.Category.list('-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const createTransactionMutation = useMutation({
    mutationFn: (transactionData) => ascent.entities.ExpenseTransaction.create(transactionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setAddDialogOpen(false);
      setEditingTransaction(null);
      toast.success(t('transactionAddedSuccessfully'));
    },
    onError: () => {
      toast.error(t('failedToAddTransaction'));
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
    deleteTransactionMutation.mutate(id);
  }, [deleteTransactionMutation]);

  const handleDuplicateTransaction = useCallback((transaction) => {
    // Create a duplicate with today's date
    const duplicatedTransaction = {
      ...transaction,
      date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      id: undefined, // Remove ID so it creates a new transaction
    };
    setEditingTransaction(duplicatedTransaction);
    setAddDialogOpen(true);
  }, []);

  const handleAddTransaction = useCallback(async (transactionData) => {
    if (editingTransaction && editingTransaction.id) {
      // Editing existing transaction
      await updateTransactionMutation.mutateAsync({ id: editingTransaction.id, data: transactionData });
    } else {
      // Creating new transaction (either new or duplicate)
      await createTransactionMutation.mutateAsync(transactionData);
    }
  }, [editingTransaction, updateTransactionMutation, createTransactionMutation]);

  // Selected period transactions (unfiltered - filtering done in ExpenseMonthView)
  const selectedPeriodTransactions = useMemo(() => {
    const start = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
    const end = endOfMonth(start);
    return transactions.filter(t => {
      const d = parseISO(t.date);
      return d >= start && d <= end;
    });
  }, [transactions, selectedYear, selectedMonth]);

  // Get selected period label
  const selectedPeriodLabel = useMemo(() => {
    const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthKey = monthKeys[parseInt(selectedMonth) - 1] || '';
    return `${t(monthKey)} ${selectedYear}`;
  }, [selectedYear, selectedMonth, t]);

  // Loading state - after all hooks
  if (!user) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8", colors.bgPrimary)}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={cn("text-3xl md:text-4xl font-bold mb-2", colors.textPrimary)}>{t('expenses')}</h1>
              <p className={colors.textTertiary}>{t('trackYourIncomeExpenses')}</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setCategoryDialogOpen(true)}
                variant="outline"
                className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                <Tag className="w-5 h-5 mr-2" />
                <span className="hidden md:inline">Categories</span>
              </Button>
              <Button 
                onClick={() => setBudgetDialogOpen(true)}
                variant="outline"
                className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                <Target className="w-5 h-5 mr-2" />
                <span className="hidden md:inline">Budgets</span>
              </Button>
              <Button 
                onClick={() => {
                  setEditingTransaction(null);
                  setAddDialogOpen(true);
                }}
                className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
              >
                <Plus className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">{t('addTransaction')}</span>
                <span className="sm:hidden">{t('add')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Period Selector */}
        <PeriodSelector
          transactions={transactions}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />

        {/* Period View with integrated filters */}
        <div className="mt-6">
          <ExpenseMonthView
            transactions={selectedPeriodTransactions}
            budgets={budgets}
            cards={cards}
            categories={categories}
            onEdit={handleEditTransaction}
            onDelete={handleDeleteTransaction}
            onDuplicate={handleDuplicateTransaction}
            isLoading={isLoading}
            monthLabel={selectedPeriodLabel}
          />
        </div>

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
        />

        {/* Category Manager Dialog */}
        <CategoryManager
          open={categoryDialogOpen}
          onClose={() => setCategoryDialogOpen(false)}
          categories={categories}
          onAdd={createCategoryMutation.mutate}
          onDelete={deleteCategoryMutation.mutate}
          isLoading={createCategoryMutation.isPending || deleteCategoryMutation.isPending}
        />
      </div>
    </div>
  );
}
