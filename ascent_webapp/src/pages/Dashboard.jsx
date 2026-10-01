import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import EChart, { useChartTokens, withAlpha } from '@/components/charts/EChart';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { useMoney } from '@/hooks/useWorkspaceData';
import { translateCategory } from '@/lib/translations';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';
import { useHousehold } from '@/hooks/useHousehold';
import { useInsights } from '@/components/insights/useInsights';
import SafeToSpendCard from '@/components/insights/SafeToSpendCard';
import SubscriptionsCard from '@/components/insights/SubscriptionsCard';
import HouseholdBalanceCard from '@/components/insights/HouseholdBalanceCard';
import CommitmentsCard from '@/components/insights/CommitmentsCard';
import AssistantBar from '@/components/insights/AssistantBar';
import { useTransactions } from '@/lib/offline/txOutbox';
import RecapStories from '@/components/recap/RecapStories';
import { RecapRingButton, RecapBanner, useRecapSeen } from '@/components/recap/RecapEntry';
import { buildRecap, recapToOffer, monthKeyOf } from '@/lib/recap';

const MAX_CATEGORY_SLICES = 6;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Glass card surface shared by all tiles
const tile = 'relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-12px_hsl(0_0%_0%/0.5)]';

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }),
};

function Tile({ i = 0, className, children }) {
  return (
    <motion.section className={cn(tile, className)} variants={rise} initial="hidden" animate="show" custom={i}>
      {children}
    </motion.section>
  );
}

function Money({ value, locale, currency, blur, className }) {
  if (blur) return <BlurValue blur className={className} />;
  return (
    <NumberFlow
      className={className}
      value={value}
      locales={locale}
      format={{ style: 'currency', currency, maximumFractionDigits: 0 }}
      trend={0}
    />
  );
}

export default function Dashboard() {
  const { user, t, language, isRTL } = useTheme();
  const tokens = useChartTokens();
  const userCurrency = user?.currency || 'ILS';
  const blur = !!user?.blurValues;

  // Same cache as the Expenses page, with changes still waiting on this device drawn in
  const { data: transactions = [], isLoading } = useTransactions();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { amountOf: toUserCurrency, convert: convertOrNull } = useMoney(userCurrency);

  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const fmtMoney = useCallback((v) => new Intl.NumberFormat(locale, {
    style: 'currency', currency: userCurrency, maximumFractionDigits: 0,
  }).format(v || 0), [locale, userCurrency]);
  const fmtCompact = useCallback((v) => new Intl.NumberFormat(locale, { notation: 'compact' }).format(v), [locale]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(selectedMonth),
    [locale, selectedMonth]
  );

  const normalized = useMemo(() => transactions
    .filter((tx) => tx?.date)
    .map((tx) => ({
      ...tx,
      _month: String(tx.date).slice(0, 7),
      _day: parseInt(String(tx.date).slice(8, 10), 10),
      _amount: toUserCurrency(tx),
    })), [transactions, toUserCurrency]);

  // Budgets and plans keep their own currency; everything on this page is shown in the user's
  // (shown as is until rates arrive, rather than as zero)
  const convert = useCallback((amount, from) => (amount ? convertOrNull(amount, from) ?? amount : 0), [convertOrNull]);

  const { isShared, members } = useHousehold();
  const { forecast, subscriptions, balances, commitments } = useInsights({ rows: normalized, selectedMonth, convert });
  const showForecast = forecast.phase === 'current';

  const selectedKey = monthKey(selectedMonth);
  const prevKey = monthKey(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  const monthTx = useMemo(() => normalized.filter((tx) => tx._month === selectedKey), [normalized, selectedKey]);

  const sums = useCallback((list) => {
    const income = list.filter((x) => x.type === 'Income').reduce((s, x) => s + x._amount, 0);
    const expenses = list.filter((x) => x.type === 'Expense').reduce((s, x) => s + x._amount, 0);
    return { income, expenses, net: income - expenses };
  }, []);

  const kpis = useMemo(() => {
    const cur = sums(monthTx);
    const prev = sums(normalized.filter((tx) => tx._month === prevKey));
    const savingsRate = cur.income > 0 ? Math.max(-100, Math.min(100, (cur.net / cur.income) * 100)) : null;
    const expenseDelta = prev.expenses > 0 ? ((cur.expenses - prev.expenses) / prev.expenses) * 100 : null;
    return { ...cur, savingsRate, expenseDelta };
  }, [monthTx, normalized, prevKey, sums]);

  const categoryData = useMemo(() => {
    const totals = {};
    monthTx.filter((x) => x.type === 'Expense').forEach((x) => {
      const key = x.category || 'other';
      totals[key] = (totals[key] || 0) + x._amount;
    });
    const sorted = Object.entries(totals)
      .map(([key, value]) => ({ key, name: translateCategory(key, language), value }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= MAX_CATEGORY_SLICES) return sorted;
    const head = sorted.slice(0, MAX_CATEGORY_SLICES - 1);
    const rest = sorted.slice(MAX_CATEGORY_SLICES - 1).reduce((s, c) => s + c.value, 0);
    return [...head, { key: '__other', name: t('dashOtherCategories'), value: rest }];
  }, [monthTx, language, t]);

  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(d), income: 0, expenses: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    normalized.forEach((tx) => {
      const m = byKey[tx._month];
      if (!m) return;
      if (tx.type === 'Income') m.income += tx._amount;
      else if (tx.type === 'Expense') m.expenses += tx._amount;
    });
    return months;
  }, [normalized, selectedMonth, locale]);

  const dailyData = useMemo(() => {
    const days = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const perDay = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }));
    monthTx.filter((x) => x.type === 'Expense').forEach((x) => {
      if (x._day >= 1 && x._day <= days) perDay[x._day - 1].amount += x._amount;
    });
    let running = 0;
    return perDay.map((d) => { running += d.amount; return { ...d, cumulative: running }; });
  }, [monthTx, selectedMonth]);

  const recent = useMemo(() => [...monthTx].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6), [monthTx]);

  // ---- Monthly Recap ----
  // The header button plays the month on screen; in the first week of a month a card offers last
  // month's; the home-screen shortcut (?recap=1) opens the last finished month.
  const { seen: recapSeen, markSeen: markRecapSeen } = useRecapSeen();
  const [recapMonth, setRecapMonth] = useState(null);
  const [params, setParams] = useSearchParams();
  const offered = useMemo(() => recapToOffer(new Date()), []);
  const offeredRecap = useMemo(
    () => (offered ? buildRecap({ rows: normalized, month: offered }) : null),
    [offered, normalized]
  );
  const showRecapBanner = !!offeredRecap && !offeredRecap.isEmpty && !recapSeen.has(offeredRecap.key);
  const openRecap = useCallback((month) => {
    markRecapSeen(monthKeyOf(month));
    setRecapMonth(month);
  }, [markRecapSeen]);
  useEffect(() => {
    if (params.get('recap') !== '1') return;
    const now = new Date();
    openRecap(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    params.delete('recap');
    setParams(params, { replace: true });
  }, [params, setParams, openRecap]);
  const selectedRecapFresh = monthKeyOf(selectedMonth) < monthKeyOf(new Date()) && !recapSeen.has(monthKeyOf(selectedMonth));

  const shiftMonth = (delta) => setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const hasData = monthTx.length > 0;

  // ---------- ECharts options ----------
  const baseTooltip = useMemo(() => tokens && ({
    backgroundColor: tokens.popover,
    borderColor: tokens.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: tokens.text, fontFamily: tokens.fontFamily, fontSize: 12 },
    extraCssText: 'border-radius:12px;backdrop-filter:blur(8px);box-shadow:0 12px 32px -8px rgba(0,0,0,.5);',
  }), [tokens]);

  const donutOption = useMemo(() => {
    if (!tokens) return null;
    const palette = [...tokens.series, tokens.muted, tokens.primary];
    return {
      animationDuration: 900,
      animationEasing: 'cubicOut',
      tooltip: blur ? { show: false } : { ...baseTooltip, trigger: 'item', formatter: (p) => `${p.marker} ${p.name}<br/><b>${fmtMoney(p.value)}</b> · ${p.percent}%` },
      title: blur ? undefined : {
        text: fmtMoney(kpis.expenses), subtext: t('expenses'), left: 'center', top: '38%',
        textStyle: { color: tokens.text, fontSize: 20, fontWeight: 700, fontFamily: tokens.fontFamily },
        subtextStyle: { color: tokens.muted, fontSize: 12, fontFamily: tokens.fontFamily },
      },
      series: [{
        type: 'pie',
        radius: ['62%', '88%'],
        center: ['50%', '50%'],
        padAngle: 3,
        itemStyle: { borderRadius: 10, borderColor: 'transparent' },
        label: { show: false },
        emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 24, shadowColor: 'rgba(0,0,0,.35)' } },
        data: categoryData.map((c, i) => ({ name: c.name, value: c.value, itemStyle: { color: palette[i % palette.length] } })),
      }],
    };
  }, [tokens, baseTooltip, categoryData, kpis.expenses, fmtMoney, blur, t]);

  const barOption = useMemo(() => {
    if (!tokens) return null;
    const grad = (c) => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c }, { offset: 1, color: withAlpha(c, 0.35) }] });
    return {
      animationDuration: 900,
      animationEasing: 'cubicOut',
      grid: { left: 4, right: 4, top: 16, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: tokens.grid } },
        formatter: (ps) => `${ps[0].axisValueLabel}<br/>${ps.map((p) => `${p.marker} ${p.seriesName}: <b>${fmtMoney(p.value)}</b>`).join('<br/>')}`,
      },
      xAxis: { type: 'category', data: monthlyData.map((m) => m.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: tokens.muted, fontFamily: tokens.fontFamily } },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: fmtCompact, fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: [
        { name: t('income'), type: 'bar', barMaxWidth: 18, itemStyle: { borderRadius: [8, 8, 2, 2], color: grad(tokens.success) }, data: monthlyData.map((m) => m.income) },
        { name: t('expenses'), type: 'bar', barMaxWidth: 18, itemStyle: { borderRadius: [8, 8, 2, 2], color: grad(tokens.danger) }, data: monthlyData.map((m) => m.expenses) },
      ],
    };
  }, [tokens, baseTooltip, monthlyData, fmtMoney, fmtCompact, blur, t]);

  const areaOption = useMemo(() => {
    if (!tokens) return null;
    return {
      animationDuration: 1100,
      animationEasing: 'cubicOut',
      grid: { left: 4, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: blur ? { show: false } : {
        ...baseTooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: tokens.primary, type: 'dashed' } },
        formatter: (ps) => {
          const lines = ps.filter((p) => p.value !== null && p.value !== undefined && p.seriesName !== 'band-floor').map((p) => {
            if (p.seriesName !== t('dashForecastBand')) return `${p.marker} ${p.seriesName}: <b>${fmtMoney(p.value)}</b>`;
            const day = forecast.path[p.dataIndex];
            return `${p.marker} ${p.seriesName}: <b>${fmtMoney(day.low)} – ${fmtMoney(day.high)}</b>`;
          });
          return `${ps[0].axisValue}<br/>${lines.join('<br/>')}`;
        },
      },
      xAxis: { type: 'category', boundaryGap: false, data: dailyData.map((d) => d.day), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: tokens.muted, fontFamily: tokens.fontFamily } },
      yAxis: { type: 'value', show: !blur, axisLabel: { color: tokens.muted, formatter: fmtCompact, fontFamily: tokens.fontFamily }, splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } } },
      series: [
        {
          name: t('dashCumulative'), type: 'line', smooth: 0.35, symbol: 'none', z: 3,
          lineStyle: { width: 3, color: tokens.primary, shadowBlur: 14, shadowColor: tokens.primary },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: withAlpha(tokens.primary, 0.35) }, { offset: 1, color: withAlpha(tokens.primary, 0) }] } },
          // This month: what really went out up to today; the forecast draws the rest
          data: showForecast ? forecast.path.map((p) => p.actual) : dailyData.map((d) => d.cumulative),
        },
        {
          name: t('dashDailySpending'), type: 'bar', barMaxWidth: 8, itemStyle: { borderRadius: [4, 4, 0, 0], color: withAlpha(tokens.series[1], 0.55) },
          data: dailyData.map((d) => (showForecast && d.day > forecast.elapsed ? null : d.amount)),
        },
        ...(showForecast ? [
          // Likely range: an invisible floor with the band stacked on top of it
          { name: 'band-floor', type: 'line', stack: 'band', symbol: 'none', smooth: 0.35, lineStyle: { opacity: 0 }, tooltip: { show: false }, silent: true,
            data: forecast.path.map((p) => p.low) },
          { name: t('dashForecastBand'), type: 'line', stack: 'band', symbol: 'none', smooth: 0.35, lineStyle: { opacity: 0 }, silent: true,
            areaStyle: { color: withAlpha(tokens.primary, 0.1) },
            data: forecast.path.map((p) => (p.high === null || p.low === null ? null : p.high - p.low)) },
          { name: t('dashForecast'), type: 'line', smooth: 0.35, symbol: 'none', z: 4,
            lineStyle: { width: 2, type: [6, 5], color: tokens.primary },
            data: forecast.path.map((p) => p.expected) },
        ] : []),
      ],
    };
  }, [tokens, baseTooltip, dailyData, fmtMoney, fmtCompact, blur, t, showForecast, forecast]);

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  const muted = 'text-muted-foreground';
  const empty = (
    <div className={cn('flex h-full min-h-[200px] items-center justify-center text-sm', muted)}>{t('dashNoDataMonth')}</div>
  );

  const stat = (label, value, Icon, tone) => (
    <Tile className="p-5" i={2}>
      <div className="flex items-center justify-between">
        <span className={cn('text-sm', muted)}>{label}</span>
        <span className={cn('grid h-8 w-8 place-items-center rounded-xl bg-foreground/5', tone)}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </Tile>
  );

  return (
    <div className="relative">
      {/* ambient glow behind the page */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[460px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.20),transparent_70%)]" />

      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-28 md:p-8 md:pb-10">
        <motion.header className="flex flex-wrap items-end justify-between gap-4" variants={rise} initial="hidden" animate="show">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('dashboard')}</h1>
            <p className={cn('mt-1 text-sm', muted)}>{t('dashSubtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
          <RecapRingButton onOpen={() => openRecap(selectedMonth)} fresh={selectedRecapFresh && hasData} label={t('rcButton')} />
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 backdrop-blur-xl">
            <button type="button" aria-label={t('dashPrevMonth')} onClick={() => shiftMonth(-1)}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 sm:h-9 sm:w-9">
              <PrevIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">{monthLabel}</span>
            <button type="button" aria-label={t('dashNextMonth')} onClick={() => shiftMonth(1)}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 sm:h-9 sm:w-9">
              <NextIcon className="h-4 w-4" />
            </button>
          </div>
          </div>
        </motion.header>

        {showRecapBanner && (
          <RecapBanner
            monthName={new Intl.DateTimeFormat(locale, { month: 'long' }).format(offered)}
            recap={offeredRecap}
            onOpen={() => openRecap(offered)}
            onDismiss={() => markRecapSeen(offeredRecap.key)}
            t={t}
            fmt={fmtMoney}
            blur={blur}
          />
        )}

        <AssistantBar />

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
          {/* Headline: what is left to spend, together */}
          <Tile i={1} className="md:col-span-3">
            <SafeToSpendCard forecast={forecast} isShared={isShared} />
          </Tile>

          {/* Net + cumulative curve, with the forecast for the rest of this month */}
          <Tile i={1} className="p-6 md:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-sm', muted)}>{t('netAmount')}</p>
                <div className={cn('mt-2 text-4xl font-bold tracking-tight md:text-5xl', kpis.net < 0 && 'text-danger')}>
                  {isLoading ? '…' : <Money value={kpis.net} locale={locale} currency={userCurrency} blur={blur} />}
                </div>
              </div>
              {kpis.expenseDelta !== null && (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                  kpis.expenseDelta <= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                )}>
                  {kpis.expenseDelta <= 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  {Math.abs(kpis.expenseDelta).toFixed(0)}% {t('expenses')}
                </span>
              )}
            </div>
            <div className="mt-4 h-52 md:h-64" dir="ltr">
              {hasData && areaOption ? <EChart option={areaOption} className="h-full w-full" ariaLabel={t('dashDailySpending')} /> : empty}
            </div>
          </Tile>

          {/* Stat row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:col-span-6 md:gap-5">
            {stat(t('income'), <Money value={kpis.income} locale={locale} currency={userCurrency} blur={blur} />, TrendingUp, 'text-success')}
            {stat(t('expenses'), <Money value={kpis.expenses} locale={locale} currency={userCurrency} blur={blur} />, TrendingDown, 'text-danger')}
            {stat(t('savingsRate'),
              kpis.savingsRate === null ? '—' : <NumberFlow value={kpis.savingsRate / 100} locales={locale} format={{ style: 'percent', maximumFractionDigits: 0 }} trend={0} />,
              PiggyBank, 'text-primary')}
          </div>

          {/* Loans and commitments: what is owed, what leaves each month, when it ends */}
          <Tile i={3} className="md:col-span-6">
            <CommitmentsCard commitments={commitments} convert={convert} />
          </Tile>

          {isShared && (
            <Tile i={3} className="md:col-span-3 xl:col-span-2">
              <HouseholdBalanceCard balances={balances} />
            </Tile>
          )}
          <Tile i={3} className={isShared ? 'md:col-span-3 xl:col-span-4' : 'md:col-span-6'}>
            <SubscriptionsCard subscriptions={subscriptions} />
          </Tile>

          {/* Categories */}
          <Tile i={3} className="p-6 md:col-span-3">
            <h2 className="text-base font-semibold">{t('dashSpendingByCategory')}</h2>
            {categoryData.length === 0 ? <div className="h-64">{empty}</div> : (
              <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-56 w-56 shrink-0">
                  {donutOption && <EChart option={donutOption} className="h-full w-full" ariaLabel={t('dashSpendingByCategory')} />}
                </div>
                <ul className="w-full space-y-2.5 text-sm">
                  {categoryData.map((c, i) => (
                    <li key={c.key} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tokens ? [...tokens.series, tokens.muted, tokens.primary][i % 7] : undefined }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="font-medium tabular-nums"><BlurValue blur={blur}>{fmtMoney(c.value)}</BlurValue></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Tile>

          {/* Income vs expenses */}
          <Tile i={4} className="p-6 md:col-span-3">
            <h2 className="text-base font-semibold">{t('dashIncomeVsExpenses')}</h2>
            <div className="mt-2 h-64" dir="ltr">
              {barOption && <EChart option={barOption} className="h-full w-full" ariaLabel={t('dashIncomeVsExpenses')} />}
            </div>
          </Tile>

          {/* Recent */}
          <Tile i={5} className="p-6 md:col-span-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{t('dashRecentTransactions')}</h2>
              <Link to={createPageUrl('Expenses')} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">{t('dashViewAll')}</Link>
            </div>
            {recent.length === 0 ? <div className="h-40">{empty}</div> : (
              <ul className="mt-3 divide-y divide-border/50">
                {recent.map((tx) => (
                  <li key={tx.id || tx._id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', tx.type === 'Income' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                        {tx.type === 'Income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tx.description || translateCategory(tx.category, language)}</p>
                        <p className={cn('text-xs', muted)}>{translateCategory(tx.category, language)} · {String(tx.date).slice(0, 10)}</p>
                      </div>
                    </div>
                    <span className={cn('text-sm font-semibold tabular-nums', tx.type === 'Income' ? 'text-success' : 'text-foreground')}>
                      <BlurValue blur={blur}>{tx.type === 'Income' ? '+' : '-'}{fmtMoney(tx._amount)}</BlurValue>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>
        </div>
      </div>

      <RecapStories
        open={!!recapMonth}
        onClose={() => setRecapMonth(null)}
        month={recapMonth || selectedMonth}
        rows={normalized}
        members={isShared ? members : []}
        t={t}
        language={language}
        isRTL={isRTL}
        currency={userCurrency}
        blur={blur}
      />
    </div>
  );
}
