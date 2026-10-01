import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ChevronDown, CreditCard, HandCoins, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { useAccounts, useCategories, useCommitments, workspaceKey } from '@/hooks/useWorkspaceData';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import BlurValue from '@/components/BlurValue';
import { useChartTokens } from '@/components/charts/EChart';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { groupBigPurchases } from '@/components/expenses/BigPurchases';
import { useTransactions, useLinkedTransactions } from '@/lib/offline/txOutbox';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import { localDay } from '@/components/insights/useInsights';
import { localeOf, moneyIn, formatDay } from '@/components/plans/PlanParts';
import CommitmentDialog from '@/components/commitments/CommitmentDialog';
import PaymentDialog from '@/components/commitments/PaymentDialog';
import CommitmentDetail from '@/components/commitments/CommitmentDetail';
import { CommitmentCard, DebtHero, PayoffChart, ThisMonth } from '@/components/commitments/CommitmentParts';
import { COMMITMENT_KINDS, kindOf, useToUserCurrency } from '@/components/commitments/commitmentUtils';
import { commitmentStatus, commitmentsSummary, duesBetween } from '@shared/commitments';

const tile = 'relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-12px_hsl(0_0%_0%/0.5)]';

function Commitments() {
  const { user, t, language, isRTL } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('editExpenses');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const loc = localeOf(language);
  const blur = !!user?.blurValues;
  const userCurrency = user?.currency || 'ILS';
  const toUser = useToUserCurrency(userCurrency);
  const tokens = useChartTokens();
  const { save, saving: savingTx } = useSaveTransaction();
  const today = localDay();
  const thisMonth = today.slice(0, 7);

  const [dialog, setDialog] = useState(null); // { commitment?, initial? }
  const [paymentDialog, setPaymentDialog] = useState(null); // { mode }
  const [payTx, setPayTx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const workspaceId = useWorkspaceId();
  const key = useMemo(() => workspaceKey('commitments', workspaceId), [workspaceId]);
  const { data: commitments = [], isLoading } = useCommitments();
  // This month's payments (recent window) and every part of big purchases still being paid off
  const { data: transactions = [] } = useTransactions();
  const { data: installmentRows = [] } = useLinkedTransactions('installmentGroupId');
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();

  const rows = useMemo(() => commitments.map((c) => ({ c, s: commitmentStatus(c, today) })), [commitments, today]);
  const summary = useMemo(() => commitmentsSummary(commitments, today, toUser), [commitments, today, toUser]);

  // This month's scheduled payment counts as recorded once an expense for it exists (extra payments aside)
  const recordedIds = useMemo(() => new Set(transactions
    .filter((tx) => tx.commitmentId && !tx.commitmentPaymentId && String(tx.date).startsWith(thisMonth))
    .map((tx) => tx.commitmentId)), [transactions, thisMonth]);

  const { owe, lent, closed } = useMemo(() => {
    const isClosed = ({ c, s }) => c.status === 'closed' || s.done;
    const byBalance = (a, b) => toUser(b.s.balance, b.c.currency) - toUser(a.s.balance, a.c.currency);
    return {
      owe: rows.filter((r) => r.c.direction !== 'lent' && !isClosed(r)).sort(byBalance),
      lent: rows.filter((r) => r.c.direction === 'lent' && !isClosed(r)).sort(byBalance),
      closed: rows.filter(isClosed),
    };
  }, [rows, toUser]);

  const dues = useMemo(() => owe
    .flatMap(({ c }) => duesBetween(c, `${thisMonth}-01`, `${thisMonth}-31`).map((d) => ({ ...d, c, recorded: recordedIds.has(c.id) })))
    .sort((a, b) => a.date.localeCompare(b.date)), [owe, thisMonth, recordedIds]);
  const duesTotal = useMemo(() => dues.reduce((s, d) => s + toUser(d.amount, d.c.currency), 0), [dues, toUser]);

  // Installment purchases from Expenses are commitments too: shown here, managed there
  const installments = useMemo(
    () => groupBigPurchases(installmentRows).filter((g) => g.count > 1 && g.remaining > 0.5),
    [installmentRows]
  );

  const current = openId ? rows.find((r) => r.c.id === openId) : null;

  // ---- navigation ----
  const openOne = useCallback((id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('id', id); else next.delete('id');
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [params, setParams]);

  const createHere = useCallback(() => setDialog({}), []);
  usePageCreateAction(canEdit ? createHere : null);
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    setDialog({});
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams, canEdit]);

  // Deleted (here or by someone else) while open
  useEffect(() => {
    if (!openId || isLoading || current || saving || queryClient.isFetching({ queryKey: key }) > 0) return;
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  }, [openId, current, isLoading, saving, params, setParams, queryClient, key]);

  // ---- writes: applied to the cache first so the page reacts instantly ----
  const update = useCallback(async (id, changes) => {
    queryClient.setQueryData(key, (list = []) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    try {
      await ascent.entities.Commitment.update(id, changes);
    } catch {
      toast.error(t('cmSaveFailed'));
    } finally {
      queryClient.invalidateQueries({ queryKey: ['commitments'] });
    }
  }, [queryClient, key, t]);

  const saveCommitment = useCallback(async (data) => {
    setSaving(true);
    try {
      if (dialog?.commitment) {
        await update(dialog.commitment.id, data);
        toast.success(t('cmSaved'));
      } else {
        const created = await ascent.entities.Commitment.create({ ...data, payments: [], status: 'active' });
        queryClient.setQueryData(key, (list = []) => [created, ...list]);
        queryClient.invalidateQueries({ queryKey: ['commitments'] });
        toast.success(t('cmCreated'));
        if (created?.id) openOne(created.id);
      }
      setDialog(null);
    } catch {
      toast.error(t('cmSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [dialog, update, queryClient, key, openOne, t, user?.email]);

  const remove = useCallback(async () => {
    if (!current) return;
    const id = current.c.id;
    setConfirmDelete(false);
    openOne(null);
    queryClient.setQueryData(key, (list = []) => list.filter((c) => c.id !== id));
    try {
      await ascent.entities.Commitment.delete(id);
      toast.success(t('cmDeleted'));
    } catch {
      toast.error(t('cmSaveFailed'));
      queryClient.invalidateQueries({ queryKey: ['commitments'] });
    }
  }, [current, openOne, queryClient, key, t]);

  const categoryFor = useCallback((c) => {
    const wanted = c.category || kindOf(c.kind).category;
    if (categories.some((x) => x.name === wanted)) return wanted;
    return categories.find((x) => x.name === 'other_expense')?.name
      || categories.find((x) => /^(expense|both)$/i.test(x.type))?.name || wanted;
  }, [categories]);

  // The month's scheduled payment, recorded as a real expense (it shows in Expenses and budgets)
  const recordPayment = useCallback((c, due) => {
    const s = commitmentStatus(c, today);
    setPayTx({
      type: 'Expense',
      category: categoryFor(c),
      description: c.name,
      amount: due?.amount || s.next?.amount || s.payment || '',
      currency: c.currency || userCurrency,
      paymentMethod: '',
      commitmentId: c.id,
    });
  }, [today, categoryFor, userCurrency]);

  const onPaySubmit = useCallback(async (data) => {
    if (await save(data, null)) setPayTx(null);
  }, [save]);

  const addPayment = useCallback(async (payment, alsoExpense) => {
    if (!current) return;
    const { c } = current;
    setPaymentDialog(null);
    update(c.id, { payments: [...(c.payments || []), { ...payment, recordedAsExpense: alsoExpense }] });
    toast.success(t('cmPaymentAdded'));
    if (alsoExpense) {
      await save({
        type: 'Expense',
        category: categoryFor(c),
        description: `${c.name} · ${t('cmExtraPaymentLabel')}`,
        amount: payment.amount,
        currency: c.currency || userCurrency,
        amountInGlobalCurrency: (c.currency || userCurrency) === userCurrency ? payment.amount : null,
        globalCurrency: (c.currency || userCurrency) === userCurrency ? userCurrency : null,
        date: payment.date,
        commitmentId: c.id,
        commitmentPaymentId: payment.id,
      }, null);
    }
  }, [current, update, save, categoryFor, userCurrency, t]);

  const removePayment = useCallback((payment) => {
    if (!current) return;
    const { c } = current;
    const before = c.payments || [];
    update(c.id, { payments: before.filter((p) => p.id !== payment.id) });
    toast(t('cmPaymentRemoved'), { action: { label: t('ntUndo'), onClick: () => update(c.id, { payments: before }) } });
  }, [current, update, t]);

  const money = moneyIn(loc, userCurrency);
  const colors = tokens?.series || ['hsl(var(--primary))'];
  const hasOwe = owe.length > 0;
  const empty = !isLoading && commitments.length === 0;

  const renderGrid = (list) => (
    <LayoutGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {list.map(({ c, s }) => (
            <CommitmentCard key={c.id} commitment={c} status={s} recordedThisMonth={recordedIds.has(c.id)} today={today} onOpen={openOne} t={t} loc={loc} blur={blur} />
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col p-2 pb-28 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.14),transparent_70%)]" />

      <AnimatePresence mode="wait" initial={false}>
        {current ? (
          <CommitmentDetail
            key={current.c.id}
            commitment={current.c}
            status={current.s}
            recordedThisMonth={recordedIds.has(current.c.id)}
            today={today}
            canEdit={canEdit}
            t={t}
            loc={loc}
            isRTL={isRTL}
            blur={blur}
            onBack={() => openOne(null)}
            onEdit={() => setDialog({ commitment: current.c })}
            onToggleClosed={() => {
              const closing = current.c.status !== 'closed';
              update(current.c.id, { status: closing ? 'closed' : 'active' });
              toast.success(t(closing ? 'cmClosedToast' : 'cmReopenedToast'));
            }}
            onDelete={() => setConfirmDelete(true)}
            onRecordPayment={() => recordPayment(current.c)}
            onAddPayment={(mode) => setPaymentDialog({ mode })}
            onRemovePayment={removePayment}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: isRTL ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isRTL ? 16 : -16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t('commitments')}</h1>
                <p className="mt-1 hidden text-base text-muted-foreground sm:block">{t('cmSubtitle')}</p>
              </div>
              {canEdit && !empty && (
                <Button onClick={() => setDialog({})} aria-label={t('cmNew')} className="h-11 w-11 shrink-0 rounded-full p-0 text-base sm:h-10 sm:w-auto sm:px-5">
                  <Plus className="h-5 w-5 sm:me-2" /> <span className="hidden sm:inline">{t('cmNew')}</span>
                </Button>
              )}
            </header>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : empty ? (
              <section className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center sm:px-10 sm:py-12">
                <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-3xl">🏦</span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground text-balance">{t('cmEmptyTitle')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground text-pretty">{t('cmEmptyHint')}</p>
                {canEdit && (
                  <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
                    {COMMITMENT_KINDS.filter((k) => k.key !== 'other').map(({ key: kind, emoji }, i) => (
                      <motion.button
                        key={kind}
                        type="button"
                        onClick={() => setDialog({ initial: { kind, direction: 'borrowed' } })}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                        className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-background/60 px-2 py-3 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
                      >
                        <span aria-hidden className="text-2xl leading-none">{emoji}</span>
                        {t(`cmKind_${kind}`)}
                      </motion.button>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setDialog({ initial: { direction: 'lent', kind: 'family' } })}
                    className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:underline">
                    <HandCoins aria-hidden className="h-4 w-4" /> {t('cmEmptyLent')}
                  </button>
                )}
              </section>
            ) : (
              <div className="space-y-5 sm:space-y-6">
                {hasOwe && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                    <section className={cn(tile, 'lg:col-span-2')}>
                      <DebtHero summary={summary} rows={rows} toUser={toUser} currency={userCurrency} loc={loc} t={t} blur={blur} today={today} colors={colors} />
                    </section>
                    <section className={cn(tile, 'lg:col-span-3')}>
                      <PayoffChart rows={rows} toUser={toUser} currency={userCurrency} loc={loc} t={t} blur={blur} today={today} />
                    </section>
                  </div>
                )}

                <ThisMonth
                  dues={dues}
                  totalLabel={money(duesTotal)}
                  today={today}
                  loc={loc}
                  t={t}
                  blur={blur}
                  canEdit={canEdit}
                  onRecord={(c, d) => recordPayment(c, d)}
                />

                {hasOwe && (
                  <section aria-label={t('cmWhatYouOwe')}>
                    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('cmWhatYouOwe')}</h2>
                    {renderGrid(owe)}
                  </section>
                )}

                {lent.length > 0 && (
                  <section aria-label={t('cmOwedToYou')}>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h2 className="text-sm font-semibold text-muted-foreground">{t('cmOwedToYou')}</h2>
                      <span className="text-sm font-semibold tabular-nums text-success" dir="ltr"><BlurValue blur={blur}>{money(summary.lentBalance)}</BlurValue></span>
                    </div>
                    {renderGrid(lent)}
                  </section>
                )}

                {!hasOwe && lent.length === 0 && closed.length > 0 && (
                  <p className="rounded-3xl bg-success/10 px-5 py-8 text-center text-sm font-medium text-success">{t('cmAllClear')}</p>
                )}

                {installments.length > 0 && (
                  <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('cmInstallments')}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <CreditCard aria-hidden className="h-4 w-4 text-primary" /> {t('cmInstallments')}
                      </h2>
                      <Link to={createPageUrl('Expenses')} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{t('dashViewAll')}</Link>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('cmInstallmentsHint')}</p>
                    <ul className="mt-2 divide-y divide-border/30">
                      {installments.slice(0, 6).map((g) => {
                        const m = moneyIn(loc, g.currency || userCurrency);
                        const pct = g.total > 0 ? Math.min(100, (g.paid / g.total) * 100) : 0;
                        return (
                          <li key={g.key} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-sm font-medium text-foreground">{g.head.description}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{m(g.remaining)}</BlurValue></span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                              <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                            </div>
                            <p className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
                              <span className="tabular-nums">{t('paymentsMade').replace('{paid}', g.paidCount).replace('{count}', g.count)}</span>
                              {g.next && <span className="tabular-nums">{t('nextPayment')} {formatDay(g.next.date.slice(0, 10), loc)}</span>}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {closed.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setShowClosed((v) => !v)}
                      aria-expanded={showClosed}
                      className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", showClosed && "rotate-180")} />
                      {t('cmClosedSection')} <span className="tabular-nums">{closed.length}</span>
                    </button>
                    {showClosed && renderGrid(closed)}
                  </section>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <CommitmentDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        commitment={dialog?.commitment || null}
        initial={dialog?.initial}
        categories={categories}
        onSave={saveCommitment}
        saving={saving}
      />

      <PaymentDialog
        open={!!paymentDialog}
        onClose={() => setPaymentDialog(null)}
        commitment={current?.c}
        mode={paymentDialog?.mode}
        onSave={addPayment}
      />

      <AddTransactionDialog
        open={!!payTx}
        onClose={() => setPayTx(null)}
        onSubmit={onPaySubmit}
        isLoading={savingTx}
        accounts={accounts}
        categories={categories}
        editTransaction={payTx}
        defaultType="Expense"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cmDeleteConfirm')}</AlertDialogDescription>
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

export default memo(Commitments);
