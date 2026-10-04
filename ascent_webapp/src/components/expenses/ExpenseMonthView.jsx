import React, { useMemo, useState, useCallback, memo } from 'react';
import { Loader2, Search, X, ChevronDown, ShoppingBag } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { motion } from '@/lib/motion';
import { useDonutPalette } from '@/components/charts/DonutChart';
import TransactionList from './TransactionList';
import BudgetProgress from './BudgetProgress';
import BigPurchases from './BigPurchases';
import PlannedPayments from './PlannedPayments';
import BlurValue from '../BlurValue';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useDebounce } from '@/hooks/useDebounce';
import { useMoney } from '@/hooks/useWorkspaceData';
import { useHousehold } from '@/hooks/useHousehold';

const CARD_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#EF4444', '#6366F1', '#F97316'];
const METHOD_COLORS = { Cash: '#10B981', Transfer: '#A78BFA', Paybox: '#F59E0B', PayPal: '#06B6D4', Bit: '#EAB308' };
const TOP_ROWS = 4;

const scrollStrip = "flex gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_10px,#000_calc(100%-10px),transparent)]";

function Chip({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-[background-color,color,transform] duration-200 active:scale-95 sm:min-h-9 sm:px-3.5",
        active ? "bg-primary/15 text-primary" : "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function Breakdown({ title, rows, total, format, blur }) {
  const [open, setOpen] = useState(false);
  const list = open ? rows : rows.slice(0, TOP_ROWS);
  return (
    <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={title}>
        {rows.map((r) => (
          <motion.span
            key={r.key}
            className="h-full first:rounded-s-full last:rounded-e-full"
            style={{ backgroundColor: r.color }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: r.value }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <ul className="mt-3 divide-y divide-border/30">
        {list.map((r) => (
          <li key={r.key} className="flex min-h-11 items-center gap-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{r.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{total > 0 ? Math.round((r.value / total) * 100) : 0}%</span>
            <span className="min-w-[4.5rem] text-end text-sm font-semibold tabular-nums text-foreground" dir="ltr">
              <BlurValue blur={blur}>{format(r.value)}</BlurValue>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > TOP_ROWS && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mx-auto mt-1 grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
          <ChevronDown className={cn("h-5 w-5 transition-transform duration-300", open && "rotate-180")} />
        </button>
      )}
    </section>
  );
}

function Stat({ dot, label, value, tone, blur }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        {dot && <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}{label}
      </dt>
      <dd className={cn("mt-0.5 truncate text-lg font-semibold tabular-nums", tone || "text-foreground")} dir="ltr">
        <BlurValue blur={blur}>{value}</BlurValue>
      </dd>
    </div>
  );
}

function ExpenseMonthView({
  kind = 'Expense', transactions, allTransactions = [], counterpart = [], budgets, cards, categories = [], plans = [],
  onEdit, onDelete, onDuplicate, onConfirm, isLoading, selectedYear, selectedMonths = [], canEdit = true, onManageBudgets, canEditBudgets = false,
}) {
  const isIncome = kind === 'Income';
  const { user, colors, t, language } = useTheme();
  const userCurrency = user?.currency || 'ILS';
  const { amountOf: toUser } = useMoney(userCurrency);
  const palette = useDonutPalette();
  const numLocale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const blur = !!user?.blurValues;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bigOnly, setBigOnly] = useState(false);
  const { members, isShared } = useHousehold();
  const pendingCount = useMemo(() => transactions.filter((x) => x.status === 'pending').length, [transactions]);
  const bigCount = useMemo(() => (isIncome ? 0 : transactions.filter((x) => x.isBigPurchase).length), [transactions, isIncome]);
  const hasActiveFilters = searchQuery || categoryFilter !== 'all' || personFilter !== 'all' || reviewOnly || bigOnly;

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('all');
    setPersonFilter('all');
    setReviewOnly(false);
    setBigOnly(false);
  }, []);

  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  const filteredTransactions = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    return transactions.filter((x) => {
      if (q) {
        const hay = [x.description, x.category, x.notes, x.amount?.toString(), x.paymentMethod, x.date, planById[x.planId]?.name]
          .map((v) => (v || '').toString().toLowerCase());
        if (!hay.some((v) => v.includes(q))) return false;
      }
      if (categoryFilter !== 'all' && x.category !== categoryFilter) return false;
      if (personFilter !== 'all' && x.created_by !== personFilter) return false;
      if (reviewOnly && x.status !== 'pending') return false;
      if (bigOnly && !x.isBigPurchase) return false;
      return true;
    });
  }, [transactions, debouncedSearchQuery, categoryFilter, personFilter, reviewOnly, bigOnly, planById]);

  const money = useCallback((value, currency) => new Intl.NumberFormat(numLocale, {
    style: 'currency', currency: currency || userCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value || 0), [numLocale, userCurrency]);

  const metrics = useMemo(() => {
    let total = 0;
    let big = 0;
    transactions.forEach((x) => {
      const v = toUser(x);
      total += v;
      if (x.isBigPurchase) big += v;
    });
    const other = counterpart.reduce((s, x) => s + toUser(x), 0);
    const income = isIncome ? total : other;
    const expenses = isIncome ? other : total;
    return { total, big, everyday: total - big, income, expenses, net: income - expenses };
  }, [transactions, counterpart, toUser, isIncome]);

  const iconByCategory = useMemo(() => {
    const map = {};
    categories.forEach((c) => { if (c.icon) map[c.nameKey || c.name] = c.icon; });
    return map;
  }, [categories]);

  const categoryRows = useMemo(() => {
    const totals = {};
    filteredTransactions.forEach((x) => { totals[x.category] = (totals[x.category] || 0) + toUser(x); });
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ key: name, name: translateCategory(name, language), value, color: palette[i % palette.length] || '#888' }));
  }, [filteredTransactions, toUser, language, palette]);

  const methodRows = useMemo(() => {
    if (isIncome) return [];
    const groups = {};
    const cardIdx = new Map();
    const cardLabel = t('card');
    transactions.forEach((x) => {
      const amount = toUser(x);
      if (amount <= 0) return;
      const method = x.paymentMethod || 'Other';
      let key = method;
      let name = method;
      let color = METHOD_COLORS[method] || '#9CA3AF';
      if (method === 'Card' && x.cardId) {
        const card = cards.find((c) => c.id === x.cardId);
        if (!cardIdx.has(x.cardId)) cardIdx.set(x.cardId, cardIdx.size);
        key = `Card_${x.cardId}`;
        name = blur ? '••••••' : card ? `${card.name || card.cardName || cardLabel} •••• ${card.lastFourDigits || ''}` : `${cardLabel} ${cardIdx.get(x.cardId) + 1}`;
        color = CARD_COLORS[cardIdx.get(x.cardId) % CARD_COLORS.length];
      }
      if (!groups[key]) groups[key] = { key, name, color, value: 0 };
      groups[key].value += amount;
    });
    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [transactions, toUser, cards, blur, t, isIncome]);

  const categoryTotal = useMemo(() => categoryRows.reduce((s, r) => s + r.value, 0), [categoryRows]);
  const methodTotal = useMemo(() => methodRows.reduce((s, r) => s + r.value, 0), [methodRows]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className={cn("h-8 w-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  // Share of the period's income that went out (Expenses) or was kept (Income)
  const spentShare = metrics.income > 0 ? Math.min(100, (metrics.expenses / metrics.income) * 100) : null;
  const showBudget = !isIncome && budgets?.length > 0;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <motion.section
        className={cn(
          "order-1 rounded-3xl bg-gradient-to-b to-foreground/[0.03] p-5 sm:p-6",
          isIncome ? "from-success/[0.12]" : "from-primary/[0.12]"
        )}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        aria-label={isIncome ? t('totalIncome') : t('totalSpent')}
      >
        <p className="text-sm text-muted-foreground">{isIncome ? t('totalIncome') : t('totalSpent')}</p>
        <p className={cn("mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl", isIncome ? 'text-success' : 'text-foreground')} dir="ltr">
          {blur ? <BlurValue blur /> : (
            <NumberFlow value={metrics.total} locales={numLocale} trend={0} format={{ style: 'currency', currency: userCurrency, maximumFractionDigits: 0 }} />
          )}
        </p>
        {spentShare !== null && (
          <>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
              <motion.span
                className={cn("block h-full rounded-full", isIncome ? "bg-success" : spentShare >= 100 ? "bg-danger" : "bg-primary")}
                initial={{ width: 0 }}
                animate={{ width: `${isIncome ? 100 - spentShare : spentShare}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {isIncome
                ? t('keptOfIncome').replace('{pct}', Math.max(0, Math.round(100 - spentShare)))
                : t('spentOfIncome').replace('{pct}', Math.round((metrics.expenses / metrics.income) * 100))}
            </p>
          </>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-4">
          {isIncome ? (
            <>
              <Stat dot="bg-foreground/30" label={t('spent')} value={money(metrics.expenses)} blur={blur} />
              <Stat
                dot={metrics.net >= 0 ? 'bg-success' : 'bg-danger'}
                label={metrics.net >= 0 ? t('leftOver') : t('overspent')}
                value={money(Math.abs(metrics.net))}
                tone={metrics.net >= 0 ? 'text-success' : 'text-danger'}
                blur={blur}
              />
            </>
          ) : (
            <>
              <Stat dot="bg-primary" label={t('everydaySpending')} value={money(metrics.everyday)} blur={blur} />
              {metrics.big > 0
                ? <Stat dot="bg-chart-4" label={t('bigPurchases')} value={money(metrics.big)} blur={blur} />
                : <Stat dot="bg-success" label={t('income')} value={money(metrics.income)} blur={blur} />}
            </>
          )}
        </dl>
      </motion.section>

      {!isIncome && (
        <div className="order-2 empty:hidden">
          <PlannedPayments plans={plans} selectedYear={selectedYear} selectedMonths={selectedMonths} />
        </div>
      )}

      {showBudget && (
        <div className="order-2">
          <BudgetProgress budgets={budgets} transactions={transactions} formatCurrency={money} selectedYear={selectedYear} selectedMonths={selectedMonths} onManage={onManageBudgets} canEdit={canEditBudgets} />
        </div>
      )}

      {!isIncome && (
        <div className="order-2 empty:hidden">
          <BigPurchases periodRows={transactions} allRows={allTransactions} iconByCategory={iconByCategory} onOpen={onEdit} />
        </div>
      )}

      <div className="order-4 grid grid-cols-1 gap-4 md:order-3 md:grid-cols-2">
        {categoryRows.length > 0 && <Breakdown title={isIncome ? t('incomeBySource') : t('expensesByCategory')} rows={categoryRows} total={categoryTotal} format={money} blur={blur} />}
        {methodRows.length > 0 && <Breakdown title={t('expensesByPaymentMethod')} rows={methodRows} total={methodTotal} format={money} blur={blur} />}
      </div>

      <section className="order-3 md:order-4" aria-label={t('transactions')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('transactions')} <span className="ms-1 text-sm font-normal tabular-nums text-muted-foreground">{filteredTransactions.length}</span>
          </h2>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/10 sm:min-h-9">
              <X className="h-4 w-4" />
              {t('clear')}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder={t('searchTransactions')}
              aria-label={t('searchTransactions')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-full bg-foreground/[0.06] ps-11 pe-11 text-base text-foreground placeholder:text-muted-foreground transition-shadow focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button type="button" aria-label={t('clear')} onClick={() => setSearchQuery('')} className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {(canEdit && pendingCount > 0) || isShared || bigCount > 0 ? (
            <div role="group" aria-label={t('filterByPerson')} className={scrollStrip}>
              {canEdit && pendingCount > 0 && (
                <Chip active={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
                  {t('needsReview')}
                  <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{pendingCount}</span>
                </Chip>
              )}
              {bigCount > 0 && (
                <Chip active={bigOnly} onClick={() => setBigOnly((v) => !v)}>
                  <ShoppingBag aria-hidden className="h-4 w-4" />
                  {t('bigPurchases')}
                </Chip>
              )}
              {isShared && [{ email: 'all', label: t('everyone') }, ...members.map((m) => ({ email: m.email, label: m.isMe ? t('me') : m.name, member: m }))].map((opt) => (
                <Chip key={opt.email} active={personFilter === opt.email} onClick={() => setPersonFilter(opt.email)}>
                  {opt.member && (
                    <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full text-xs font-semibold leading-none text-background" style={{ backgroundColor: opt.member.color }}>
                      {opt.member.initials.slice(0, 1)}
                    </span>
                  )}
                  {opt.label}
                </Chip>
              ))}
            </div>
          ) : null}

          {categories.length > 0 && (
            <div role="group" aria-label={t('categories')} className={scrollStrip}>
              <Chip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>{t('allCategories')}</Chip>
              {categories.map((c) => {
                const value = c.nameKey || c.name;
                return (
                  <Chip key={c.id || c.name} active={categoryFilter === value} onClick={() => setCategoryFilter(categoryFilter === value ? 'all' : value)}>
                    {c.icon && <span aria-hidden>{c.icon}</span>}
                    {translateCategory(value, language)}
                  </Chip>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-2">
          <TransactionList
            transactions={filteredTransactions}
            cards={cards}
            categories={categories}
            plans={planById}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onConfirm={onConfirm}
            canEdit={canEdit}
            emptyTitle={isIncome ? t('noIncomeFound') : t('noExpensesFound')}
          />
        </div>
      </section>
    </div>
  );
}

export default memo(ExpenseMonthView);
