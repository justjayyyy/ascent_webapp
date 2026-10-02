import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ascent } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgets, useCards, useCategories, usePlans } from '@/hooks/useWorkspaceData';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Target, Tag } from 'lucide-react';
import { parseISO, getYear, getMonth } from 'date-fns';
import { useTransactions, useLinkedTransactions, useOldestTransactionDate, mergeRows } from '@/lib/offline/txOutbox';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import AddTransactionDialog from './AddTransactionDialog';
import BudgetManager from './BudgetManager';
import CategoryManager from './CategoryManager';
import ExpenseMonthView from './ExpenseMonthView';
import PeriodSelector from './PeriodSelector';
import { useSaveTransaction, useDeleteTransactions, useConfirmTransaction } from './useTransactionMutations';
import { seriesOf } from './transactionRows';
import { useListWrites } from '@/lib/offline/listWrites';
import { useTheme } from '../ThemeProvider';
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
import { localDay } from '@/lib/localDay';

const MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * The Expenses and Income pages: the same period picker, list and editing flows, showing only
 * transactions of one kind. `kind` is 'Expense' or 'Income'.
 */
function TransactionsPage({ kind }) {
  const isIncome = kind === 'Income';
  const { user, colors, t } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('editExpenses');
  const canEditBudgets = hasPermission('editBudgets');
  const canViewBudgets = hasPermission('viewBudgets') && !isIncome;
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState([(new Date().getMonth() + 1).toString()]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const queryClient = useQueryClient();
  const { save, saving } = useSaveTransaction();
  const deleteTransactions = useDeleteTransactions();


  // The selected year (and the usual recent history); every part of big purchases, whenever it falls
  const { data: allTransactions = [], isLoading } = useTransactions({ from: `${selectedYear}-01-01` });
  const { data: installments = [] } = useLinkedTransactions('installmentGroupId', { enabled: !isIncome });
  // Every row of monthly recurring runs, so a run can be edited or deleted as a whole
  const { data: recurringRows = [] } = useLinkedTransactions('recurringStartDate');
  const oldestDate = useOldestTransactionDate();

  const transactions = useMemo(() => allTransactions.filter((x) => x.type === kind), [allTransactions, kind]);
  const bigPurchaseRows = useMemo(() => mergeRows(installments, transactions), [installments, transactions]);

  const { data: cards = [] } = useCards();
  const { data: budgets = [] } = useBudgets({ enabled: canViewBudgets });
  const { data: categories = [] } = useCategories(); // the first load seeds the default categories
  const { data: plans = [] } = usePlans({ enabled: !isIncome });

  const kindCategories = useMemo(
    () => categories.filter((c) => c.type === kind || c.type === 'Both' || !c.type),
    [categories, kind]
  );

  const confirmTransaction = useConfirmTransaction();

  // Budgets save through the offline queue: they show at once and wait on the device without signal
  const budgetsApi = useListWrites('budgets');
  const budgetSaved = (doneKey) => (outcome) => {
    if (outcome === 'queued') toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
    else toast.success(t(doneKey));
  };
  const createBudgetMutation = useMutation({
    mutationFn: async (budgetData) => (await budgetsApi.create(budgetData)).outcome,
    onSuccess: budgetSaved('budgetCreatedSuccessfully'),
    onError: () => toast.error(t('failedToCreateBudget')),
  });

  const updateBudgetMutation = useMutation({
    mutationFn: ({ id, data }) => budgetsApi.update(id, data),
    onSuccess: budgetSaved('budgetUpdatedSuccessfully'),
    onError: () => toast.error(t('failedToUpdateBudget')),
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId) => budgetsApi.remove(budgetId),
    onSuccess: budgetSaved('budgetDeletedSuccessfully'),
    onError: () => toast.error(t('failedToDeleteBudget')),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (categoryData) => ascent.entities.Category.create(categoryData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); toast.success(t('categoryCreatedSuccessfully')); },
    onError: () => toast.error(t('failedToCreateCategory')),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId) => { await ascent.entities.Category.delete(categoryId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); toast.success(t('categoryDeletedSuccessfully')); },
    onError: () => toast.error(t('failedToDeleteCategory')),
  });

  const openNew = useCallback(() => { setEditingTransaction(null); setAddDialogOpen(true); }, []);
  // The dock's + adds to this page (an expense here, income on the Income page)
  usePageCreateAction(canEdit ? openNew : null);
  // Install shortcut / deep link: /Expenses?new=1
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    openNew();
    params.delete('new');
    setParams(params, { replace: true });
  }, [params, setParams, openNew, canEdit]);

  const handleEditTransaction = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setAddDialogOpen(true);
  }, []);

  const handleDeleteTransaction = useCallback((id) => {
    const tx = allTransactions.find((x) => x.id === id);
    if (tx) setToDelete(tx);
  }, [allTransactions]);

  const siblings = useMemo(() => {
    if (!toDelete) return [];
    if (toDelete.installmentGroupId) {
      return mergeRows(installments, allTransactions).filter((x) => x.installmentGroupId === toDelete.installmentGroupId);
    }
    return seriesOf(toDelete, mergeRows(recurringRows, allTransactions));
  }, [toDelete, allTransactions, installments, recurringRows]);

  const editSeries = useMemo(
    () => (editingTransaction?.id ? seriesOf(editingTransaction, mergeRows(recurringRows, allTransactions)) : []),
    [editingTransaction, allTransactions, recurringRows]
  );

  const handleDuplicateTransaction = useCallback((transaction) => {
    // A copy dated today; ids, timestamps and installment bookkeeping stay with the original
    const {
      id, _id, created_date, updated_date, created_by,
      installmentGroupId, installmentIndex, installmentCount, installmentTotal, planItemId, recurringGroupId,
      ...fields
    } = transaction;
    setEditingTransaction({ ...fields, date: localDay(), id: undefined, _id: undefined });
    setAddDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async (data, { wholeSeries = false } = {}) => {
    const ok = await save(data, editingTransaction, wholeSeries && editSeries.length > 1 ? editSeries : null);
    if (ok) {
      setAddDialogOpen(false);
      setEditingTransaction(null);
    }
  }, [save, editingTransaction, editSeries]);

  const inPeriod = useCallback((x) => {
    if (!x.date) return false;
    const d = parseISO(x.date);
    if (getYear(d) !== parseInt(selectedYear, 10)) return false;
    return !selectedMonths.length || selectedMonths.map(Number).includes(getMonth(d) + 1);
  }, [selectedYear, selectedMonths]);

  const selectedPeriodTransactions = useMemo(() => transactions.filter(inPeriod), [transactions, inPeriod]);
  // Income for the same period, so the Expenses page can say how much of it was spent (and vice versa)
  const counterpartTotal = useMemo(
    () => allTransactions.filter((x) => x.type !== kind && inPeriod(x)),
    [allTransactions, kind, inPeriod]
  );

  const selectedPeriodLabel = useMemo(() => {
    if (selectedMonths.length === 1) return `${t(MONTH_KEYS[parseInt(selectedMonths[0], 10) - 1] || '')} ${selectedYear}`;
    if (selectedMonths.length > 1) return `${selectedMonths.length} ${t('months')} ${selectedYear}`;
    return `${selectedYear} (${t('all')})`;
  }, [selectedYear, selectedMonths, t]);

  if (!user) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  const addLabel = isIncome ? t('addIncome') : t('addExpense');

  return (
    <div className="relative flex flex-col md:min-h-dvh p-2 pb-6 sm:p-4 sm:pb-8 md:p-8">
      <div aria-hidden className={cn(
        "pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px]",
        isIncome
          ? "bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--success)/0.12),transparent_70%)]"
          : "bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.16),transparent_70%)]"
      )} />
      <div className="max-w-7xl mx-auto flex flex-col md:block w-full">
        <header className="mb-2 flex flex-shrink-0 items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className={cn("text-3xl font-bold tracking-tight md:text-4xl", colors.textPrimary)}>{isIncome ? t('income') : t('expenses')}</h1>
            <p className={cn("mt-1 hidden text-base sm:block", colors.textTertiary)}>{isIncome ? t('incomePageSubtitle') : t('expensesPageSubtitle')}</p>
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
              <Button onClick={openNew} aria-label={addLabel} className="h-11 w-11 rounded-full bg-primary p-0 text-base text-primary-foreground hover:bg-primary/85 sm:h-10 sm:w-auto sm:px-5">
                <Plus className="h-5 w-5 sm:me-2" />
                <span className="hidden sm:inline">{addLabel}</span>
              </Button>
            )}
          </div>
        </header>

        <div className="flex-shrink-0">
          <PeriodSelector
            transactions={transactions}
            oldestDate={oldestDate}
            selectedYear={selectedYear}
            selectedMonths={selectedMonths}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonths}
          />
        </div>

        <div className="relative mt-3 sm:mt-5">
            <ExpenseMonthView
              kind={kind}
              transactions={selectedPeriodTransactions}
              allTransactions={bigPurchaseRows}
              counterpart={counterpartTotal}
              budgets={budgets}
              cards={cards}
              categories={kindCategories}
              plans={plans}
              onEdit={handleEditTransaction}
              onDelete={handleDeleteTransaction}
              onDuplicate={handleDuplicateTransaction}
              onConfirm={confirmTransaction}
              isLoading={isLoading}
              monthLabel={selectedPeriodLabel}
              selectedYear={selectedYear}
              selectedMonths={selectedMonths}
              canEdit={canEdit}
            />
        </div>

        <AddTransactionDialog
          open={addDialogOpen}
          onClose={() => { setAddDialogOpen(false); setEditingTransaction(null); }}
          onSubmit={handleSubmit}
          isLoading={saving}
          categories={categories}
          editTransaction={editingTransaction}
          seriesCount={editSeries.length}
          defaultType={kind}
          plans={plans}
        />

        {!isIncome && (
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
        )}

        <CategoryManager
          open={categoryDialogOpen}
          onClose={() => setCategoryDialogOpen(false)}
          categories={categories}
          onAdd={createCategoryMutation.mutate}
          onDelete={deleteCategoryMutation.mutate}
          isLoading={createCategoryMutation.isPending || deleteCategoryMutation.isPending}
          canEdit={canEdit}
        />

        <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
          <AlertDialogContent className={cn(colors.cardBg, colors.cardBorder)}>
            <AlertDialogHeader>
              <AlertDialogTitle className={cn(colors.textPrimary)}>{t('deleteTransaction')}</AlertDialogTitle>
              <AlertDialogDescription className={colors.textTertiary}>
                {siblings.length > 1
                  ? t(toDelete?.installmentGroupId ? 'deleteInstallmentConfirm' : 'deleteRecurringConfirm').replace('{count}', siblings.length)
                  : t('deleteTransactionConfirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className={cn(colors.border, colors.textSecondary)}>{t('cancel')}</AlertDialogCancel>
              {siblings.length > 1 && (
                <AlertDialogAction
                  onClick={() => { deleteTransactions(siblings); setToDelete(null); }}
                  className="bg-destructive/15 text-destructive hover:bg-destructive/25"
                >
                  {t('deleteAllPayments').replace('{count}', siblings.length)}
                </AlertDialogAction>
              )}
              <AlertDialogAction
                onClick={() => { deleteTransactions([toDelete]); setToDelete(null); }}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {siblings.length > 1 ? t('deleteThisPayment') : t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default memo(TransactionsPage);
