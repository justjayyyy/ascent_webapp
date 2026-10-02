import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, LayoutGroup, motion } from '@/lib/motion';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { restoreEntry } from '@/lib/listEntries';
import { haptic } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useGoals, useMoney, workspaceKey } from '@/hooks/useWorkspaceData';
import { useHousehold } from '@/hooks/useHousehold';
import { useRealId } from '@/lib/offline/txOutbox';
import { useListWrites } from '@/lib/offline/listWrites';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import BlurValue from '@/components/BlurValue';
import { localeOf, moneyIn } from '@/components/plans/PlanParts';
import GoalDialog from '@/components/savings/GoalDialog';
import EntryDialog from '@/components/savings/EntryDialog';
import GoalDetail from '@/components/savings/GoalDetail';
import { GoalCard } from '@/components/savings/SavingsParts';
import { SAVING_KINDS, goalEmoji, goalTotals, milestoneCrossed, savingsHistory } from '@/components/savings/savingsUtils';

const SERIES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

function Savings() {
  const { user, t, language } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('editGoals');
  const queryClient = useQueryClient();
  const household = useHousehold();
  const [params, setParams] = useSearchParams();
  const openId = params.get('goal');
  const loc = localeOf(language);
  const blur = !!user?.blurValues;
  const userCurrency = user?.currency || 'ILS';
  const { convert } = useMoney(userCurrency);

  const [goalDialog, setGoalDialog] = useState(null); // { goal?, kind? }
  const [entryDialog, setEntryDialog] = useState(null); // { entry?, mode }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const workspaceId = useWorkspaceId();
  const goalsKey = useMemo(() => workspaceKey('goals', workspaceId), [workspaceId]);
  const { data: goals = [], isLoading } = useGoals();

  const totalsById = useMemo(() => Object.fromEntries(goals.map((g) => [g.id, goalTotals(g)])), [goals]);

  const { active, past } = useMemo(() => {
    // Nearest date first, then goals without one, newest last
    const byDate = (a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
    return {
      active: goals.filter((g) => g.status !== 'done' && g.status !== 'archived').sort(byDate),
      past: goals.filter((g) => g.status === 'done' || g.status === 'archived').sort((a, b) => byDate(b, a)),
    };
  }, [goals]);

  // Everything put aside in active goals, in the viewer's currency (as recorded until a rate is available)
  const overview = useMemo(() => {
    const toMine = (amount, currency) => (currency === userCurrency ? amount : convert(amount, currency) ?? amount);
    const parts = active.map((g) => ({ goal: g, saved: Math.max(0, toMine(totalsById[g.id].saved, g.currency)) }));
    const total = parts.reduce((s, p) => s + p.saved, 0);
    const thisMonth = active.reduce((s, g) => s + toMine(totalsById[g.id].thisMonth, g.currency), 0);
    const target = active.reduce((s, g) => s + toMine(totalsById[g.id].target, g.currency), 0);
    return { parts: parts.filter((p) => p.saved > 0).sort((a, b) => b.saved - a.saved), total, thisMonth, target };
  }, [active, totalsById, convert, userCurrency]);

  // A goal made offline keeps its place on screen when the server gives it its real id
  const realOpenId = useRealId(openId);
  useEffect(() => {
    if (!openId || realOpenId === openId) return;
    const next = new URLSearchParams(params);
    next.set('goal', realOpenId);
    setParams(next, { replace: true });
  }, [openId, realOpenId, params, setParams]);
  const goal = realOpenId ? goals.find((g) => g.id === realOpenId) : null;
  const totals = goal ? totalsById[goal.id] : null;
  // A sheet belongs to the goal it was opened on (back, the browser's back button, or the goal deleted elsewhere)
  useEffect(() => { if (!goal) setEntryDialog(null); }, [goal]);
  const history = useMemo(() => (goal ? savingsHistory(goal) : []), [goal]);

  // The dock's +: a new goal from the list, money into the goal on screen
  const createHere = useCallback(() => (goal ? setEntryDialog({ mode: 'in' }) : setGoalDialog({})), [goal]);
  usePageCreateAction(canEdit ? createHere : null);
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    setGoalDialog({});
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams, canEdit]);

  // The goal was deleted (here or by someone else) while open
  useEffect(() => {
    if (!openId || isLoading || goal || savingGoal || queryClient.isFetching({ queryKey: goalsKey }) > 0) return;
    const next = new URLSearchParams(params);
    next.delete('goal');
    setParams(next, { replace: true });
  }, [openId, goal, isLoading, savingGoal, params, setParams, queryClient, goalsKey]);

  const openGoal = useCallback((id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('goal', id); else next.delete('goal');
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [params, setParams]);

  // ---- writes: through the offline queue, so they show at once and wait on the device without signal ----
  const goalsApi = useListWrites('goals');
  const announce = useCallback((outcome, doneKey) => {
    if (outcome === 'queued') toast(t('offSavedOnDevice'), { description: t('offSavedOnDeviceHint') });
    else if (doneKey) toast.success(t(doneKey));
  }, [t]);

  const updateGoal = useCallback(async (id, changes) => {
    try {
      return await goalsApi.update(id, changes);
    } catch {
      toast.error(t('svFailedToSave'));
      return null;
    }
  }, [goalsApi, t]);

  // Deposits change one at a time on the server, so two people adding money at once keep both
  const changeEntry = useCallback(async (id, change) => {
    try {
      await goalsApi.changeEntry(id, 'entries', change);
    } catch {
      toast.error(t('svFailedToSave'));
    }
  }, [goalsApi, t]);

  const saveGoal = useCallback(async (data) => {
    setSavingGoal(true);
    try {
      if (goalDialog?.goal) {
        announce(await goalsApi.update(goalDialog.goal.id, data), 'svGoalSaved');
      } else {
        const { id, outcome } = await goalsApi.create({ ...data, status: 'active' });
        announce(outcome, 'svGoalCreated');
        openGoal(id);
      }
      setGoalDialog(null);
    } catch {
      toast.error(t('svFailedToSave'));
    } finally {
      setSavingGoal(false);
    }
  }, [goalDialog, goalsApi, announce, openGoal, t]);

  const deleteGoal = useCallback(async () => {
    if (!goal) return;
    const id = goal.id;
    setConfirmDelete(false);
    openGoal(null);
    try {
      announce(await goalsApi.remove(id), 'svGoalDeleted');
    } catch {
      toast.error(t('svFailedToSave'));
    }
  }, [goal, openGoal, goalsApi, announce, t]);

  const setStatus = useCallback((status) => {
    if (!goal) return;
    updateGoal(goal.id, { status });
    toast.success(t(status === 'done' ? 'svMarkedDone' : status === 'archived' ? 'svArchived' : 'svReopened'));
  }, [goal, updateGoal, t]);

  const saveEntry = useCallback((entry) => {
    if (!goal || !totals) return;
    const previous = (goal.entries || []).find((e) => e.id === entry.id);
    const after = totals.saved - (previous?.amount || 0) + entry.amount;
    changeEntry(goal.id, { op: 'put', item: previous ? { ...entry, by: previous.by || '' } : { ...entry, by: user?.email || '' } });
    setEntryDialog(null);
    // A quarter, half, three quarters and the whole target get a word and a tap of feedback
    const milestone = milestoneCrossed(totals.saved, after, totals.target);
    if (milestone === 100 && goal.status === 'active') {
      haptic('success');
      toast.success(t('svMilestone_100'), {
        description: t('svMilestone_100Hint'),
        duration: 8000,
        action: { label: t('svMarkDone'), onClick: () => setStatus('done') },
      });
    } else if (milestone) {
      haptic('success');
      toast.success(t(`svMilestone_${milestone}`));
    } else {
      haptic('light');
    }
  }, [goal, totals, changeEntry, user?.email, t, setStatus]);

  const deleteEntry = useCallback((entry) => {
    if (!goal) return;
    const undo = restoreEntry(goal.entries || [], entry);
    changeEntry(goal.id, { op: 'remove', id: entry.id });
    setEntryDialog(null);
    toast(t('svEntryDeleted'), {
      action: { label: t('ntUndo'), onClick: () => changeEntry(goal.id, undo) },
    });
  }, [goal, changeEntry, t]);

  const renderGrid = (list) => (
    <LayoutGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} totals={totalsById[g.id]} onOpen={openGoal} t={t} loc={loc} blur={blur} />
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );

  const mine = moneyIn(loc, userCurrency);

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col p-2 pb-28 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.14),transparent_70%)]" />

      <AnimatePresence mode="wait" initial={false}>
        {goal ? (
          <GoalDetail
            key={goal.id}
            goal={goal}
            totals={totals}
            history={history}
            household={household}
            canEdit={canEdit}
            t={t}
            loc={loc}
            blur={blur}
            onBack={() => openGoal(null)}
            onEdit={() => setGoalDialog({ goal })}
            onStatus={setStatus}
            onDelete={() => setConfirmDelete(true)}
            onAdd={() => setEntryDialog({ mode: 'in' })}
            onTakeOut={() => setEntryDialog({ mode: 'out' })}
            onEntryEdit={(entry) => setEntryDialog({ entry })}
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
                <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t('svTitle')}</h1>
                <p className="mt-1 hidden text-base text-muted-foreground sm:block">{t('svSubtitle')}</p>
              </div>
              {canEdit && goals.length > 0 && (
                <Button onClick={() => setGoalDialog({})} aria-label={t('svNewGoal')} className="h-11 w-11 shrink-0 rounded-full p-0 text-base sm:h-10 sm:w-auto sm:px-5">
                  <Plus className="h-5 w-5 sm:me-2" /> <span className="hidden sm:inline">{t('svNewGoal')}</span>
                </Button>
              )}
            </header>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : goals.length === 0 ? (
              <section className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center sm:px-10 sm:py-12">
                <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">{t('svEmptyTitle')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('svEmptyHint')}</p>
                {canEdit && (
                  <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 sm:grid-cols-5">
                    {SAVING_KINDS.map(({ key, emoji }, i) => (
                      <motion.button
                        key={key}
                        type="button"
                        onClick={() => setGoalDialog({ kind: key })}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                        className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-background/60 px-2 py-3 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
                      >
                        <span aria-hidden className="text-2xl leading-none">{emoji}</span>
                        <span className="w-full truncate">{t(`svKindShort_${key}`)}</span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <div className="space-y-6">
                {active.length > 0 && (
                  <section className="rounded-3xl bg-gradient-to-b from-primary/[0.12] to-foreground/[0.03] p-5 sm:p-6" aria-label={t('svTotalSaved')}>
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('svTotalSaved')}</p>
                        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-foreground sm:text-5xl" dir="ltr">
                          <BlurValue blur={blur}>{mine(overview.total)}</BlurValue>
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground sm:text-end">
                        {overview.thisMonth !== 0 && (
                          <p className={cn('font-semibold tabular-nums', overview.thisMonth > 0 ? 'text-success' : 'text-danger')}>
                            {t('svThisMonthTotal', { amount: blur ? '••••' : `${overview.thisMonth > 0 ? '+' : ''}${mine(overview.thisMonth)}` })}
                          </p>
                        )}
                        {overview.target > 0 && (
                          <p className="tabular-nums">{t('svOfAllTargets', { amount: blur ? '••••' : mine(overview.target) })}</p>
                        )}
                      </div>
                    </div>
                    {overview.parts.length > 1 && (
                      <>
                        <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                          {overview.parts.map((p, i) => (
                            <motion.span
                              key={p.goal.id}
                              className={cn('h-full first:rounded-s-full last:rounded-e-full', SERIES[i % SERIES.length])}
                              initial={{ flexGrow: 0 }}
                              animate={{ flexGrow: p.saved }}
                              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                              style={{ flexBasis: 0 }}
                            />
                          ))}
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          {overview.parts.map((p, i) => (
                            <li key={p.goal.id} className="flex min-w-0 items-center gap-1.5">
                              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', SERIES[i % SERIES.length])} />
                              <span aria-hidden>{goalEmoji(p.goal)}</span>
                              <span className="max-w-[10rem] truncate">{p.goal.name}</span>
                              <span className="tabular-nums text-foreground/80">{Math.round((p.saved / (overview.total || 1)) * 100)}%</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                )}

                {active.length > 0 ? renderGrid(active) : (
                  <p className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center text-sm text-muted-foreground">{t('svNoneActive')}</p>
                )}
                {past.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setShowPast((v) => !v)}
                      aria-expanded={showPast}
                      className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', showPast && 'rotate-180')} />
                      {t('svPastGoals')} <span className="tabular-nums">{past.length}</span>
                    </button>
                    {showPast && renderGrid(past)}
                  </section>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <GoalDialog
        open={!!goalDialog}
        onClose={() => setGoalDialog(null)}
        goal={goalDialog?.goal || null}
        initialKind={goalDialog?.kind}
        onSave={saveGoal}
        saving={savingGoal}
      />

      <EntryDialog
        open={!!entryDialog && !!goal}
        onClose={() => setEntryDialog(null)}
        goal={goal}
        totals={totals}
        entry={entryDialog?.entry || null}
        initialMode={entryDialog?.mode || 'in'}
        onSave={saveEntry}
        onDelete={deleteEntry}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('svDeleteGoal')}</AlertDialogTitle>
            <AlertDialogDescription>{t('svDeleteGoalConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteGoal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default memo(Savings);
