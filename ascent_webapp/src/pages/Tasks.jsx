import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from '@/lib/motion';
import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { localDay } from '@/lib/localDay';
import { useCategories, useMoney, useTasks } from '@/hooks/useWorkspaceData';
import { useRealId } from '@/lib/offline/txOutbox';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import BlurValue from '@/components/BlurValue';
import { countdown, localeOf, moneyIn } from '@/components/plans/PlanParts';
import { useWho } from '@/components/groceries/GroceryParts';
import TaskDialog from '@/components/tasks/TaskDialog';
import TaskSheet from '@/components/tasks/TaskSheet';
import DoneDialog from '@/components/tasks/DoneDialog';
import { LedgerCard, LedgerGroup, LedgerRow, NowCard, TaskSummary, TasksSkeleton, WhoSwitch } from '@/components/tasks/TaskParts';
import { useTaskActions } from '@/components/tasks/useTaskActions';
import { TEMPLATES, daysUntil, dueState, isMine, kindEmoji, sectionTasks, totalOf, upcomingCost } from '@/components/tasks/taskUtils';

// Everyone's tasks or only mine: a per-device preference
const WHOSE_KEY = 'ascent_tasks_whose';
const readWhose = () => { try { return localStorage.getItem(WHOSE_KEY) === 'mine' ? 'mine' : 'all'; } catch { return 'all'; } };

/** Today's date, moved on when the installed app comes back to the screen on a later day. */
function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') setToday((d) => (localDay(d) === localDay() ? d : new Date())); };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);
  return today;
}

/** "October", or "February 2027" when it is not this year. */
const monthTitle = (key, loc, today) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(loc, { month: 'long', ...(y !== today.getFullYear() ? { year: 'numeric' } : {}) }).format(new Date(y, m - 1, 15));
};

function Tasks() {
  const { user, t, language } = useTheme();
  const loc = localeOf(language);
  const blur = !!user?.blurValues;
  const userCurrency = user?.currency || 'ILS';
  const [params, setParams] = useSearchParams();
  const who = useWho();
  const { convert } = useMoney(userCurrency);
  const { data: tasks = [], isLoading } = useTasks();
  const { data: categories = [] } = useCategories();
  const { complete, canLog, api, failed } = useTaskActions();
  const today = useToday();

  // sheet: { view: id } shows a task, { form: true, id?, template? } adds or edits one
  const [sheet, setSheet] = useState(null);
  const [doneFor, setDoneFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [whose, setWhoseState] = useState(readWhose);
  const setWhose = useCallback((v) => {
    setWhoseState(v);
    try { localStorage.setItem(WHOSE_KEY, v); } catch { /* storage unavailable */ }
  }, []);

  const onlyMine = who.isShared && whose === 'mine';
  const visible = useMemo(() => (onlyMine ? tasks.filter((x) => isMine(x, user?.email)) : tasks), [tasks, onlyMine, user?.email]);
  const sections = useMemo(() => sectionTasks(visible, today), [visible, today]);
  const toMine = useCallback((amount, currency) => (currency === userCurrency ? amount : convert(amount, currency)), [convert, userCurrency]);
  const coming = useMemo(() => upcomingCost(visible, { today, days: 30, toMine }), [visible, today, toMine]);
  const lateCount = sections.now.filter((x) => dueState(x, today) === 'overdue').length;
  const openCount = visible.length - sections.done.length;
  const next = sections.months[0]?.tasks[0] || null;
  const mine = moneyIn(loc, userCurrency);
  const takenTitles = useMemo(() => tasks.map((x) => x.title), [tasks]);

  const byId = (id) => tasks.find((x) => x.id === id) || null;
  const viewing = sheet?.view ? byId(sheet.view) : null;
  const editing = sheet?.form && sheet.id ? byId(sheet.id) : null;

  const openNew = useCallback((template = null) => setSheet({ form: true, template }), []);
  const openTask = useCallback((task) => setSheet({ view: task.id }), []);

  // The + and the long-press menu's "New task"
  usePageCreateAction(useCallback(() => openNew(), [openNew]));
  useEffect(() => {
    if (params.get('new') !== '1') return;
    openNew();
    const nextParams = new URLSearchParams(params);
    nextParams.delete('new');
    setParams(nextParams, { replace: true });
  }, [params, setParams, openNew]);

  // ?task=<id> shows that task (from the dashboard or a reminder)
  const askedId = useRealId(params.get('task'));
  useEffect(() => {
    if (!askedId || isLoading) return;
    if (tasks.some((x) => x.id === askedId)) setSheet({ view: askedId });
    const nextParams = new URLSearchParams(params);
    nextParams.delete('task');
    setParams(nextParams, { replace: true });
  }, [askedId, isLoading, tasks, params, setParams]);

  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      if (editing) await api.update(editing.id, data);
      else await api.create({ ...data, status: 'open', history: [] });
      toast.success(t(editing ? 'tkSaved' : 'tkCreated'));
      // An edit goes back to the task it came from; a new task is done with
      setSheet(editing ? { view: editing.id } : null);
    } catch {
      failed();
    } finally {
      setSaving(false);
    }
  }, [editing, api, failed, t]);

  // A task that costs nothing is done in one tap; one with a cost asks what it was this time
  const onDone = useCallback((task) => {
    setSheet(null);
    if (task.amount > 0) setDoneFor(task);
    else complete(task);
  }, [complete]);

  const finish = useCallback(async (values) => {
    if (!doneFor) return;
    setSaving(true);
    await complete(doneFor, values);
    setSaving(false);
    setDoneFor(null);
  }, [doneFor, complete]);

  const remove = useCallback(async () => {
    const task = confirmDelete;
    setConfirmDelete(null);
    setSheet(null);
    if (!task) return;
    try {
      await api.remove(task.id);
      toast.success(t('tkDeleted'));
    } catch {
      failed();
    }
  }, [confirmDelete, api, failed, t]);

  const reopen = useCallback((task) => {
    setSheet(null);
    api.update(task.id, { status: 'open', doneAt: null }).catch(failed);
    toast(t('tkReopened'));
  }, [api, failed, t]);

  const rowProps = { onOpen: openTask, onDone, who, t, loc, blur, today };
  // A sum that converted other currencies into mine says it is about that much
  const approx = (list) => (list.some((x) => x.amount > 0 && x.currency && x.currency !== userCurrency) ? '≈ ' : '');
  const total = (list) => {
    const sum = totalOf(list, toMine);
    return sum > 0
      ? <span className="text-sm font-bold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{approx(list)}{mine(sum)}</BlurValue></span>
      : null;
  };

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col px-4 pb-28 pt-3 sm:px-5 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.12),transparent_70%)]" />

      <header className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t('tkNav')}</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t('tkSubtitle')}</p>
        </div>
        {tasks.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
          {who.isShared && <WhoSwitch value={whose} onChange={setWhose} t={t} />}
          <Button onClick={() => openNew()} aria-label={t('tkNewTask')} className="h-11 w-11 shrink-0 rounded-full p-0 sm:w-auto sm:px-5">
            <Plus className="h-5 w-5 sm:me-2" /><span className="hidden sm:inline">{t('tkNewTask')}</span>
          </Button>
          </div>
        )}
      </header>

      {isLoading ? (
        <TasksSkeleton />
      ) : tasks.length === 0 ? (
        <section className="rounded-3xl border border-border/60 bg-card/75 px-5 py-8 text-center shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05)] backdrop-blur-xl sm:px-10 sm:py-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">{t('tkEmptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t('tkEmptyHint')}</p>
          <p className="mt-6 text-[13px] font-semibold text-muted-foreground">{t('tkStartFrom')}</p>
          <div className="mx-auto mt-2.5 flex max-w-xl flex-wrap justify-center gap-2">
            {TEMPLATES.slice(0, 8).map((tpl, i) => (
              <motion.button
                key={tpl[0]}
                type="button"
                onClick={() => openNew(tpl)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground/[0.06] px-4 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
              >
                <span aria-hidden className="text-lg leading-none">{kindEmoji(tpl[1])}</span>{t(tpl[0])}
              </motion.button>
            ))}
          </div>
          <Button onClick={() => openNew()} className="mt-6 h-11 rounded-full px-6"><Plus className="me-2 h-4 w-4" />{t('tkNewTask')}</Button>
        </section>
      ) : (
        <div className="space-y-5">
          {onlyMine && visible.length === 0 ? (
            <p className="rounded-[22px] bg-foreground/[0.04] px-4 py-4 text-sm text-muted-foreground">{t('tkNoneMine')}</p>
          ) : (<>
          <TaskSummary
            needCount={sections.now.length}
            lateCount={lateCount}
            cost={<BlurValue blur={blur}>{approx(coming.tasks)}{mine(coming.total)}</BlurValue>}
            hasCost={coming.total > 0}
            t={t}
          />

          <LayoutGroup>
            <section aria-labelledby="tk-now">
              <h2 id="tk-now" className="mb-2.5 px-1 text-base font-semibold tracking-tight text-foreground">{t('tkNeedsYou')}</h2>
              {sections.now.length > 0 ? (
                <ul className="space-y-2.5">
                  <AnimatePresence initial={false}>
                    {sections.now.map((task) => <NowCard key={task.id} task={task} {...rowProps} />)}
                  </AnimatePresence>
                </ul>
              ) : (
                <div className="rounded-[22px] bg-success/[0.08] px-4 py-4">
                  <p className="text-sm font-semibold text-success">{openCount ? t('tkNothingNow') : t('tkAllDone')}</p>
                  {next && (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {t('tkNextUp', { name: next.title, when: countdown(daysUntil(next, today), loc, t) })}
                    </p>
                  )}
                </div>
              )}
            </section>

            {(sections.months.length > 0 || sections.undated.length > 0) && (
              <section aria-labelledby="tk-coming">
                <h2 id="tk-coming" className="mb-2.5 px-1 text-base font-semibold tracking-tight text-foreground">{t('tkComingUp')}</h2>
                <LedgerCard>
                  {sections.months.map((m) => (
                    <LedgerGroup key={m.key} id={`tk-m-${m.key}`} title={monthTitle(m.key, loc, today)} total={total(m.tasks)}>
                      <AnimatePresence initial={false}>
                        {m.tasks.map((task) => <LedgerRow key={task.id} task={task} {...rowProps} />)}
                      </AnimatePresence>
                    </LedgerGroup>
                  ))}
                  {sections.undated.length > 0 && (
                    <LedgerGroup id="tk-undated" title={t('tkGroup_undated')} total={total(sections.undated)}>
                      <AnimatePresence initial={false}>
                        {sections.undated.map((task) => <LedgerRow key={task.id} task={task} {...rowProps} />)}
                      </AnimatePresence>
                    </LedgerGroup>
                  )}
                </LedgerCard>
              </section>
            )}
          </LayoutGroup>

          {sections.done.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                aria-controls="tk-done"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', showDone && 'rotate-180')} aria-hidden />
                {t('tkGroup_done')} <span className="tabular-nums">{sections.done.length}</span>
              </button>
              {showDone && (
                <div id="tk-done" className="mt-2">
                  <LedgerCard>
                    <ul className="divide-y divide-border/50">
                      {sections.done.map((task) => <LedgerRow key={task.id} task={task} {...rowProps} />)}
                    </ul>
                  </LedgerCard>
                </div>
              )}
            </section>
          )}

          </>)}
        </div>
      )}

      <TaskSheet
        task={viewing}
        open={!!viewing}
        onClose={() => setSheet(null)}
        onDone={onDone}
        onEdit={(task) => setSheet({ form: true, id: task.id })}
        onReopen={reopen}
        who={who}
        blur={blur}
        today={today}
      />

      <TaskDialog
        open={!!sheet?.form}
        onClose={() => setSheet(editing ? { view: editing.id } : null)}
        task={editing}
        template={sheet?.template || null}
        categories={categories}
        takenTitles={takenTitles}
        onSave={save}
        onDelete={editing ? () => setConfirmDelete(editing) : null}
        saving={saving}
      />

      <DoneDialog
        task={doneFor}
        open={!!doneFor}
        onClose={() => setDoneFor(null)}
        onDone={finish}
        canLog={canLog}
        saving={saving}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tkDeleteTask')}</AlertDialogTitle>
            <AlertDialogDescription>{t('tkDeleteConfirm', { name: confirmDelete?.title || '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default memo(Tasks);
