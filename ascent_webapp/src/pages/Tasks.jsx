import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from '@/lib/motion';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { useCategories, useMoney, useTasks } from '@/hooks/useWorkspaceData';
import { useRealId } from '@/lib/offline/txOutbox';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import BlurValue from '@/components/BlurValue';
import { localeOf, moneyIn } from '@/components/plans/PlanParts';
import { useWho } from '@/components/groceries/GroceryParts';
import TaskDialog from '@/components/tasks/TaskDialog';
import DoneDialog from '@/components/tasks/DoneDialog';
import { TaskGroup, TaskRow } from '@/components/tasks/TaskParts';
import { useTaskActions } from '@/components/tasks/useTaskActions';
import { TEMPLATES, groupTasks, kindEmoji, upcomingCost } from '@/components/tasks/taskUtils';

const GROUPS = [
  { key: 'overdue', title: 'tkGroup_overdue', tone: 'text-danger' },
  { key: 'week', title: 'tkGroup_week', tone: 'text-foreground' },
  { key: 'month', title: 'tkGroup_month' },
  { key: 'later', title: 'tkGroup_later' },
  { key: 'undated', title: 'tkGroup_undated' },
];

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

  const [dialog, setDialog] = useState(null); // { task?, template? }
  const [doneFor, setDoneFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const today = useMemo(() => new Date(), []);
  const groups = useMemo(() => groupTasks(tasks, today), [tasks, today]);
  const toMine = useCallback((amount, currency) => (currency === userCurrency ? amount : convert(amount, currency)), [convert, userCurrency]);
  const coming = useMemo(() => upcomingCost(tasks, { today, days: 30, toMine }), [tasks, today, toMine]);
  const openCount = tasks.filter((x) => x.status !== 'done').length;

  // The dock's + and the long-press menu's "New task"
  usePageCreateAction(useCallback(() => setDialog({}), []));
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialog({});
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // ?task=<id> opens that task (from the dashboard or a reminder)
  const askedId = useRealId(params.get('task'));
  useEffect(() => {
    if (!askedId || isLoading) return;
    const found = tasks.find((x) => x.id === askedId);
    if (found) setDialog({ task: found });
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  }, [askedId, isLoading, tasks, params, setParams]);

  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      if (dialog?.task) await api.update(dialog.task.id, data);
      else await api.create({ ...data, status: 'open', history: [] });
      toast.success(t(dialog?.task ? 'tkSaved' : 'tkCreated'));
      setDialog(null);
    } catch {
      failed();
    } finally {
      setSaving(false);
    }
  }, [dialog, api, failed, t]);

  // A task that costs nothing is done in one tap; one with a cost asks what it was this time
  const onDone = useCallback((task) => {
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
    setDialog(null);
    if (!task) return;
    try {
      await api.remove(task.id);
      toast.success(t('tkDeleted'));
    } catch {
      failed();
    }
  }, [confirmDelete, api, failed, t]);

  const reopen = useCallback((task) => {
    api.update(task.id, { status: 'open', doneAt: null }).catch(failed);
    toast(t('tkReopened'));
  }, [api, failed, t]);

  const mine = moneyIn(loc, userCurrency);
  const rowProps = { onOpen: (task) => setDialog({ task }), onDone, who, t, loc, blur, today };

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col p-3 pb-28 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.14),transparent_70%)]" />

      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t('tkPageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {openCount ? t('tkOpenCount', { n: openCount }) : t('tkSubtitle')}
          </p>
        </div>
        {tasks.length > 0 && (
          <Button onClick={() => setDialog({})} aria-label={t('tkNewTask')} className="h-11 w-11 shrink-0 rounded-full p-0 text-base sm:h-10 sm:w-auto sm:px-5">
            <Plus className="h-5 w-5 sm:me-2" /> <span className="hidden sm:inline">{t('tkNewTask')}</span>
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <section className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center sm:px-10 sm:py-12">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">{t('tkEmptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('tkEmptyHint')}</p>
          <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
            {TEMPLATES.slice(0, 8).map((tpl, i) => (
              <motion.button
                key={tpl[0]}
                type="button"
                onClick={() => setDialog({ template: tpl })}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/60 px-4 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
              >
                <span aria-hidden className="text-lg leading-none">{kindEmoji(tpl[1])}</span>{t(tpl[0])}
              </motion.button>
            ))}
          </div>
          <Button onClick={() => setDialog({})} className="mt-6 h-11 rounded-full px-6"><Plus className="me-2 h-4 w-4" />{t('tkNewTask')}</Button>
        </section>
      ) : (
        <div className="space-y-6">
          {(coming.count > 0 || groups.overdue.length > 0) && (
            <section className="rounded-3xl bg-gradient-to-b from-primary/[0.12] to-foreground/[0.03] p-5 sm:p-6" aria-label={t('tkComingCost')}>
              <p className="text-sm text-muted-foreground">{t('tkComingCost')}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-foreground sm:text-5xl" dir="ltr">
                <BlurValue blur={blur}>{mine(coming.total)}</BlurValue>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('tkComingCount', { n: coming.count })}
                {groups.overdue.length > 0 && <span className="ms-2 font-semibold text-danger">· {t('tkOverdueCount', { n: groups.overdue.length })}</span>}
              </p>
            </section>
          )}

          <LayoutGroup>
            {GROUPS.filter((g) => groups[g.key].length).map((g) => (
              <TaskGroup key={g.key} id={`tk-${g.key}`} title={t(g.title)} tone={g.tone} count={groups[g.key].length}>
                <AnimatePresence initial={false}>
                  {groups[g.key].map((task) => <TaskRow key={task.id} task={task} {...rowProps} />)}
                </AnimatePresence>
              </TaskGroup>
            ))}
          </LayoutGroup>

          {openCount === 0 && (
            <p className="rounded-3xl bg-success/[0.08] px-5 py-6 text-center text-sm font-medium text-success">{t('tkAllDone')}</p>
          )}

          {groups.done.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', showDone && 'rotate-180')} />
                {t('tkGroup_done')} <span className="tabular-nums">{groups.done.length}</span>
              </button>
              {showDone && (
                <ul className="divide-y divide-border/50 overflow-hidden rounded-3xl bg-foreground/[0.03]">
                  {groups.done.map((task) => <TaskRow key={task.id} task={task} {...rowProps} onOpen={reopen} />)}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <TaskDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        task={dialog?.task || null}
        template={dialog?.template || null}
        categories={categories}
        onSave={save}
        onDelete={dialog?.task ? () => setConfirmDelete(dialog.task) : null}
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
