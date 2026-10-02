import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Archive, ArchiveRestore, Check, CheckCircle2, Circle, Clock, MoreVertical, Pencil, Plus, Receipt, RotateCcw, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { translateCategory } from '@/lib/translations';
import BlurValue from '../BlurValue';
import { kindEmoji } from './planUtils';
import { PaymentTimeline, PlanBar, countdown, formatDay, moneyIn } from './PlanParts';
import { localDay } from '@/lib/localDay';

const todayKey = () => localDay();

function StatusButton({ item, canEdit, onToggle, t }) {
  const Icon = item.status === 'paid' ? CheckCircle2 : item.status === 'booked' ? Clock : Circle;
  const tone = item.status === 'paid' ? 'text-success' : item.status === 'booked' ? 'text-primary' : 'text-muted-foreground';
  const interactive = canEdit && item.status !== 'paid';
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={(e) => { e.stopPropagation(); onToggle(item); }}
      aria-label={`${t(`planStatus_${item.status}`)}${interactive ? ` · ${t(item.status === 'booked' ? 'markPlanned' : 'markBooked')}` : ''}`}
      title={interactive ? t(item.status === 'booked' ? 'markPlanned' : 'markBooked') : t(`planStatus_${item.status}`)}
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[background-color,transform] active:scale-90", tone, interactive && "hover:bg-foreground/[0.08]")}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export default function PlanDetail({
  plan, totals, timeline, linked, categories, canEdit, t, loc, language, blur,
  onBack, onEdit, onStatus, onDelete, onItemEdit, onItemAdd, onItemToggle, onPay,
}) {
  const money = moneyIn(loc, plan.currency);
  const money2 = moneyIn(loc, plan.currency, 2);
  const today = todayKey();
  const emoji = plan.emoji || kindEmoji(plan.kind);
  const iconByCategory = useMemo(() => {
    const map = {};
    categories.forEach((c) => { if (c.icon) map[c.nameKey || c.name] = c.icon; });
    return map;
  }, [categories]);

  const { open, paid } = useMemo(() => {
    const items = plan.items || [];
    const byDue = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    return {
      open: items.filter((i) => i.status !== 'paid').sort(byDue),
      paid: items.filter((i) => i.status === 'paid').sort(byDue),
    };
  }, [plan.items]);

  const linkedById = useMemo(() => new Map(linked.map((tx) => [tx.id, tx])), [linked]);
  const past = totals.daysLeft !== null && totals.daysLeft < 0;
  const dateLine = plan.startDate
    ? `${formatDay(plan.startDate, loc, true)}${plan.endDate && plan.endDate !== plan.startDate ? ` – ${formatDay(plan.endDate, loc, true)}` : ''}`
    : t('planNoDate');

  const row = (item) => {
    const tx = item.transactionId ? linkedById.get(item.transactionId) : null;
    const overdue = item.status !== 'paid' && item.dueDate && item.dueDate < today;
    const cat = item.category ? translateCategory(item.category, language) : '';
    const when = item.status === 'paid'
      ? (tx ? `${t('paidOn')} ${formatDay(tx.date.slice(0, 10), loc)}` : t('planStatus_paid'))
      : item.dueDate ? `${overdue ? t('overdue') : t('due')} ${formatDay(item.dueDate, loc)}` : t('noDueDate');
    const amount = tx ? tx.amount : item.amount;
    return (
      <motion.li
        key={item.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-1"
      >
        <StatusButton item={item} canEdit={canEdit} onToggle={onItemToggle} t={t} />
        <button
          type="button"
          onClick={() => canEdit && onItemEdit(item)}
          disabled={!canEdit}
          className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-start transition-colors enabled:hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[0.9375rem] font-medium", item.status === 'paid' ? 'text-muted-foreground' : 'text-foreground')}>
              {item.name || t('planItem')}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {iconByCategory[item.category] && <span aria-hidden>{iconByCategory[item.category]}</span>}
              <span className="truncate">
                {cat}
                {cat && ' · '}
                <span className={cn(overdue && 'font-medium text-danger')}>{when}</span>
                {item.status === 'booked' && ` · ${t('planStatus_booked')}`}
                {item.note && ` · ${item.note}`}
              </span>
            </span>
          </span>
          <span className={cn("shrink-0 text-[0.9375rem] font-semibold tabular-nums", item.status === 'paid' ? 'text-success' : amount > 0 ? 'text-foreground' : 'text-muted-foreground')} dir="ltr">
            {amount > 0 ? <BlurValue blur={blur}>{money2(amount)}</BlurValue> : '—'}
          </span>
        </button>
        {canEdit && item.status !== 'paid' && (
          <Button size="sm" variant="ghost" onClick={() => onPay(item)} className="h-9 shrink-0 rounded-full bg-success/10 px-3 text-success hover:bg-success/20 hover:text-success">
            {t('pay')}
          </Button>
        )}
      </motion.li>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5 sm:space-y-6"
    >
      <header className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} aria-label={t('allPlans')} className="h-11 w-11 shrink-0 rounded-full p-0">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl">{emoji}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">{plan.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {dateLine}
            {plan.startDate && <> · <span className={cn(!past && totals.daysLeft <= 30 && 'font-medium text-primary')}>{countdown(totals.daysLeft, loc, t)}</span></>}
          </p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={t('ntMore')} className="h-11 w-11 shrink-0 rounded-full p-0"><MoreVertical className="h-5 w-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem onSelect={onEdit}><Pencil className="me-2 h-4 w-4" /> {t('editPlan')}</DropdownMenuItem>
              {plan.status === 'done'
                ? <DropdownMenuItem onSelect={() => onStatus('active')}><RotateCcw className="me-2 h-4 w-4" /> {t('reopenPlan')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onStatus('done')}><Check className="me-2 h-4 w-4" /> {t('markPlanDone')}</DropdownMenuItem>}
              {plan.status === 'archived'
                ? <DropdownMenuItem onSelect={() => onStatus('active')}><ArchiveRestore className="me-2 h-4 w-4" /> {t('ntUnarchive')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onStatus('archived')}><Archive className="me-2 h-4 w-4" /> {t('ntArchive')}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 className="me-2 h-4 w-4" /> {t('deletePlan')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <section className="rounded-3xl bg-gradient-to-b from-primary/[0.12] to-foreground/[0.03] p-5 sm:p-6" aria-label={t('planSummary')}>
        <p className="text-sm text-muted-foreground">{t('paidSoFar')}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums" dir="ltr">
          <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl"><BlurValue blur={blur}>{money(totals.paid)}</BlurValue></span>
          <span className="text-base text-muted-foreground">/ <BlurValue blur={blur}>{money(totals.target)}</BlurValue></span>
        </p>
        <PlanBar totals={totals} className="mt-5" />
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-success" />{t('planStatus_paid')}</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-primary" />{t('planStatus_booked')} <BlurValue blur={blur}>{money(totals.booked)}</BlurValue></li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-foreground/20" />{t('planStatus_planned')}</li>
        </ul>
        <dl className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t('stillToPay')}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(totals.remaining)}</BlurValue></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('setAsideMonthly')}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary" dir="ltr">
              {totals.pace ? <BlurValue blur={blur}>{money(totals.pace)}</BlurValue> : '—'}
            </dd>
            {totals.pace && <dd className="text-xs text-muted-foreground">{t('forMonths').replace('{count}', totals.monthsLeft)}</dd>}
          </div>
        </dl>
        {totals.budget > 0 && totals.unallocated !== 0 && (
          <p className={cn("mt-4 rounded-2xl px-3 py-2 text-sm", totals.unallocated < 0 ? "bg-danger/10 text-danger" : "bg-foreground/[0.05] text-muted-foreground")}>
            {totals.unallocated < 0
              ? t('planOverBudget').replace('{amount}', blur ? '••••' : money(-totals.unallocated))
              : t('budgetUnallocated').replace('{amount}', blur ? '••••' : money(totals.unallocated))}
          </p>
        )}
      </section>

      {timeline.length > 1 && (
        <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('paymentTimeline')}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('paymentTimeline')}</h2>
            <ul className="flex gap-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-sm bg-success" />{t('paid')}</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-sm bg-primary/35" />{t('stillDue')}</li>
            </ul>
          </div>
          <PaymentTimeline months={timeline} currency={plan.currency} loc={loc} t={t} blur={blur} emoji={emoji} />
        </section>
      )}

      <section aria-label={t('planCosts')}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('planCosts')} <span className="ms-1 text-sm font-normal tabular-nums text-muted-foreground">{(plan.items || []).length}</span>
          </h2>
          {canEdit && (
            <Button variant="ghost" onClick={onItemAdd} className="h-10 rounded-full px-3 text-primary hover:bg-primary/10 hover:text-primary">
              <Plus className="me-1 h-4 w-4" /> {t('addPlanItem')}
            </Button>
          )}
        </div>
        {open.length === 0 && paid.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/70 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{t('planNoCosts')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('planNoCostsHint')}</p>
          </div>
        ) : (
          <>
            <ul className="-mx-1"><AnimatePresence initial={false}>{open.map(row)}</AnimatePresence></ul>
            {paid.length > 0 && (
              <>
                <h3 className="mt-4 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('planStatus_paid')} · {paid.length}</h3>
                <ul className="-mx-1"><AnimatePresence initial={false}>{paid.map(row)}</AnimatePresence></ul>
              </>
            )}
          </>
        )}
      </section>

      {totals.extra.length > 0 && (
        <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('otherPlanSpending')}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Receipt className="h-4 w-4 text-muted-foreground" /> {t('otherPlanSpending')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('otherPlanSpendingHint')}</p>
          <ul className="mt-2 divide-y divide-border/30">
            {totals.extra.map((tx) => (
              <li key={tx.id} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">{tx.description}</span>
                <span className="text-xs text-muted-foreground">{formatDay(tx.date.slice(0, 10), loc)}</span>
                <span className="font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{moneyIn(loc, tx.currency, 2)(tx.amount)}</BlurValue></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.notes && (
        <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{plan.notes}</p>
        </section>
      )}
    </motion.div>
  );
}
