import React, { useMemo } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Archive, ArchiveRestore, Check, Minus, MoreVertical, Pencil, Plus, RotateCcw, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import BlurValue from '../BlurValue';
import { countdown, formatDay, moneyIn } from '../plans/PlanParts';
import { GoalBar, GoalRing, GrowthBars, StatusChip, formatMonth } from './SavingsParts';
import { entriesNewestFirst, goalEmoji } from './savingsUtils';

export default function GoalDetail({
  goal, totals, history, household, canEdit, t, loc, blur,
  onBack, onEdit, onStatus, onDelete, onAdd, onTakeOut, onEntryEdit,
}) {
  const money = moneyIn(loc, goal.currency);
  const money2 = moneyIn(loc, goal.currency, 2);
  const emoji = goalEmoji(goal);
  const reached = totals.status === 'reached';
  const hide = (v) => (blur ? '••••' : v);
  const entries = useMemo(() => entriesNewestFirst(goal.entries), [goal.entries]);

  const dateLine = goal.targetDate
    ? `${formatDay(goal.targetDate, loc, true)} · ${countdown(totals.daysLeft, loc, t)}`
    : totals.target > 0 ? t('svNoDate') : t('svNoTarget');

  // The sentence under the bar: where this pace leads, in plain words
  const outlook = (() => {
    switch (totals.status) {
      case 'reached': return t('svOutlookReached');
      case 'open': return totals.pace > 0 ? t('svOutlookOpen', { amount: hide(money(Math.round(totals.pace))) }) : null;
      case 'start': return totals.needPerMonth ? t('svOutlookStart', { amount: hide(money(Math.ceil(totals.needPerMonth))) }) : null;
      case 'late': return t('svOutlookLate', { amount: hide(money(totals.remaining)) });
      default: return totals.projected ? t('svOutlookProjected', { month: formatMonth(totals.projected, loc) }) : null;
    }
  })();

  const who = (email) => (household.isShared && email ? household.byEmail[email]?.name || email.split('@')[0] : '');

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5 sm:space-y-6"
    >
      <header className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} aria-label={t('svAllGoals')} className="h-11 w-11 shrink-0 rounded-full p-0">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <GoalRing pct={totals.pct} emoji={emoji} size={48} stroke={4} reached={reached} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">{goal.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{dateLine}</p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={t('ntMore')} className="h-11 w-11 shrink-0 rounded-full p-0"><MoreVertical className="h-5 w-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem onSelect={onEdit}><Pencil className="me-2 h-4 w-4" /> {t('svEditGoal')}</DropdownMenuItem>
              {goal.status === 'done'
                ? <DropdownMenuItem onSelect={() => onStatus('active')}><RotateCcw className="me-2 h-4 w-4" /> {t('svReopen')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onStatus('done')}><Check className="me-2 h-4 w-4" /> {t('svMarkDone')}</DropdownMenuItem>}
              {goal.status === 'archived'
                ? <DropdownMenuItem onSelect={() => onStatus('active')}><ArchiveRestore className="me-2 h-4 w-4" /> {t('ntUnarchive')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onStatus('archived')}><Archive className="me-2 h-4 w-4" /> {t('ntArchive')}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 className="me-2 h-4 w-4" /> {t('svDeleteGoal')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <section className="rounded-3xl bg-gradient-to-b from-primary/[0.12] to-foreground/[0.03] p-5 sm:p-6" aria-label={t('svSummary')}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('svSaved')}</p>
          <StatusChip status={totals.status} t={t} />
        </div>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums" dir="ltr">
          <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl"><BlurValue blur={blur}>{money(totals.saved)}</BlurValue></span>
          {totals.target > 0 && <span className="text-base text-muted-foreground">/ <BlurValue blur={blur}>{money(totals.target)}</BlurValue></span>}
        </p>
        {totals.pct !== null && (
          <>
            <GoalBar pct={totals.pct} reached={reached} className="mt-5" />
            <p className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{Math.floor(totals.pct * 100)}%</span>
              {outlook && <span className="text-end">{outlook}</span>}
            </p>
          </>
        )}
        {totals.pct === null && outlook && <p className="mt-3 text-sm text-muted-foreground">{outlook}</p>}

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {totals.target > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">{t('svStillToGo')}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(totals.remaining)}</BlurValue></dd>
            </div>
          )}
          {totals.needPerMonth ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('svPerMonthToMakeIt')}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary" dir="ltr"><BlurValue blur={blur}>{money(Math.ceil(totals.needPerMonth))}</BlurValue></dd>
              <dd className="text-xs text-muted-foreground">{t('forMonths').replace('{count}', totals.monthsLeft)}</dd>
            </div>
          ) : totals.monthly > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('svMonthlyPlan')}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary" dir="ltr"><BlurValue blur={blur}>{money(totals.monthly)}</BlurValue></dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">{t('svThisMonth')}</dt>
            <dd className={cn('mt-0.5 text-lg font-semibold tabular-nums', totals.thisMonth > 0 ? 'text-success' : totals.thisMonth < 0 ? 'text-danger' : 'text-foreground')} dir="ltr">
              <BlurValue blur={blur}>{totals.thisMonth > 0 ? '+' : ''}{money(totals.thisMonth)}</BlurValue>
            </dd>
          </div>
        </dl>

        {canEdit && (
          <div className="mt-5 flex gap-2">
            <Button onClick={onAdd} className="h-12 flex-1 rounded-2xl text-base">
              <Plus className="me-1.5 h-5 w-5" /> {t('svAddMoney')}
            </Button>
            <Button variant="outline" onClick={onTakeOut} disabled={totals.saved <= 0} className="h-12 rounded-2xl px-4 text-base">
              <Minus className="me-1.5 h-5 w-5" /> {t('svTakeOut')}
            </Button>
          </div>
        )}
      </section>

      {history.length > 1 && (
        <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('svGrowth')}>
          <h2 className="text-sm font-semibold text-foreground">{t('svGrowth')}</h2>
          <GrowthBars months={history} target={totals.target} currency={goal.currency} loc={loc} t={t} blur={blur} />
        </section>
      )}

      <section aria-label={t('svHistory')}>
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">
          {t('svHistory')} <span className="ms-1 text-sm font-normal tabular-nums text-muted-foreground">{entries.length}</span>
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/70 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{t('svNoEntries')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('svNoEntriesHint')}</p>
          </div>
        ) : (
          <ul className="-mx-1">
            <AnimatePresence initial={false}>
              {entries.map((e) => {
                const out = e.amount < 0;
                const name = who(e.by);
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <button
                      type="button"
                      onClick={() => canEdit && onEntryEdit(e)}
                      disabled={!canEdit}
                      className="flex min-h-[3.75rem] w-full items-center gap-3 rounded-2xl px-2 py-2 text-start transition-colors enabled:hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', out ? 'bg-foreground/[0.07] text-muted-foreground' : 'bg-success/15 text-success')}>
                        {out ? <ArrowUpRight className="h-5 w-5 rtl:-scale-x-100" /> : <ArrowDownLeft className="h-5 w-5 rtl:-scale-x-100" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium text-foreground">{e.note || t(out ? 'svWithdrawal' : 'svDeposit')}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {formatDay(e.date, loc, e.date.slice(0, 4) !== String(new Date().getFullYear()))}
                          {name && ` · ${name}`}
                        </span>
                      </span>
                      <span className={cn('shrink-0 text-[0.9375rem] font-semibold tabular-nums', out ? 'text-foreground' : 'text-success')} dir="ltr">
                        <BlurValue blur={blur}>{out ? '−' : '+'}{money2(Math.abs(e.amount))}</BlurValue>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        {goal.currentAmount > 0 && (
          <p className="mt-2 px-2 text-xs text-muted-foreground">
            {t('svStartedWith', { amount: hide(money(goal.currentAmount)) })}
          </p>
        )}
      </section>

      {goal.notes && (
        <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('notes')}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{goal.notes}</p>
        </section>
      )}
    </motion.div>
  );
}
