import React, { memo, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Play, Sparkles, Trophy } from 'lucide-react';
import { motion } from '@/lib/motion';
import EChart, { useChartTokens, withAlpha } from '@/components/charts/EChart';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { useBudgets, useCards, useMoney } from '@/hooks/useWorkspaceData';
import { useHousehold } from '@/hooks/useHousehold';
import { useTransactions, useOldestTransactionDate } from '@/lib/offline/txOutbox';
import LoadFailed from '@/components/shell/LoadFailed';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { COMPARISONS, buildMonthReview } from '@/lib/monthReview';
import { spendDays } from '@/lib/noSpend';
import RecapStories from '@/components/recap/RecapStories';
import { DayHeat, Delta, Figure, Section, ShareBar, Sparkline } from '@/components/review/ReviewParts';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthFromKey = (k) => (/^\d{4}-\d{2}$/.test(k || '') ? new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1) : null);
const TOP_CATEGORIES = 8;
const TOP_MERCHANTS = 8;

function Review() {
  const { user, t, language, isRTL } = useTheme();
  const tokens = useChartTokens();
  const blur = !!user?.blurValues;
  const currency = user?.currency || 'ILS';
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const [params, setParams] = useSearchParams();
  const thisMonth = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }, []);

  // The month and the comparison live in the address, so a review can be linked to and comes back the same
  const month = useMemo(() => {
    const asked = monthFromKey(params.get('month'));
    return asked && asked <= thisMonth ? asked : new Date(thisMonth.getFullYear(), thisMonth.getMonth() - (new Date().getDate() <= 7 ? 1 : 0), 1);
  }, [params, thisMonth]);
  const compare = COMPARISONS.includes(params.get('vs')) ? params.get('vs') : 'prev';
  const setParam = (k, v) => { const next = new URLSearchParams(params); next.set(k, v); setParams(next, { replace: true }); };
  const shiftMonth = (delta) => setParam('month', keyOf(new Date(month.getFullYear(), month.getMonth() + delta, 1)));

  // A year back for the trend, and to January of last year for the year-to-date comparison
  const from = useMemo(() => {
    const yearBack = new Date(month.getFullYear(), month.getMonth() - 12, 1);
    const lastJanuary = new Date(month.getFullYear() - 1, 0, 1);
    return `${keyOf(yearBack < lastJanuary ? yearBack : lastJanuary)}-01`;
  }, [month]);
  const { data: transactions = [], isLoading, loadFailed, refetch: retryTransactions, isFetching: retryingTransactions } = useTransactions({ from });
  const oldest = useOldestTransactionDate();
  const { data: budgets = [] } = useBudgets();
  const { data: cards = [] } = useCards();
  const { isShared, members } = useHousehold();
  const { amountOf, convert } = useMoney(currency);

  const rows = useMemo(() => transactions
    // A possible duplicate still waiting for review would count the same purchase twice
    .filter((x) => x?.date && !(x.status === 'pending' && x.ingest?.flags?.includes('possibleDuplicate')))
    .map((x) => ({ ...x, _amount: amountOf(x) })), [transactions, amountOf]);

  const review = useMemo(() => buildMonthReview({
    rows,
    month,
    compare,
    budgets,
    convertBudget: (a, c) => (c && c !== currency ? convert(a, c) ?? a : a),
    cards,
    members: isShared ? members : [],
  }), [rows, month, compare, budgets, convert, currency, cards, isShared, members]);

  const fmt = useCallback((v) => new Intl.NumberFormat(loc, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0), [loc, currency]);
  const fmtCompact = useCallback((v) => new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 }).format(v), [loc]);
  const pct = (v) => new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 }).format(v || 0);
  const monthName = (d, opts = { month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat(loc, opts).format(d);
  const shortMonth = (k) => new Intl.DateTimeFormat(loc, { month: 'short' }).format(monthFromKey(k));
  const cat = (c) => translateCategory(c, language);
  const dayLabel = (d) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`));

  const compareLabel = t(`rvVs_${compare}`);
  const baseText = (v) => (review.base ? t('rvWas', { amount: fmt(v) }) : null);
  const canGoBack = !oldest || keyOf(month) > oldest.slice(0, 7);
  const canGoForward = keyOf(month) < keyOf(thisMonth);
  const { totals, base } = review;
  const [recapOpen, setRecapOpen] = useState(false);

  const weekStart = language === 'ru' ? 1 : 0;
  const weekdayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2026, 1, 1 + ((i + weekStart) % 7)))), [loc, weekStart]);
  const weekdayLong = (wd) => new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(new Date(2026, 1, 1 + wd));
  const freeDays = useMemo(() => {
    const spent = spendDays(rows);
    const out = new Set();
    review.perDay.forEach((d) => { if (!spent.has(`${review.key}-${pad(d.day)}`)) out.add(d.day); });
    return out;
  }, [rows, review]);

  // ---- charts ----
  const tooltipBase = tokens && {
    backgroundColor: tokens.popover, borderColor: tokens.border, borderWidth: 1, padding: [8, 12],
    textStyle: { color: tokens.text, fontFamily: tokens.fontFamily, fontSize: 12 },
    extraCssText: 'border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,.5);',
  };
  const trendOption = useMemo(() => {
    if (!tokens) return null;
    const months = review.trend;
    return {
      animationDuration: 800,
      grid: { left: 4, right: 4, top: 18, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: tokens.grid } },
        formatter: (ps) => `${monthName(monthFromKey(months[ps[0].dataIndex].key))}<br/>${ps.map((p) => `${p.marker} ${p.seriesName}: <b>${fmt(p.value)}</b>`).join('<br/>')}`,
      },
      xAxis: { type: 'category', data: months.map((m) => shortMonth(m.key)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: tokens.muted, fontFamily: tokens.fontFamily, fontSize: 11 } },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: fmtCompact, fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: [
        {
          name: t('expenses'), type: 'bar', barMaxWidth: 22,
          data: months.map((m) => ({
            value: m.spent,
            itemStyle: { borderRadius: [8, 8, 2, 2], color: m.isCurrent ? tokens.primary : withAlpha(tokens.primary, m.recorded ? 0.32 : 0.12) },
          })),
          markLine: review.trendAverage && !blur ? {
            symbol: 'none', silent: true, label: { show: false },
            lineStyle: { color: tokens.muted, type: [4, 4], width: 1 },
            data: [{ yAxis: review.trendAverage }],
          } : undefined,
        },
        {
          name: t('income'), type: 'line', smooth: 0.3, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 2, color: tokens.success }, itemStyle: { color: tokens.success },
          data: months.map((m) => (m.recorded ? m.earned : null)),
        },
      ],
    };
  }, [tokens, review, blur, fmt, fmtCompact, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const paceOption = useMemo(() => {
    if (!tokens) return null;
    const days = Array.from({ length: review.daysInMonth }, (_, i) => i + 1);
    return {
      animationDuration: 900,
      grid: { left: 4, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: tokens.primary, type: 'dashed' } },
        formatter: (ps) => `${ps[0].axisValue}<br/>${ps.filter((p) => p.value !== null && p.value !== undefined).map((p) => `${p.marker} ${p.seriesName}: <b>${fmt(p.value)}</b>`).join('<br/>')}`,
      },
      xAxis: { type: 'category', boundaryGap: false, data: days, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: tokens.muted, fontFamily: tokens.fontFamily } },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: fmtCompact, fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: [
        ...(review.cumulative.base ? [{
          name: compareLabel, type: 'line', smooth: 0.3, symbol: 'none',
          lineStyle: { width: 2, type: [6, 5], color: tokens.muted },
          data: review.cumulative.base,
        }] : []),
        {
          name: monthName(month, { month: 'long' }), type: 'line', smooth: 0.3, symbol: 'none', z: 3,
          lineStyle: { width: 3, color: tokens.primary },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: withAlpha(tokens.primary, 0.3) }, { offset: 1, color: withAlpha(tokens.primary, 0) }] } },
          data: review.cumulative.now,
        },
      ],
    };
  }, [tokens, review, blur, fmt, fmtCompact, compareLabel, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- highlights in words ----
  const highlights = useMemo(() => {
    const out = review.records.map((r) => ({
      icon: Trophy,
      tone: r.kind === 'highestSpend' || r.kind === 'categoryHigh' ? 'text-warning' : 'text-success',
      text: t(`rvRecord_${r.kind}`, { n: r.months, category: r.category ? cat(r.category) : '' }),
    }));
    review.movers.up.slice(0, 2).forEach((m) => out.push({ tone: 'text-danger', text: t('rvMoverUp', { category: cat(m.category), amount: blur ? '••' : fmt(m.delta) }) }));
    review.movers.down.slice(0, 2).forEach((m) => out.push({ tone: 'text-success', text: t('rvMoverDown', { category: cat(m.category), amount: blur ? '••' : fmt(-m.delta) }) }));
    if (review.newMerchants.length) out.push({ tone: 'text-primary', text: t('rvNewPlaces', { n: review.newMerchants.length }) });
    if (review.noSpend.counted > 0) out.push({ tone: 'text-success', text: t('rvNoSpendSummary', { n: review.noSpend.free, longest: review.noSpend.longest }) });
    return out;
  }, [review, t, blur, fmt]); // eslint-disable-line react-hooks/exhaustive-deps

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  const topWeekday = review.weekdays.reduce((best, w) => (w.average > (best?.average || 0) ? w : best), null);
  const maxWeekday = Math.max(...review.weekdays.map((w) => w.average), 1);
  const weekOrder = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[460px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.18),transparent_70%)]" />
      <div className="mx-auto max-w-6xl space-y-4 p-3 pb-28 sm:p-4 md:space-y-5 md:p-8 md:pb-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('rvTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{review.running ? t('rvRunningNote', { day: review.elapsed }) : t('rvSubtitle')}</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 backdrop-blur-xl">
            <button type="button" aria-label={t('dashPrevMonth')} onClick={() => shiftMonth(-1)} disabled={!canGoBack}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 disabled:opacity-30 sm:h-9 sm:w-9">
              <PrevIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">{monthName(month)}</span>
            <button type="button" aria-label={t('dashNextMonth')} onClick={() => shiftMonth(1)} disabled={!canGoForward}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 disabled:opacity-30 sm:h-9 sm:w-9">
              <NextIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Compared with what */}
        <div role="radiogroup" aria-label={t('rvCompareWith')} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          <span className="hidden shrink-0 items-center text-sm text-muted-foreground sm:inline-flex">{t('rvCompareWith')}</span>
          {COMPARISONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={compare === c}
              onClick={() => setParam('vs', c)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-[background-color,color,transform] active:scale-95 sm:min-h-9',
                compare === c ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
              )}
            >
              {t(`rvCompare_${c}`)}
            </button>
          ))}
        </div>

        {loadFailed && <LoadFailed onRetry={() => retryTransactions()} retrying={retryingTransactions} />}

        {isLoading && !rows.length ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : review.isEmpty ? (
          <section className="rounded-3xl bg-foreground/[0.04] px-5 py-12 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{t('rvEmptyTitle')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('rvEmptyHint')}</p>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
            {/* The month in four numbers */}
            <Section i={0} className="md:col-span-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-6 xl:grid-cols-4">
                <Figure big label={t('rvSpent')} value={fmt(totals.spent)} blur={blur}
                  delta={base && <Delta now={totals.spent} base={base.spent} goodWhen="down" fmt={fmt} blur={blur} />} base={base && baseText(base.spent)} />
                <Figure big label={t('rvEarned')} value={fmt(totals.earned)} blur={blur} tone="text-success"
                  delta={base && <Delta now={totals.earned} base={base.earned} goodWhen="up" fmt={fmt} blur={blur} />} base={base && baseText(base.earned)} />
                <Figure big label={totals.net >= 0 ? t('rvKept') : t('rvOverspent')} value={fmt(Math.abs(totals.net))} blur={blur} tone={totals.net >= 0 ? 'text-foreground' : 'text-danger'}
                  delta={base && <Delta now={totals.net} base={base.net} goodWhen="up" fmt={fmt} blur={blur} />} base={base && baseText(base.net)} />
                <Figure big label={t('savingsRate')} value={totals.savingsRate === null ? '—' : pct(totals.savingsRate)} blur={false}
                  base={base && base.savingsRate !== null ? t('rvWas', { amount: pct(base.savingsRate) }) : null} />
              </dl>
              {review.hasBase ? (
                <p className="mt-5 text-xs text-muted-foreground">{t('rvComparedWith', { what: compareLabel, months: review.compareKeys.map(shortMonth).join(', ') })}</p>
              ) : (
                <p className="mt-5 text-xs text-muted-foreground">{t('rvNoComparison')}</p>
              )}
            </Section>

            {/* Highlights */}
            {highlights.length > 0 && (
              <Section i={1} title={t('rvHighlights')} className="md:col-span-6" id="rv-highlights">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-foreground/[0.04] px-3.5 py-3 text-sm text-foreground">
                      {h.icon ? <h.icon className={cn('mt-0.5 h-4 w-4 shrink-0', h.tone)} aria-hidden /> : <Sparkles className={cn('mt-0.5 h-4 w-4 shrink-0', h.tone)} aria-hidden />}
                      <span className="text-pretty">{h.text}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* The year around it */}
            <Section i={2} title={t('rvYear')} aside={review.trendAverage && !blur ? t('rvMonthlyAverage', { amount: fmt(review.trendAverage) }) : null} className="md:col-span-4" id="rv-year">
              <div className="h-60" dir="ltr">{trendOption && <EChart option={trendOption} className="h-full w-full" ariaLabel={t('rvYear')} />}</div>
            </Section>

            {/* Fixed and flexible */}
            <Section i={2} title={t('rvFixedFlexible')} className="md:col-span-2" id="rv-fixed">
              <dl className="space-y-5">
                <Figure label={t('rvFlexible')} value={fmt(totals.flexible)} blur={blur}
                  delta={base && <Delta now={totals.flexible} base={base.flexible} fmt={fmt} blur={blur} />} base={base && baseText(base.flexible)} />
                <Figure label={t('rvFixed')} value={fmt(totals.fixed)} blur={blur}
                  delta={base && <Delta now={totals.fixed} base={base.fixed} fmt={fmt} blur={blur} />} base={base && baseText(base.fixed)} />
              </dl>
              {totals.spent > 0 && (
                <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <span className="h-full rounded-s-full bg-primary" style={{ flexGrow: totals.flexible }} />
                  <span className="h-full rounded-e-full bg-chart-2" style={{ flexGrow: totals.fixed }} />
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t('rvFixedHint')}</p>
            </Section>

            {/* Pace through the month */}
            <Section i={3} title={t('rvPace')} aside={review.cumulative.base ? t('rvPaceAgainst', { what: compareLabel }) : null} className="md:col-span-6" id="rv-pace">
              <div className="h-56" dir="ltr">{paceOption && <EChart option={paceOption} className="h-full w-full" ariaLabel={t('rvPace')} />}</div>
            </Section>

            {/* Categories */}
            <Section i={4} title={t('rvCategories')} aside={compareLabel} className="md:col-span-6" id="rv-categories">
              <ul className="divide-y divide-border/40">
                {review.categories.slice(0, TOP_CATEGORIES).map((c) => (
                  <li key={c.category} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{cat(c.category)}</p>
                      <ShareBar share={c.share} className="mt-1.5 max-w-[14rem]" tone={c.budget && c.budget.ratio > 1 ? 'bg-danger' : 'bg-primary'} />
                    </div>
                    <span className="text-end text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(c.now)}</BlurValue></span>
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                      {c.budget && <span className={cn('truncate tabular-nums', c.budget.ratio > 1 ? 'text-danger' : '')}>{t('rvOfBudget', { pct: pct(c.budget.ratio) })}</span>}
                      <span className="tabular-nums">{pct(c.share)}</span>
                    </span>
                    <span className="flex items-center justify-end gap-2.5">
                      <Sparkline values={c.spark} className="hidden text-foreground sm:block" />
                      <Delta now={c.now} base={c.base} fmt={fmt} blur={blur} />
                    </span>
                  </li>
                ))}
              </ul>
              {review.categories.length > TOP_CATEGORIES && (
                <p className="mt-2 text-xs text-muted-foreground">{t('rvMoreCategories', { n: review.categories.length - TOP_CATEGORIES })}</p>
              )}
            </Section>

            {/* Budgets */}
            {review.budgets.list.length > 0 && (
              <Section i={5} title={t('rvBudgets')} aside={t('rvBudgetsKept', { kept: review.budgets.kept, total: review.budgets.list.length })} className="md:col-span-3" id="rv-budgets">
                <ul className="space-y-3">
                  {review.budgets.list.map((b) => (
                    <li key={b.category}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-foreground">{cat(b.category)}</span>
                        <span className={cn('shrink-0 tabular-nums', b.ratio > 1 ? 'font-semibold text-danger' : 'text-muted-foreground')} dir="ltr">
                          <BlurValue blur={blur}>{fmt(b.used)} / {fmt(b.limit)}</BlurValue>
                        </span>
                      </div>
                      <ShareBar share={b.ratio} className="mt-1.5 h-2" tone={b.ratio > 1 ? 'bg-danger' : b.ratio > 0.85 ? 'bg-warning' : 'bg-success'} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Places */}
            {review.merchants.length > 0 && (
              <Section i={5} title={t('rvPlaces')} className={review.budgets.list.length ? 'md:col-span-3' : 'md:col-span-6'} id="rv-places">
                <ul className="divide-y divide-border/40">
                  {review.merchants.slice(0, TOP_MERCHANTS).map((m) => (
                    <li key={m.key} className="flex min-h-11 items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                          {m.isNew && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{t('rvNew')}</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{t('rvTimes', { n: m.count })}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(m.now)}</BlurValue></span>
                      {m.base !== null && m.base > 0 && <Delta now={m.now} base={m.base} fmt={fmt} blur={blur} />}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Day by day */}
            <Section i={6} title={t('rvDays')} className="md:col-span-3" id="rv-days">
              <DayHeat
                month={month} perDay={review.perDay} elapsed={review.elapsed} noSpend={freeDays}
                weekStart={weekStart} weekdayNames={weekdayNames} fmt={fmt} blur={blur} t={t}
              />
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-success/[0.08] p-2.5">
                  <dt className="text-[11px] text-muted-foreground">{t('rvNoSpendDays')}</dt>
                  <dd className="text-lg font-bold tabular-nums text-success">{review.noSpend.free}</dd>
                </div>
                <div className="rounded-2xl bg-foreground/[0.04] p-2.5">
                  <dt className="text-[11px] text-muted-foreground">{t('rvPerDay')}</dt>
                  <dd className="text-lg font-bold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(totals.flexible / Math.max(1, review.elapsed))}</BlurValue></dd>
                </div>
                <div className="rounded-2xl bg-foreground/[0.04] p-2.5">
                  <dt className="text-[11px] text-muted-foreground">{t('rvBusiest')}</dt>
                  <dd className="text-lg font-bold tabular-nums text-foreground">{review.busiest ? review.busiest.day : '—'}</dd>
                </div>
              </dl>
            </Section>

            {/* Weekday rhythm */}
            <Section i={6} title={t('rvWeekdays')} aside={topWeekday ? t('rvTopWeekday', { day: weekdayLong(topWeekday.weekday) }) : null} className="md:col-span-3" id="rv-weekdays">
              <ul className="space-y-2.5">
                {weekOrder.map((wd) => {
                  const w = review.weekdays[wd];
                  return (
                    <li key={wd} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(2026, 1, 1 + wd))}</span>
                      <ShareBar share={w.average / maxWeekday} className="h-2" tone={topWeekday?.weekday === wd ? 'bg-primary' : 'bg-primary/45'} />
                      <span className="min-w-[4rem] text-end tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(w.average)}</BlurValue></span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{t('rvWeekdaysHint')}</p>
            </Section>

            {/* Biggest purchases */}
            {review.biggest.length > 0 && (
              <Section i={7} title={t('rvBiggest')} className="md:col-span-3" id="rv-biggest">
                <ol className="space-y-1">
                  {review.biggest.map((b, i) => (
                    <li key={b.id || i} className="flex min-h-11 items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{b.description || cat(b.category)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{cat(b.category)} · {dayLabel(b.date)}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(b.amount)}</BlurValue></span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {/* Income */}
            {review.income.length > 0 && (
              <Section i={7} title={t('rvIncome')} className="md:col-span-3" id="rv-income">
                <ul className="divide-y divide-border/40">
                  {review.income.map((c) => (
                    <li key={c.category} className="flex min-h-11 items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{cat(c.category)}</span>
                      <span className="text-sm font-semibold tabular-nums text-success" dir="ltr"><BlurValue blur={blur}>{fmt(c.now)}</BlurValue></span>
                      <Delta now={c.now} base={c.base} goodWhen="up" fmt={fmt} blur={blur} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Who paid and with what */}
            {(review.people.length > 1 || review.paymentMethods.length > 1) && (
              <Section i={8} title={review.people.length > 1 ? t('rvWhoPaid') : t('rvHowPaid')} className="md:col-span-3" id="rv-paid">
                {review.people.length > 1 && (
                  <ul className="space-y-3">
                    {review.people.map((p) => (
                      <li key={p.email}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate font-medium text-foreground">{p.name}</span>
                          <span className="tabular-nums text-muted-foreground">{pct(p.share)} · <BlurValue blur={blur}>{fmt(p.amount)}</BlurValue></span>
                        </div>
                        <ShareBar share={p.share} className="mt-1.5 h-2" />
                      </li>
                    ))}
                  </ul>
                )}
                {review.paymentMethods.length > 1 && (
                  <ul className={cn('space-y-2', review.people.length > 1 && 'mt-5 border-t border-border/40 pt-4')}>
                    {review.paymentMethods.slice(0, 5).map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-foreground/90">{m.name || t('rvOtherMethod')}</span>
                        <span className="tabular-nums text-muted-foreground">{pct(m.share)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* Year to date */}
            <Section i={8} title={t('rvYearToDate', { year: month.getFullYear() })} className={review.people.length > 1 || review.paymentMethods.length > 1 ? 'md:col-span-3' : 'md:col-span-6'} id="rv-ytd">
              <dl className="grid grid-cols-3 gap-3">
                <Figure label={t('rvSpent')} value={fmt(review.ytd.now.spent)} blur={blur}
                  delta={review.ytd.before && <Delta now={review.ytd.now.spent} base={review.ytd.before.spent} fmt={fmt} blur={blur} />} />
                <Figure label={t('rvEarned')} value={fmt(review.ytd.now.earned)} blur={blur} tone="text-success"
                  delta={review.ytd.before && <Delta now={review.ytd.now.earned} base={review.ytd.before.earned} goodWhen="up" fmt={fmt} blur={blur} />} />
                <Figure label={review.ytd.now.net >= 0 ? t('rvKept') : t('rvOverspent')} value={fmt(Math.abs(review.ytd.now.net))} blur={blur}
                  delta={review.ytd.before && <Delta now={review.ytd.now.net} base={review.ytd.before.net} goodWhen="up" fmt={fmt} blur={blur} />} />
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                {review.ytd.before ? t('rvYtdAgainst', { months: review.ytd.months, year: month.getFullYear() - 1 }) : t('rvYtdNoLastYear')}
              </p>
            </Section>

            {/* The story version */}
            <motion.button
              type="button"
              onClick={() => setRecapOpen(true)}
              whileTap={{ scale: 0.98 }}
              className="flex min-h-14 items-center justify-center gap-2 rounded-3xl border border-primary/25 bg-primary/[0.08] px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/[0.14] md:col-span-6"
            >
              <Play className="h-4 w-4 fill-current rtl:-scale-x-100" aria-hidden />
              {t('rvWatchRecap', { month: monthName(month, { month: 'long' }) })}
            </motion.button>
          </div>
        )}
      </div>

      <RecapStories
        open={recapOpen}
        onClose={() => setRecapOpen(false)}
        month={month}
        rows={rows}
        members={isShared ? members : []}
        t={t}
        language={language}
        isRTL={isRTL}
        currency={currency}
        blur={blur}
      />
    </div>
  );
}

export default memo(Review);
