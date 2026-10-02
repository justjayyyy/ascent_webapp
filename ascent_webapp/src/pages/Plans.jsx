import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, LayoutGroup, motion } from '@/lib/motion';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { restoreEntry } from '@/lib/listEntries';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useCategories, useMoney, usePlans, workspaceKey } from '@/hooks/useWorkspaceData';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { useLinkedTransactions, useRealId } from '@/lib/offline/txOutbox';
import { useListWrites } from '@/lib/offline/listWrites';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import PlanDialog from '@/components/plans/PlanDialog';
import PlanItemDialog from '@/components/plans/PlanItemDialog';
import PlanDetail from '@/components/plans/PlanDetail';
import { PlanCard, localeOf } from '@/components/plans/PlanParts';
import { PLAN_KINDS, planTimeline, planTotals } from '@/components/plans/planUtils';

function Plans() {
  const { user, t, language } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('editExpenses');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const openId = params.get('plan');
  const loc = localeOf(language);
  const blur = !!user?.blurValues;
  const userCurrency = user?.currency || 'ILS';
  const { amountIn } = useMoney(userCurrency);
  const { save, saving: savingTx } = useSaveTransaction();

  const [planDialog, setPlanDialog] = useState(null); // { plan?, kind? }
  const [itemDialog, setItemDialog] = useState(null); // { item? }
  const [payTx, setPayTx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const workspaceId = useWorkspaceId();
  const plansKey = useMemo(() => workspaceKey('plans', workspaceId), [workspaceId]);
  const { data: plans = [], isLoading } = usePlans();
  // Every expense recorded for a plan, whenever it was paid, with changes waiting on this device drawn in
  const { data: transactions = [] } = useLinkedTransactions('planId');
  const { data: categories = [] } = useCategories();

  const linkedByPlan = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
      if (tx.planId && tx.type === 'Expense') (map[tx.planId] ||= []).push(tx);
    });
    return map;
  }, [transactions]);

  // Spending counts in the plan's own currency (as recorded until a rate is available)
  const toPlanCurrency = useCallback((currency) => (tx) => amountIn(tx, currency) ?? (tx.amount || 0), [amountIn]);

  const totalsById = useMemo(() => Object.fromEntries(plans.map((p) => [
    p.id, planTotals(p, linkedByPlan[p.id] || [], toPlanCurrency(p.currency)),
  ])), [plans, linkedByPlan, toPlanCurrency]);

  const { upcoming, past } = useMemo(() => {
    const byDate = (a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999');
    return {
      upcoming: plans.filter((p) => p.status !== 'done' && p.status !== 'archived').sort(byDate),
      past: plans.filter((p) => p.status === 'done' || p.status === 'archived').sort((a, b) => byDate(b, a)),
    };
  }, [plans]);

  // A plan made offline keeps its place on screen when the server gives it its real id
  const realOpenId = useRealId(openId);
  useEffect(() => {
    if (!openId || realOpenId === openId) return;
    const next = new URLSearchParams(params);
    next.set('plan', realOpenId);
    setParams(next, { replace: true });
  }, [openId, realOpenId, params, setParams]);
  const plan = realOpenId ? plans.find((p) => p.id === realOpenId) : null;

  // The dock's +: a new plan from the list, a new cost inside an open plan
  const createHere = useCallback(() => (plan ? setItemDialog({}) : setPlanDialog({})), [plan]);
  usePageCreateAction(canEdit ? createHere : null);
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    setPlanDialog({});
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams, canEdit]);

  // The plan was deleted (here or by someone else) while open
  useEffect(() => {
    if (!openId || isLoading || plan || savingPlan || queryClient.isFetching({ queryKey: plansKey }) > 0) return;
    const next = new URLSearchParams(params);
    next.delete('plan');
    setParams(next, { replace: true });
  }, [openId, plan, isLoading, savingPlan, params, setParams, queryClient, plansKey]);

  const openPlan = useCallback((id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('plan', id); else next.delete('plan');
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [params, setParams]);

  // ---- writes: through the offline queue, so they show at once and wait on the device without signal ----
  const plansApi = useListWrites('plans');
  // Small edits say nothing when they wait (the sync pill shows them); saving a whole plan says where it went
  const announce = useCallback((outcome, doneKey) => {
    if (outcome === 'queued') toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
    else if (doneKey) toast.success(t(doneKey));
  }, [t]);

  const updatePlan = useCallback(async (id, changes) => {
    try {
      return await plansApi.update(id, changes);
    } catch {
      toast.error(t('failedToSavePlan'));
      return null;
    }
  }, [plansApi, t]);

  // Items change one at a time on the server, so two people editing the same plan keep both changes
  const changeItem = useCallback(async (id, change) => {
    try {
      await plansApi.changeEntry(id, 'items', change);
    } catch {
      toast.error(t('failedToSavePlan'));
    }
  }, [plansApi, t]);

  const savePlan = useCallback(async (data) => {
    setSavingPlan(true);
    try {
      if (planDialog?.plan) {
        const outcome = await plansApi.update(planDialog.plan.id, data);
        announce(outcome, 'planSaved');
      } else {
        const { id, outcome } = await plansApi.create(data);
        announce(outcome, 'planCreated');
        openPlan(id);
      }
      setPlanDialog(null);
    } catch {
      toast.error(t('failedToSavePlan'));
    } finally {
      setSavingPlan(false);
    }
  }, [planDialog, plansApi, announce, openPlan, t]);

  const deletePlan = useCallback(async () => {
    if (!plan) return;
    const id = plan.id;
    setConfirmDelete(false);
    openPlan(null);
    try {
      announce(await plansApi.remove(id), 'planDeleted');
    } catch {
      toast.error(t('failedToSavePlan'));
    }
  }, [plan, openPlan, plansApi, announce, t]);

  const saveItem = useCallback((item) => {
    if (!plan) return;
    changeItem(plan.id, { op: 'put', item });
    setItemDialog(null);
  }, [plan, changeItem]);

  const deleteItem = useCallback((item) => {
    if (!plan) return;
    const undo = restoreEntry(plan.items || [], item);
    changeItem(plan.id, { op: 'remove', id: item.id });
    setItemDialog(null);
    toast(t('planItemDeleted'), {
      action: { label: t('ntUndo'), onClick: () => changeItem(plan.id, undo) },
    });
  }, [plan, changeItem, t]);

  const toggleItem = useCallback((item) => {
    if (!plan) return;
    const status = item.status === 'booked' ? 'planned' : 'booked';
    if (navigator.vibrate) navigator.vibrate(8);
    changeItem(plan.id, { op: 'patch', id: item.id, changes: { status } });
  }, [plan, changeItem]);

  // Paying a cost records a real expense (it shows up in Expenses and budgets) and ticks the item off
  const payItem = useCallback((item) => {
    if (!plan) return;
    setPayTx({
      type: 'Expense',
      category: item.category || categories.find((c) => c.type === 'Expense')?.name || '',
      description: item.name || plan.name,
      amount: item.amount > 0 ? item.amount : '',
      currency: plan.currency || userCurrency,
      date: format(new Date(), 'yyyy-MM-dd'),
      paymentMethod: '',
      planId: plan.id,
      planItemId: item.id,
    });
  }, [plan, categories, userCurrency]);

  const onPaySubmit = useCallback(async (data) => {
    const ok = await save(data, null);
    if (ok) setPayTx(null);
  }, [save]);

  const renderGrid = (list) => (
    <LayoutGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {list.map((p) => (
            <PlanCard key={p.id} plan={p} totals={totalsById[p.id]} onOpen={openPlan} t={t} loc={loc} blur={blur} />
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col p-2 pb-28 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.14),transparent_70%)]" />

      <AnimatePresence mode="wait" initial={false}>
        {plan ? (
          <PlanDetail
            key={plan.id}
            plan={plan}
            totals={totalsById[plan.id]}
            timeline={planTimeline(plan, linkedByPlan[plan.id] || [], toPlanCurrency(plan.currency))}
            linked={linkedByPlan[plan.id] || []}
            categories={categories}
            canEdit={canEdit}
            t={t}
            loc={loc}
            language={language}
            blur={blur}
            onBack={() => openPlan(null)}
            onEdit={() => setPlanDialog({ plan })}
            onStatus={(status) => { updatePlan(plan.id, { status }); toast.success(t(status === 'done' ? 'planMarkedDone' : status === 'archived' ? 'planArchived' : 'planReopened')); }}
            onDelete={() => setConfirmDelete(true)}
            onItemEdit={(item) => setItemDialog({ item })}
            onItemAdd={() => setItemDialog({})}
            onItemToggle={toggleItem}
            onPay={payItem}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t('plans')}</h1>
                <p className="mt-1 hidden text-base text-muted-foreground sm:block">{t('plansSubtitle')}</p>
              </div>
              {canEdit && plans.length > 0 && (
                <Button onClick={() => setPlanDialog({})} aria-label={t('newPlan')} className="h-11 w-11 shrink-0 rounded-full p-0 text-base sm:h-10 sm:w-auto sm:px-5">
                  <Plus className="h-5 w-5 sm:me-2" /> <span className="hidden sm:inline">{t('newPlan')}</span>
                </Button>
              )}
            </header>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : plans.length === 0 ? (
              <section className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center sm:px-10 sm:py-12">
                <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">{t('plansEmptyTitle')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('plansEmptyHint')}</p>
                {canEdit && (
                  <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 sm:grid-cols-4">
                    {PLAN_KINDS.map(({ key, emoji }, i) => (
                      <motion.button
                        key={key}
                        type="button"
                        onClick={() => setPlanDialog({ kind: key })}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                        className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-background/60 px-2 py-3 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
                      >
                        <span aria-hidden className="text-2xl leading-none">{emoji}</span>
                        {t(`planKind_${key}`)}
                      </motion.button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <div className="space-y-6">
                {upcoming.length > 0 ? renderGrid(upcoming) : (
                  <p className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center text-sm text-muted-foreground">{t('plansNoneActive')}</p>
                )}
                {past.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setShowPast((v) => !v)}
                      aria-expanded={showPast}
                      className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", showPast && "rotate-180")} />
                      {t('pastPlans')} <span className="tabular-nums">{past.length}</span>
                    </button>
                    {showPast && renderGrid(past)}
                  </section>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <PlanDialog
        open={!!planDialog}
        onClose={() => setPlanDialog(null)}
        plan={planDialog?.plan || null}
        initialKind={planDialog?.kind}
        onSave={savePlan}
        saving={savingPlan}
      />

      <PlanItemDialog
        open={!!itemDialog}
        onClose={() => setItemDialog(null)}
        item={itemDialog?.item || null}
        currency={plan?.currency || userCurrency}
        categories={categories}
        onSave={saveItem}
        onDelete={deleteItem}
      />

      <AddTransactionDialog
        open={!!payTx}
        onClose={() => setPayTx(null)}
        onSubmit={onPaySubmit}
        isLoading={savingTx}
        categories={categories}
        editTransaction={payTx}
        defaultType="Expense"
        plans={plans}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deletePlan')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deletePlanConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={deletePlan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default memo(Plans);
