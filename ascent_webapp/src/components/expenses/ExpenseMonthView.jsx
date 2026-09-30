import React, { useMemo, useState, useCallback, memo, useEffect } from 'react';
import { Loader2, Search, X, ChevronDown } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useDonutPalette } from '@/components/charts/DonutChart';
import TransactionList from './TransactionList';
import BudgetProgress from './BudgetProgress';
import BlurValue from '../BlurValue';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useDebounce } from '@/hooks/useDebounce';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
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

function ExpenseMonthView({
  transactions, budgets, cards, categories = [], onEdit, onDelete, onDuplicate, onConfirm,
  isLoading, selectedYear, selectedMonths = [], canEdit = true,
}) {
  const { user, colors, t, language } = useTheme();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'ILS';
  const palette = useDonutPalette();
  const numLocale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const blur = !!user?.blurValues;

  useEffect(() => {
    if (userCurrency) fetchExchangeRates('USD');
  }, [userCurrency, fetchExchangeRates]);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const { members, isShared } = useHousehold();
  const pendingCount = useMemo(() => transactions.filter((x) => x.status === 'pending').length, [transactions]);
  const hasActiveFilters = searchQuery || categoryFilter !== 'all' || personFilter !== 'all' || reviewOnly;

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('all');
    setPersonFilter('all');
    setReviewOnly(false);
  }, []);

  const filteredTransactions = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    return transactions.filter((x) => {
      if (q) {
        const hay = [x.description, x.category, x.notes, x.amount?.toString(), x.paymentMethod, x.type, x.date].map((v) => (v || '').toString().toLowerCase());
        if (!hay.some((v) => v.includes(q))) return false;
      }
      if (categoryFilter !== 'all' && x.category !== categoryFilter) return false;
      if (personFilter !== 'all' && x.created_by !== personFilter) return false;
      if (reviewOnly && x.status !== 'pending') return false;
      return true;
    });
  }, [transactions, debouncedSearchQuery, categoryFilter, personFilter, reviewOnly]);

  const money = useCallback((value, currency) => new Intl.NumberFormat(numLocale, {
    style: 'currency', currency: currency || userCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value || 0), [numLocale, userCurrency]);

  const toUser = useCallback((x) => {
    if (x.amountInGlobalCurrency !== null && x.amountInGlobalCurrency !== undefined) return x.amountInGlobalCurrency;
    if (x.currency === userCurrency) return x.amount;
    if (rates && Object.keys(rates).length > 0) return convertCurrency(x.amount, x.currency || 'USD', userCurrency, rates);
    return 0;
  }, [userCurrency, rates, convertCurrency]);

  const metrics = useMemo(() => {
    let income = 0;
    let expenses = 0;
    transactions.forEach((x) => {
      if (x.type === 'Income') income += toUser(x);
      else if (x.type === 'Expense') expenses += toUser(x);
    });
    return { income, expenses, net: income - expenses };
  }, [transactions, toUser]);

  const categoryRows = useMemo(() => {
    const totals = {};
    filteredTransactions.forEach((x) => {
      if (x.type === 'Expense') totals[x.category] = (totals[x.category] || 0) + toUser(x);
    });
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ key: name, name: translateCategory(name, language), value, color: palette[i % palette.length] || '#888' }));
  }, [filteredTransactions, toUser, language, palette]);

  const methodRows = useMemo(() => {
    const groups = {};
    const cardIdx = new Map();
    const cardLabel = t('card');
    transactions.forEach((x) => {
      if (x.type !== 'Expense') return;
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
  }, [transactions, toUser, cards, blur, t]);

  const categoryTotal = useMemo(() => categoryRows.reduce((s, r) => s + r.value, 0), [categoryRows]);
  const methodTotal = useMemo(() => methodRows.reduce((s, r) => s + r.value, 0), [methodRows]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className={cn("h-8 w-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  const flow = metrics.income + metrics.expenses;
  const incomeShare = flow > 0 ? (metrics.income / flow) * 100 : 50;
  const netTone = metrics.net >= 0 ? 'text-success' : 'text-danger';
  const showBudget = budgets?.length > 0;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <motion.section
        className="order-1 rounded-3xl bg-gradient-to-b from-primary/[0.12] to-foreground/[0.03] p-5 sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        aria-label={t('net')}
      >
        <p className="text-sm text-muted-foreground">{t('net')}</p>
        <p className={cn("mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl", netTone)} dir="ltr">
          {blur ? <BlurValue blur /> : (
            <NumberFlow value={metrics.net} locales={numLocale} trend={0} format={{ style: 'currency', currency: userCurrency, maximumFractionDigits: 0 }} />
          )}
        </p>
        <div className="mt-5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <motion.span className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${incomeShare}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden className="h-2 w-2 rounded-full bg-success" />{t('income')}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(metrics.income)}</BlurValue></dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden className="h-2 w-2 rounded-full bg-foreground/30" />{t('expenses')}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{money(metrics.expenses)}</BlurValue></dd>
          </div>
        </dl>
      </motion.section>

      {showBudget && (
        <div className="order-2">
          <BudgetProgress budgets={budgets} transactions={transactions} formatCurrency={money} selectedYear={selectedYear} selectedMonths={selectedMonths} />
        </div>
      )}

      <div className="order-4 grid grid-cols-1 gap-4 md:order-3 md:grid-cols-2">
        {categoryRows.length > 0 && <Breakdown title={t('expensesByCategory')} rows={categoryRows} total={categoryTotal} format={money} blur={blur} />}
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

          {(canEdit && pendingCount > 0) || isShared ? (
            <div role="group" aria-label={t('filterByPerson')} className={scrollStrip}>
              {canEdit && pendingCount > 0 && (
                <Chip active={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
                  {t('needsReview')}
                  <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{pendingCount}</span>
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
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onConfirm={onConfirm}
            canEdit={canEdit}
          />
        </div>
      </section>
    </div>
  );
}

export default memo(ExpenseMonthView);
