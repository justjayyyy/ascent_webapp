import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Check, CheckCheck, CopyX, Nfc, Pencil, SkipForward, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from '@/lib/motion';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth, useWorkspaceId } from '@/lib/AuthContext';
import { getOutbox } from '@/lib/offline/txOutbox';
import { deleteOp, updateOp } from '@/lib/offline/outboxModel';
import { uuid } from '@/lib/offline/network';
import { haptic } from '@/lib/haptics';
import { translateCategory } from '@/lib/translations';
import { formatTxTime } from '@/lib/txOrder';
import { cn } from '@/lib/utils';
import { duplicateOriginal } from '@/lib/checkin';
import { useHousehold } from '@/hooks/useHousehold';
import { useTasks } from '@/hooks/useWorkspaceData';
import { dueState, taskEmoji } from '@/components/tasks/taskUtils';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { createPageUrl } from '@/utils';

const QUICK_CATEGORIES = 8;

/** The expense categories this household uses most, most used first, then the rest. */
function rankCategories(categories, rows) {
  const uses = new Map();
  rows.forEach((x) => { if (x.type === 'Expense' && x.category) uses.set(x.category, (uses.get(x.category) || 0) + 1); });
  return categories
    .filter((c) => c.type !== 'Income' && !['other_expense', 'Other'].includes(c.nameKey || c.name))
    .sort((a, b) => (uses.get(b.name) || 0) - (uses.get(a.name) || 0));
}

/**
 * The check-in itself: one payment at a time (confirm it, give it a category, or drop a copy),
 * then the week in a few numbers and what is coming. The list is taken when it opens, so cards
 * do not jump while changes sync.
 */
export default function CheckinSheet({ open, onClose, checkin, rows, categories = [], canEdit }) {
  const { t, language, user, isRTL } = useTheme();
  const reduce = useReducedMotion();
  const { user: authUser } = useAuth();
  const workspaceId = useWorkspaceId();
  const box = getOutbox(authUser?.id || authUser?._id);
  const { byEmail, isShared } = useHousehold();
  const { data: tasks = [] } = useTasks({ enabled: open });
  const { save, saving } = useSaveTransaction();
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const currency = user?.currency || 'ILS';
  const blur = !!user?.blurValues;

  const [items, setItems] = useState([]);
  const [at, setAt] = useState(0);
  const [handled, setHandled] = useState(0);
  const [editing, setEditing] = useState(null);
  const [dir, setDir] = useState(1);

  // Taken once per opening, during the render that opens it, so the first card shows straight away
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setItems(canEdit ? checkin.queue : []);
      setAt(0);
      setHandled(0);
      setDir(1);
    }
  }

  const ranked = useMemo(() => rankCategories(categories, rows), [categories, rows]);
  const fmt = useCallback((v, cur = currency, digits = 0) => new Intl.NumberFormat(loc, { style: 'currency', currency: cur || currency, maximumFractionDigits: digits }).format(v || 0), [loc, currency]);
  const dayLabel = (d) => new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${String(d).slice(0, 10)}T12:00:00`));

  const current = items[at] || null;
  const onSummary = at >= items.length;
  const next = useCallback(() => { setDir(1); setAt((i) => i + 1); }, []);

  const change = useCallback(async (tx, data, { quiet = false } = {}) => {
    if (!box) return;
    haptic('light');
    try {
      await box.submit(updateOp({ uuid: uuid(), workspaceId, txId: tx.id, data }));
      setHandled((n) => n + 1);
      next();
    } catch {
      if (!quiet) toast.error(t('failedToUpdateTransaction'));
    }
  }, [box, workspaceId, next, t]);

  const remove = useCallback(async (tx) => {
    if (!box) return;
    haptic('success');
    try {
      await box.submit(deleteOp({ uuid: uuid(), workspaceId, txId: tx.id }));
      setHandled((n) => n + 1);
      toast(t('ciDeleted'));
      next();
    } catch {
      toast.error(t('failedToDeleteTransaction'));
    }
  }, [box, workspaceId, next, t]);

  const skip = useCallback((tx) => {
    checkin.skip(tx.id);
    next();
  }, [checkin, next]);

  const back = () => { setDir(-1); setAt((i) => Math.max(0, i - 1)); };

  const close = () => {
    if (onSummary) checkin.finish();
    onClose();
  };

  const week = checkin.week;
  const dueTasks = useMemo(() => tasks.filter((x) => ['overdue', 'today', 'soon'].includes(dueState(x))).slice(0, 4), [tasks]);
  const slide = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : {
    initial: { opacity: 0, x: (isRTL ? -1 : 1) * dir * 48 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: (isRTL ? 1 : -1) * dir * 48 },
  };

  const reasonChip = (reason) => (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
      reason === 'duplicate' ? 'bg-warning/15 text-warning' : reason === 'review' ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.07] text-muted-foreground')}>
      {reason === 'duplicate' ? <CopyX className="h-3.5 w-3.5" /> : reason === 'review' ? <Nfc className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
      {t(`ciReason_${reason}`)}
    </span>
  );

  const renderItem = ({ tx, reason }) => {
    const author = isShared ? byEmail[tx.paidBy || tx.created_by] : null;
    const original = reason === 'duplicate' ? duplicateOriginal(tx, rows) : null;
    const chosen = reason === 'category' ? null : tx.category;
    const meta = [dayLabel(tx.date), formatTxTime(tx, loc), tx.ingest?.sources?.[0]?.cardText, author?.name].filter(Boolean).join(' · ');
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">{reasonChip(reason)}</div>
        <div className="mt-5 text-center">
          <p className="truncate text-lg font-medium text-foreground">{tx.description || tx.merchant || translateCategory(tx.category, language)}</p>
          <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums text-foreground" dir="ltr">
            <BlurValue blur={blur}>{fmt(tx.amount, tx.currency, 2)}</BlurValue>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{meta}</p>
        </div>

        {reason === 'duplicate' && (
          <div className="mt-5 rounded-2xl bg-warning/[0.08] p-4 text-sm">
            <p className="font-medium text-foreground">{t('ciDuplicateHint')}</p>
            {original && (
              <p className="mt-1 text-muted-foreground">
                {t('ciAlreadyRecorded', { what: original.description || original.merchant || '', when: dayLabel(original.date) })}
                {' '}<span className="tabular-nums" dir="ltr"><BlurValue blur={blur}>{fmt(original.amount, original.currency, 2)}</BlurValue></span>
              </p>
            )}
          </div>
        )}

        {reason !== 'duplicate' && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-muted-foreground">{reason === 'category' ? t('ciPickCategory') : t('ciCategoryRight')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ranked.slice(0, QUICK_CATEGORIES).map((c) => {
                const on = chosen === c.name;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => change(tx, { category: c.name, ...(tx.status === 'pending' && { status: 'confirmed' }) })}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-[background-color,transform] active:scale-95',
                      on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/10'
                    )}
                  >
                    {c.icon && <span aria-hidden>{c.icon}</span>}{translateCategory(c.nameKey || c.name, language)}
                  </button>
                );
              })}
              {ranked.length > QUICK_CATEGORIES && (
                <Select onValueChange={(v) => change(tx, { category: v, ...(tx.status === 'pending' && { status: 'confirmed' }) })}>
                  <SelectTrigger className="h-10 w-auto rounded-full border-0 bg-foreground/[0.06] px-3.5 text-sm" aria-label={t('ciMoreCategories')}>
                    <SelectValue placeholder={t('ciMoreCategories')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ranked.slice(QUICK_CATEGORIES).map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ''}{translateCategory(c.nameKey || c.name, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto grid gap-2 pt-6">
          {reason === 'duplicate' ? (
            <>
              <Button onClick={() => remove(tx)} className="h-12 rounded-xl text-base"><Trash2 className="me-2 h-5 w-5" />{t('ciDeleteCopy')}</Button>
              <Button variant="secondary" onClick={() => change(tx, { status: 'confirmed' })} className="h-12 rounded-xl text-base">{t('ciKeepBoth')}</Button>
            </>
          ) : reason === 'review' ? (
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Button onClick={() => change(tx, { status: 'confirmed' })} className="h-12 rounded-xl text-base"><Check className="me-2 h-5 w-5" strokeWidth={3} />{t('ciLooksRight')}</Button>
              <Button variant="secondary" onClick={() => setEditing(tx)} aria-label={t('edit')} className="h-12 w-12 rounded-xl p-0"><Pencil className="h-5 w-5" /></Button>
              <Button variant="secondary" onClick={() => remove(tx)} aria-label={t('delete')} className="h-12 w-12 rounded-xl p-0 text-destructive"><Trash2 className="h-5 w-5" /></Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button variant="secondary" onClick={() => skip(tx)} className="h-12 rounded-xl text-base"><SkipForward className="me-2 h-5 w-5 rtl:-scale-x-100" />{t('ciLeaveIt')}</Button>
              <Button variant="secondary" onClick={() => setEditing(tx)} aria-label={t('edit')} className="h-12 w-12 rounded-xl p-0"><Pencil className="h-5 w-5" /></Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const up = week.change !== null && week.change > 0;
    return (
      <div className="flex flex-1 flex-col">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success"><CheckCheck className="h-7 w-7" /></span>
          <h3 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{items.length ? t('ciAllCaughtUp') : t('ciNothingToReview')}</h3>
          {handled > 0 && <p className="mt-1 text-sm text-muted-foreground">{t('ciHandled', { n: handled })}</p>}
        </div>

        <section className="mt-6 rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('ciYourWeek')}>
          <p className="text-sm text-muted-foreground">{t('ciYourWeek')}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(week.spent)}</BlurValue></span>
            {week.change !== null && (
              <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold', up ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success')}>
                {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {t(up ? 'ciMoreThanUsual' : 'ciLessThanUsual', { pct: Math.round(Math.abs(week.change) * 100) })}
              </span>
            )}
          </div>
          {week.bills > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t('ciPlusBills', { amount: blur ? '••' : fmt(week.bills) })}</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {week.topCategory && (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t('ciMostOn')}</dt>
                <dd className="truncate font-semibold text-foreground">{translateCategory(week.topCategory.category, language)} <span className="font-normal text-muted-foreground">· {Math.round(week.topCategory.share * 100)}%</span></dd>
              </div>
            )}
            {week.biggest && (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t('ciBiggest')}</dt>
                <dd className="truncate font-semibold text-foreground">{week.biggest.description || translateCategory(week.biggest.category, language)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">{t('ciNoSpendThisWeek', { n: week.noSpendDays })}</p>
            <ol className="mt-2 grid grid-cols-7 gap-1.5" aria-hidden>
              {week.week.map((d) => (
                <li key={d.day} className="text-center">
                  <span className={cn('mx-auto block h-7 w-7 rounded-full',
                    d.state === 'free' ? 'bg-success/80' : d.state === 'spent' ? 'bg-foreground/15' : 'bg-foreground/[0.05]')} />
                  <span className="mt-1 block text-[10px] text-muted-foreground">{new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(`${d.day}T12:00:00`))}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {(week.coming.count > 0 || dueTasks.length > 0) && (
          <section className="mt-3 rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('ciComing')}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t('ciComing')}</p>
              {week.coming.total > 0 && <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(week.coming.total)}</BlurValue></span>}
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {week.coming.items.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-foreground">{x.description || translateCategory(x.category, language)} <span className="text-muted-foreground">· {dayLabel(x.date)}</span></span>
                  <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(x.amount)}</BlurValue></span>
                </li>
              ))}
              {dueTasks.map((task) => (
                <li key={task.id}>
                  <Link to={`${createPageUrl('Tasks')}?task=${task.id}`} onClick={close} className="flex items-center justify-between gap-3 rounded-lg hover:underline">
                    <span className="truncate text-foreground"><span aria-hidden>{taskEmoji(task)} </span>{task.title}</span>
                    <span className={cn('shrink-0 text-xs', dueState(task) === 'overdue' ? 'text-danger' : 'text-warning')}>{t(`ciTask_${dueState(task)}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-auto pt-6">
          <Button onClick={close} className="h-12 w-full rounded-xl text-base">{t('ciFinish')}</Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open && !editing} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="flex max-h-[92dvh] min-h-[min(640px,92dvh)] w-[95vw] max-w-[95vw] flex-col overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
          <div className="flex items-center gap-3 pe-9">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight">{t('ciTitle')}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {onSummary ? t('ciWeekOf', { from: dayLabel(week.from), to: dayLabel(week.to) }) : t('ciProgress', { n: at + 1, total: items.length })}
              </DialogDescription>
            </div>
            {at > 0 && !onSummary && (
              <button type="button" onClick={back} className="h-11 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-foreground/10 hover:text-foreground">{t('ciBack')}</button>
            )}
          </div>
          {items.length > 0 && (
            <div className="mt-3 flex gap-1" aria-hidden>
              {items.map((x, i) => (
                <span key={x.tx.id} className={cn('h-1 flex-1 rounded-full transition-colors', i < at ? 'bg-primary' : i === at ? 'bg-primary/50' : 'bg-foreground/10')} />
              ))}
            </div>
          )}
          <div className="relative mt-4 flex flex-1 flex-col">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={onSummary ? 'summary' : current.tx.id} {...slide} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="flex flex-1 flex-col">
                {onSummary ? renderSummary() : renderItem(current)}
              </motion.div>
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <AddTransactionDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={async (data) => {
          if (await save(data, editing)) { setEditing(null); setHandled((n) => n + 1); next(); }
        }}
        isLoading={saving}
        categories={categories}
        editTransaction={editing}
        defaultType="Expense"
      />
    </>
  );
}
