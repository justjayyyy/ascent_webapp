import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Target, Tag, RefreshCw } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { parseISO, getYear, getMonth } from 'date-fns';
import AddTransactionDialog from './AddTransactionDialog';
import BudgetManager from './BudgetManager';
import CategoryManager from './CategoryManager';
import ExpenseMonthView from './ExpenseMonthView';
import PeriodSelector from './PeriodSelector';
import { useSaveTransaction, useDeleteTransactions } from './useTransactionMutations';
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

  const userId = useMemo(() => user?.id || user?._id, [user?.id, user?._id]);
  const userEmail = useMemo(() => user?.email, [user?.email]);

  const { data: allTransactions = [], isLoading } = useQuery({
    queryKey: ['transactions', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.ExpenseTransaction.list('-date', 1000);
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
    // Payments can arrive from the phone at any time (Apple Pay taps): refresh on return to the app and while it is open
    refetchOnWindowFocus: 'always',
    refetchInterval: 30 * 1000,
  });

  const transactions = useMemo(() => allTransactions.filter((x) => x.type === kind), [allTransactions, kind]);

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', userId],
    queryFn: async () => (userEmail ? ascent.entities.Card.list() : []),
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', userId],
    queryFn: async () => (userEmail ? ascent.entities.Account.list() : []),
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', userId],
    queryFn: async () => (userEmail ? ascent.entities.Budget.list('-created_date') : []),
    enabled: !!userEmail && !isIncome,
    staleTime: 3 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', userId],
    // list() triggers default category creation on first access
    queryFn: async () => (userEmail ? ascent.entities.Category.list('-created_date') : []),
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', userId],
    queryFn: async () => (userEmail ? ascent.entities.Plan.list('startDate') : []),
    enabled: !!userEmail && !isIncome,
    staleTime: 3 * 60 * 1000,
  });

  const kindCategories = useMemo(
    () => categories.filter((c) => c.type === kind || c.type === 'Both' || !c.type),
    [categories, kind]
  );

  const confirmTransactionMutation = useMutation({
    mutationFn: (tx) => ascent.entities.ExpenseTransaction.update(tx.id, { status: 'confirmed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('transactionConfirmed'));
    },
    onError: () => toast.error(t('failedToConfirm')),
  });

  const createBudgetMutation = useMutation({
    mutationFn: (budgetData) => ascent.entities.Budget.create(budgetData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['budgets'] }); toast.success(t('budgetCreatedSuccessfully')); },
    onError: () => toast.error(t('failedToCreateBudget')),
  });

  const updateBudgetMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Budget.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['budgets'] }); toast.success(t('budgetUpdatedSuccessfully')); },
    onError: () => toast.error(t('failedToUpdateBudget')),
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId) => ascent.entities.Budget.delete(budgetId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['budgets'] }); toast.success(t('budgetDeletedSuccessfully')); },
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

  const handleEditTransaction = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setAddDialogOpen(true);
  }, []);

  const handleDeleteTransaction = useCallback((id) => {
    const tx = allTransactions.find((x) => x.id === id);
    if (tx) setToDelete(tx);
  }, [allTransactions]);

  const siblings = useMemo(() => {
    if (!toDelete?.installmentGroupId) return [];
    return allTransactions.filter((x) => x.installmentGroupId === toDelete.installmentGroupId);
  }, [toDelete, allTransactions]);

  const handleDuplicateTransaction = useCallback((transaction) => {
    // A copy dated today; ids, timestamps and installment bookkeeping stay with the original
    const {
      id, _id, created_date, updated_date, created_by,
      installmentGroupId, installmentIndex, installmentCount, installmentTotal, planItemId,
      ...fields
    } = transaction;
    setEditingTransaction({ ...fields, date: new Date().toISOString().split('T')[0], id: undefined, _id: undefined });
    setAddDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async (data) => {
    const ok = await save(data, editingTransaction);
    if (ok) {
      setAddDialogOpen(false);
      setEditingTransaction(null);
    }
  }, [save, editingTransaction]);

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

  if (!user) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  const addLabel = isIncome ? t('addIncome') : t('addExpense');

  return (
    <div className="relative flex flex-col md:min-h-dvh p-2 pb-24 sm:p-4 sm:pb-24 md:p-8">
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
              <Button onClick={openNew} className="hidden h-10 rounded-full bg-primary px-5 text-base text-primary-foreground hover:bg-primary/85 sm:inline-flex">
                <Plus className="me-2 h-5 w-5" />
                {addLabel}
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
              kind={kind}
              transactions={selectedPeriodTransactions}
              allTransactions={transactions}
              counterpart={counterpartTotal}
              budgets={budgets}
              cards={cards}
              categories={kindCategories}
              plans={plans}
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
            onClick={openNew}
            aria-label={addLabel}
            className={cn(
              "fixed end-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full p-0 transition-transform active:scale-90 sm:hidden",
              isIncome ? "bg-success text-background hover:bg-success/90 shadow-[0_10px_30px_-8px_hsl(var(--success)/0.6)]" : "shadow-[0_10px_30px_-8px_hsl(var(--glow)/0.7)]"
            )}
          >
            <Plus className="!size-6" />
          </Button>
        )}

        <AddTransactionDialog
          open={addDialogOpen}
          onClose={() => { setAddDialogOpen(false); setEditingTransaction(null); }}
          onSubmit={handleSubmit}
          isLoading={saving}
          accounts={accounts}
          categories={categories}
          editTransaction={editingTransaction}
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
                {siblings.length > 1 ? t('deleteInstallmentConfirm').replace('{count}', siblings.length) : t('deleteTransactionConfirmation')}
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
