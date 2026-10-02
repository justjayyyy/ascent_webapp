import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import {
  ArrowLeft, CheckCircle2, ChevronDown, Flag, HandCoins, MoreVertical, Pencil, Percent, Plus, Receipt, Repeat, RotateCcw, Rocket, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import EChart, { useChartTokens, withAlpha } from '@/components/charts/EChart';
import BlurValue from '../BlurValue';
import { moneyIn, formatDay, countdown } from '../plans/PlanParts';
import { simulateExtra, monthsBetween } from '@shared/commitments';
import { commitmentEmoji, durationText, monthYear } from './commitmentUtils';
import { BigMoney, ProgressRing } from './CommitmentParts';

const EASE = [0.22, 1, 0.36, 1];
const daysUntil = (date, today) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

function Stat({ icon: Icon, label, children, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums text-foreground">
          {children}{sub && <span className="ms-1.5 text-xs font-normal text-muted-foreground">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

/** Balance from today to zero, as it is and with the extra payment the simulator is set to. */
function BalanceChart({ status, faster, currency, loc, t, blur, today }) {
  const tokens = useChartTokens();
  const option = useMemo(() => {
    if (!tokens) return null;
    const ahead = status.schedule.filter((row) => row.date > today);
    if (ahead.length < 2) return null;
    const keys = [today, ...ahead.map((row) => row.date)];
    const base = [status.balance, ...ahead.map((row) => row.balance)];
    const quick = faster?.rows?.length ? [status.balance, ...keys.slice(1).map((_, i) => faster.rows[i]?.balance ?? 0)] : null;
    const money = moneyIn(loc, currency);
    const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    const long = keys.length > 24;
    return {
      animationDuration: 700,
      grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        trigger: 'axis',
        backgroundColor: tokens.popover, borderColor: tokens.border, borderWidth: 1, padding: [8, 12],
        textStyle: { color: tokens.text, fontFamily: tokens.fontFamily, fontSize: 12 },
        extraCssText: 'border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,.5);',
        formatter: (ps) => `${monthYear(keys[ps[0].dataIndex], loc)}<br/>${ps.map((p) => `${p.marker} ${p.seriesName}: <b>${money(p.value)}</b>`).join('<br/>')}`,
      },
      xAxis: {
        type: 'category', boundaryGap: false, data: keys, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: {
          color: tokens.muted, fontFamily: tokens.fontFamily, hideOverlap: true,
          formatter: (d) => (long ? d.slice(0, 4) : new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(`${d.slice(0, 7)}-15T12:00:00`))),
          interval: long ? (i) => i > 0 && keys[i].slice(5, 7) === '01' : 'auto',
        },
      },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: (v) => compact.format(v), fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: [
        {
          name: t('cmBalance'), type: 'line', smooth: 0.25, symbol: 'none',
          lineStyle: { width: 3, color: tokens.primary },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: withAlpha(tokens.primary, 0.3) }, { offset: 1, color: withAlpha(tokens.primary, 0) }] } },
          data: base,
        },
        ...(quick ? [{
          name: t('cmWithExtra'), type: 'line', smooth: 0.25, symbol: 'none',
          lineStyle: { width: 2, type: [6, 5], color: tokens.success },
          data: quick,
        }] : []),
      ],
    };
  }, [tokens, status, faster, currency, loc, t, blur, today]);
  if (!option) return null;
  return <div className="h-48 md:h-56" dir="ltr"><EChart option={option} className="h-full w-full" ariaLabel={t('cmBalance')} /></div>;
}

/** Schedule rows grouped by year; past years start folded. */
function ScheduleTable({ schedule, today, currency, loc, t, blur }) {
  const money = moneyIn(loc, currency);
  const years = useMemo(() => {
    const map = new Map();
    schedule.forEach((row) => {
      const y = row.date.slice(0, 4);
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(row);
    });
    return [...map.entries()];
  }, [schedule]);
  const thisYear = today.slice(0, 4);
  const [open, setOpen] = useState(() => new Set([thisYear]));
  const toggle = (y) => setOpen((s) => { const n = new Set(s); if (n.has(y)) n.delete(y); else n.add(y); return n; });

  return (
    <div className="space-y-1.5">
      {years.map(([year, rows]) => {
        const isOpen = open.has(year);
        const interest = rows.reduce((s, r) => s + r.interest, 0);
        const principal = rows.reduce((s, r) => s + r.principal + r.extra, 0);
        const done = rows[rows.length - 1].date <= today;
        return (
          <div key={year} className="overflow-hidden rounded-2xl bg-foreground/[0.03]">
            <button
              type="button"
              onClick={() => toggle(year)}
              aria-expanded={isOpen}
              className="flex min-h-12 w-full items-center gap-3 px-3 text-start transition-colors hover:bg-foreground/[0.04]"
            >
              <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180")} />
              <span className="font-semibold tabular-nums text-foreground">{year}</span>
              {done && <CheckCircle2 aria-label={t('cmPaidOff')} className="h-4 w-4 text-success" />}
              <span className="ms-auto text-xs tabular-nums text-muted-foreground" dir="auto">
                {t('cmToBalance')} <BlurValue blur={blur}>{money(principal)}</BlurValue> · {t('cmInterest')} <BlurValue blur={blur}>{money(interest)}</BlurValue>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th scope="col" className="px-3 py-1.5 text-start font-medium">{t('date')}</th>
                        <th scope="col" className="px-2 py-1.5 text-end font-medium">{t('cmPaymentShort')}</th>
                        <th scope="col" className="hidden px-2 py-1.5 text-end font-medium sm:table-cell">{t('cmInterest')}</th>
                        <th scope="col" className="hidden px-2 py-1.5 text-end font-medium sm:table-cell">{t('cmToBalance')}</th>
                        <th scope="col" className="px-3 py-1.5 text-end font-medium">{t('cmBalance')}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {rows.map((r) => {
                        const past = r.date <= today;
                        return (
                          <tr key={r.n} className={cn("border-t border-border/30", past ? "text-muted-foreground" : "text-foreground")}>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                {past ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-success" /> : <span aria-hidden className="h-3.5 w-3.5" />}
                                {formatDay(r.date, loc)}
                              </span>
                              {r.extra > 0 && <span className="ms-1.5 rounded-full bg-success/15 px-1.5 text-[0.625rem] font-medium text-success">+{blur ? '••' : money(r.extra)}</span>}
                            </td>
                            <td className="px-2 py-2 text-end" dir="ltr"><BlurValue blur={blur}>{money(r.payment)}</BlurValue></td>
                            <td className="hidden px-2 py-2 text-end sm:table-cell" dir="ltr"><BlurValue blur={blur}>{money(r.interest)}</BlurValue></td>
                            <td className="hidden px-2 py-2 text-end sm:table-cell" dir="ltr"><BlurValue blur={blur}>{money(r.principal)}</BlurValue></td>
                            <td className="px-3 py-2 text-end font-medium" dir="ltr"><BlurValue blur={blur}>{money(r.balance)}</BlurValue></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function CommitmentDetail({
  commitment: c, status: s, recordedThisMonth, today, canEdit, t, loc, isRTL, blur,
  onBack, onEdit, onToggleClosed, onDelete, onRecordPayment, onAddPayment, onRemovePayment,
}) {
  const money = moneyIn(loc, c.currency);
  const lent = c.direction === 'lent';
  const closed = c.status === 'closed';
  const scheduled = s.mode === 'scheduled';
  const [extra, setExtra] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);

  const maxExtra = useMemo(() => {
    const base = Math.max(s.payment, 100);
    const step = base >= 2000 ? 100 : base >= 500 ? 50 : 10;
    return { max: Math.ceil((base * 1.5) / step) * step, step };
  }, [s.payment]);
  const sim = useMemo(() => (scheduled && extra > 0 && !s.done ? simulateExtra(c, extra, today) : null), [scheduled, extra, c, today, s.done]);

  const nextIn = s.next ? daysUntil(s.next.date, today) : null;
  const monthsLeft = s.payoffDate ? Math.max(0, monthsBetween(today, s.payoffDate)) : null;
  const payments = useMemo(() => [...(c.payments || [])].sort((a, b) => b.date.localeCompare(a.date)), [c.payments]);
  const interestShare = s.next && s.next.amount > 0 ? s.next.interest / s.next.amount : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: isRTL ? -16 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isRTL ? -16 : 16 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="space-y-4 sm:space-y-5"
    >
      <header className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} aria-label={t('cmAll')} className="h-11 w-11 shrink-0 rounded-full p-0">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <span aria-hidden className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl", lent ? "bg-success/10" : "bg-primary/10")}>{commitmentEmoji(c)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">{c.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {[c.lender, t(`cmKind_${c.kind}`), lent ? t('cmOwedToMe') : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={t('cmMoreOptions')} className="h-11 w-11 shrink-0 rounded-full p-0"><MoreVertical className="h-5 w-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem onClick={onEdit}><Pencil className="me-2 h-4 w-4" />{t('edit')}</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleClosed}>
                {closed ? <><RotateCcw className="me-2 h-4 w-4" />{t('cmReopen')}</> : <><CheckCircle2 className="me-2 h-4 w-4" />{lent ? t('cmMarkRepaid') : t('cmMarkPaidOff')}</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger"><Trash2 className="me-2 h-4 w-4" />{t('delete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Where it stands */}
      <section className="rounded-3xl bg-foreground/[0.04] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{lent ? t('cmStillOwedToYou') : t('cmLeftToPay')}</p>
            <BigMoney value={s.balance} currency={c.currency} loc={loc} blur={blur} className="mt-1 block text-4xl font-bold tracking-tight md:text-5xl" />
            <p className="mt-1 text-sm text-muted-foreground">
              {(lent ? t('cmRepaidOf') : t('cmPaidOf'))
                .replace('{paid}', blur ? '••••' : money(s.paid))
                .replace('{total}', blur ? '••••' : money(s.principal))}
            </p>
          </div>
          <ProgressRing value={s.progress} size={84} stroke={8} tone={lent ? 'success' : 'primary'} label={t('cmPaidOffPct').replace('{pct}', Math.round(s.progress * 100))} />
        </div>
        {(closed || s.done) && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
            <CheckCircle2 aria-hidden className="h-4 w-4" /> {lent ? t('cmRepaidInFull') : t('cmPaidOffCongrats')}
          </p>
        )}

        {scheduled ? (
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat icon={Repeat} label={t('cmMonthlyPayment')}><BlurValue blur={blur}>{money(s.payment)}</BlurValue></Stat>
            <Stat icon={Percent} label={t('cmRateShort')}>{c.annualRate ? `${c.annualRate}%` : t('cmNoInterest')}</Stat>
            <Stat icon={Flag} label={t('cmPaidOffOn')} sub={monthsLeft ? durationText(monthsLeft, t) : null}>{s.payoffDate ? monthYear(s.payoffDate, loc) : '—'}</Stat>
            <Stat icon={HandCoins} label={t('cmInterestAhead')}><BlurValue blur={blur}>{money(s.interestAhead)}</BlurValue></Stat>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground text-pretty">{lent ? t('cmFlexibleLentExplain') : t('cmFlexibleExplain')}</p>
        )}
      </section>

      {/* The next payment, and where it goes */}
      {scheduled && s.next && !closed && (
        <section className="rounded-3xl bg-foreground/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">{t('cmNextPayment')}</h2>
            <p className="text-sm text-muted-foreground">
              {formatDay(s.next.date, loc, true)} · <span className={cn(nextIn <= 3 && 'font-medium text-primary')}>{nextIn === 0 ? t('today') : countdown(nextIn, loc, t)}</span>
            </p>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(s.next.amount)}</BlurValue></p>
          {s.next.interest > 0 && (
            <>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <motion.span className="h-full bg-danger/70" initial={{ width: 0 }} animate={{ width: `${interestShare * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
                <motion.span className="h-full bg-success" initial={{ width: 0 }} animate={{ width: `${(1 - interestShare) * 100}%` }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-danger/70" />
                  {t('cmGoesToInterest')} <span className="font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(s.next.interest)}</BlurValue></span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                  {t('cmGoesToBalance')} <span className="font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(s.next.principal)}</BlurValue></span>
                </span>
              </div>
            </>
          )}
          {canEdit && !lent && (
            <div className="mt-4 flex flex-wrap gap-2">
              {recordedThisMonth ? (
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-success/15 px-4 text-sm font-medium text-success">
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> {t('cmRecordedThisMonth')}
                </span>
              ) : (
                <Button onClick={onRecordPayment} className="h-10 rounded-full px-4">
                  <Receipt className="me-2 h-4 w-4" /> {t('cmRecordInExpenses')}
                </Button>
              )}
              <Button variant="outline" onClick={() => onAddPayment('extra')} className="h-10 rounded-full px-4">
                <Plus className="me-2 h-4 w-4" /> {t('cmAddExtra')}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Pay it off faster */}
      {scheduled && !s.done && !closed && !lent && s.paymentsLeft > 1 && (
        <section className="rounded-3xl bg-gradient-to-br from-success/[0.08] to-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Rocket aria-hidden className="h-4 w-4 text-success" />
            <h2 className="text-base font-semibold text-foreground">{t('cmFaster')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t('cmFasterHint')}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t('cmExtraEachMonth')}</span>
            <span className="text-lg font-bold tabular-nums text-foreground" dir="ltr">+{blur ? '••••' : money(extra)}</span>
          </div>
          <Slider
            className="mt-3 py-2"
            dir={isRTL ? 'rtl' : 'ltr'}
            value={[extra]}
            min={0}
            max={maxExtra.max}
            step={maxExtra.step}
            onValueChange={([v]) => setExtra(v)}
            aria-label={t('cmExtraEachMonth')}
          />
          <div aria-live="polite" className="mt-4 min-h-[3.5rem]">
            {sim && sim.monthsSooner > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">{t('cmDebtFreeSooner')}</p>
                  <p className="text-lg font-bold text-success">{durationText(sim.monthsSooner, t)}</p>
                  <p className="text-xs text-muted-foreground">{monthYear(sim.payoffDate, loc)}</p>
                </div>
                <div className="rounded-2xl bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">{t('cmInterestSaved')}</p>
                  <p className="text-lg font-bold tabular-nums text-success" dir="ltr"><BlurValue blur={blur}>{money(sim.interestSaved)}</BlurValue></p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{extra > 0 ? t('cmFasterSmall') : t('cmFasterDrag')}</p>
            )}
          </div>
          <div className="mt-4">
            <BalanceChart status={s} faster={sim} currency={c.currency} loc={loc} t={t} blur={blur} today={today} />
          </div>
        </section>
      )}

      {/* Extra payments / repayments */}
      {(!scheduled || payments.length > 0) && (
        <section className="rounded-3xl bg-foreground/[0.04] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">{scheduled ? t('cmExtraPayments') : t('cmRepayments')}</h2>
            {canEdit && !closed && (
              <Button size="sm" variant={scheduled ? 'ghost' : 'default'} onClick={() => onAddPayment(scheduled ? 'extra' : 'repayment')} className="h-10 rounded-full px-4">
                <Plus className="me-1.5 h-4 w-4" /> {scheduled ? t('cmAddExtra') : lent ? t('cmRecordRepaymentLent') : t('cmRecordRepayment')}
              </Button>
            )}
          </div>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('cmNoRepaymentsYet')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/30">
              <AnimatePresence initial={false}>
                {payments.map((p) => (
                  <motion.li key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><HandCoins aria-hidden className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{formatDay(p.date, loc, true)}</span>
                      {(p.note || p.recordedAsExpense) && (
                        <span className="block truncate text-xs text-muted-foreground">{[p.note, p.recordedAsExpense ? t('cmInExpenses') : null].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-success" dir="ltr"><BlurValue blur={blur}>{money(p.amount)}</BlurValue></span>
                    {canEdit && (
                      <Button variant="ghost" onClick={() => onRemovePayment(p)} aria-label={t('delete')} className="h-10 w-10 shrink-0 rounded-full p-0 text-muted-foreground">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      )}

      {/* Full schedule */}
      {scheduled && s.schedule.length > 0 && (
        <section className="rounded-3xl bg-foreground/[0.04] p-5 sm:p-6">
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            aria-expanded={showSchedule}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-start"
          >
            <span>
              <span className="block text-base font-semibold text-foreground">{t('cmSchedule')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('cmPaymentsProgress').replace('{made}', s.paymentsMade).replace('{total}', s.schedule.length)}
                {s.interestPaid > 0 && <> · {t('cmInterestPaidSoFar')} <BlurValue blur={blur}>{money(s.interestPaid)}</BlurValue></>}
              </span>
            </span>
            <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300", showSchedule && "rotate-180")} />
          </button>
          {showSchedule && (
            <div className="mt-3">
              <ScheduleTable schedule={s.schedule} today={today} currency={c.currency} loc={loc} t={t} blur={blur} />
            </div>
          )}
        </section>
      )}

      {c.notes && (
        <section className="rounded-3xl bg-foreground/[0.04] p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">{t('notes')}</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>
        </section>
      )}
    </motion.div>
  );
}
