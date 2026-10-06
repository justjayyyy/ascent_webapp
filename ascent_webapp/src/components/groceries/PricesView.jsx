import React, { memo, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Receipt, RotateCcw, Store } from 'lucide-react';
import { motion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { useCategories, useMoney, useReceipts } from '@/hooks/useWorkspaceData';
import { useTransactions } from '@/lib/offline/txOutbox';
import { cn } from '@/lib/utils';
import { ItemEmoji, localeOf, money } from './GroceryParts';
import { basketEstimate, knownStores, priceMovers, priceStats, storeComparison } from './groceryUtils';

// What a price is for: one of it, or a kg (litre...) of it
const per = (point, t) => (point?.unit ? t('grPerUnit', { unit: point.unit }) : t('grEach'));

const card = 'rounded-3xl border border-border/60 bg-card/75 p-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] sm:p-5';
const MONTHS = 6;

// The household's groceries category, whatever it is called
const isGroceries = (categories) => {
  const names = new Set(categories.filter((c) => c.nameKey === 'groceries' || c.name === 'groceries' || /grocer|מכולת|продукт/i.test(c.name)).map((c) => c.name));
  names.add('groceries');
  return (tx) => tx.type === 'Expense' && names.has(tx.category);
};

/**
 * Prices: what the list will probably cost (and at which shop), which shop is cheaper on the same
 * things, what got dearer or cheaper, and the month's grocery spending.
 */
function PricesView({ list, shell }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const currency = user?.currency || 'ILS';
  const blur = !!user?.blurValues;
  const { convert, amountOf } = useMoney(currency);
  const toMine = useCallback((p, c) => (!c || c === currency ? p : convert(p, c)), [convert, currency]);
  const fmt = money(loc, currency);
  const fmt0 = money(loc, currency, 0);
  const { items, onList } = list;

  const estimate = useMemo(() => basketEstimate(onList, { toMine }), [onList, toMine]);
  const byStore = useMemo(() => knownStores(items)
    .map((store) => ({ store, ...basketEstimate(onList, { toMine, store }) }))
    .filter((s) => s.atStore >= Math.max(2, Math.ceil(onList.length / 3)))
    .sort((a, b) => a.total - b.total)
    .slice(0, 4), [items, onList, toMine]);
  const ranking = useMemo(() => storeComparison(items, { toMine }), [items, toMine]);
  const movers = useMemo(() => priceMovers(items, { toMine }), [items, toMine]);
  const priced = useMemo(() => items
    .map((item) => ({ item, stats: priceStats(item, toMine) }))
    .filter((x) => x.stats)
    .sort((a, b) => a.item.name.localeCompare(b.item.name, loc)), [items, toMine, loc]);

  // Grocery spending, month by month
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const months = useMemo(() => {
    const match = isGroceries(categories);
    const now = new Date();
    const out = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat(loc, { month: 'short' }).format(d), amount: 0 };
    });
    const at = Object.fromEntries(out.map((m) => [m.key, m]));
    transactions.forEach((tx) => { if (tx?.date && match(tx) && at[String(tx.date).slice(0, 7)]) at[String(tx.date).slice(0, 7)].amount += amountOf(tx); });
    return out;
  }, [transactions, categories, amountOf, loc]);
  const maxMonth = Math.max(...months.map((m) => m.amount), 1);

  // Receipts read before each line was counted put the whole line's price on an item; reading them again fixes it
  const { data: receipts = [] } = useReceipts();
  const unlined = receipts.filter((r) => r.read && !r.items && String(r.type || '').startsWith('image/')).length;
  const [params, setParams] = useSearchParams();
  const toReceipts = () => { const next = new URLSearchParams(params); next.set('view', 'receipts'); setParams(next, { replace: true }); };
  const spentAny = months.some((m) => m.amount > 0);

  if (!priced.length && !spentAny) {
    return (
      <section className="rounded-3xl bg-foreground/[0.04] px-5 py-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary"><Receipt className="h-6 w-6" /></span>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{t('grPricesEmptyTitle')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('grPricesEmptyHint')}</p>
      </section>
    );
  }

  const hide = (v) => (blur ? '••••' : v);

  return (
    <div className="space-y-4">
      {unlined > 0 && (
        <button type="button" onClick={toReceipts} className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] px-4 py-3 text-start transition-colors hover:bg-primary/[0.1]">
          <RotateCcw className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-foreground">{t('grPricesFromOld', { n: unlined })}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
        </button>
      )}
      {onList.length > 0 && (
        <section className={card} aria-labelledby="gp-list">
          <h2 id="gp-list" className="text-sm text-muted-foreground">{t('grListWillCost')}</h2>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-foreground" dir="ltr">{estimate.priced ? hide(fmt0(estimate.total)) : '—'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('grPricedOf', { n: estimate.priced, all: onList.length })}</p>
          {byStore.length > 1 && (
            <ul className="mt-4 space-y-2">
              {byStore.map((s, i) => (
                <li key={s.store} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate text-foreground">{s.store}</span>
                    {i === 0 && <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">{t('grCheapest')}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">≈ {hide(fmt0(s.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ranking.length > 1 && (
        <section className={card} aria-labelledby="gp-shops">
          <h2 id="gp-shops" className="text-base font-semibold tracking-tight text-foreground">{t('grShopsCompared')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('grShopsComparedHint')}</p>
          <ul className="mt-4 space-y-3">
            {ranking.map((s, i) => {
              const diff = s.index - 1;
              // The cheapest shop's bar is full; the dearest is a third of it
              const lo = ranking[0].index;
              const hi = ranking.at(-1).index;
              const barWidth = (x) => (hi === lo ? 100 : 100 - ((x - lo) / (hi - lo)) * 65);
              return (
                <li key={s.store}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">{s.store}</span>
                    <span className={cn('shrink-0 font-semibold tabular-nums', diff < -0.005 ? 'text-success' : diff > 0.005 ? 'text-warning' : 'text-muted-foreground')}>
                      {Math.abs(diff) < 0.005 ? t('grAboutUsual') : t(diff < 0 ? 'grBelowUsual' : 'grAboveUsual', { pct: Math.round(Math.abs(diff) * 100) })}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="block h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
                      <motion.span
                        className={cn('block h-full rounded-full', i === 0 ? 'bg-success' : 'bg-primary/60')}
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth(s.index)}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t('grItemsCompared', { n: s.items })}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(movers.up.length > 0 || movers.down.length > 0) && (
        <section className={card} aria-labelledby="gp-moves">
          <h2 id="gp-moves" className="text-base font-semibold tracking-tight text-foreground">{t('grPriceMoves')}</h2>
          <ul className="mt-3 divide-y divide-border/50">
            {[...movers.up.slice(0, 5), ...movers.down.slice(0, 5)].map(({ item, stats, change }) => (
              <li key={item.id} className="flex min-h-12 items-center gap-3 py-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.05]"><ItemEmoji item={item} className="text-lg" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">{t('grUsually', { price: hide(fmt(stats.avg)) })}</span>
                </span>
                <span className="text-end">
                  <span className="block text-sm font-semibold tabular-nums text-foreground" dir="ltr">{hide(fmt(stats.last.price))}</span>
                  <span className="block text-[11px] text-muted-foreground">{per(stats.last, t)}</span>
                </span>
                <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', change > 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')} dir="ltr">
                  {change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.round(Math.abs(change) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {spentAny && (
        <section className={card} aria-labelledby="gp-months">
          <h2 id="gp-months" className="text-base font-semibold tracking-tight text-foreground">{t('grSpendByMonth')}</h2>
          <ol className="mt-4 flex h-36 items-end gap-2" dir="ltr">
            {months.map((m, i) => (
              <li key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{m.amount && !blur ? new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 }).format(m.amount) : ''}</span>
                <span className="flex min-h-0 w-full flex-1 items-end justify-center">
                  <motion.span
                    className={cn('w-full max-w-10 rounded-t-lg', i === months.length - 1 ? 'bg-primary' : 'bg-primary/35')}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(2, (m.amount / maxMonth) * 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {priced.length > 0 && (
        <section className={card} aria-labelledby="gp-all">
          <h2 id="gp-all" className="text-base font-semibold tracking-tight text-foreground">{t('grAllPrices')} <span className="ms-1 font-medium tabular-nums text-muted-foreground">{priced.length}</span></h2>
          <ul className="mt-2 divide-y divide-border/50">
            {priced.map(({ item, stats }) => (
              <li key={item.id}>
                <button type="button" onClick={() => shell.openItem(item)} className="flex min-h-12 w-full items-center gap-3 py-2 text-start">
                  <ItemEmoji item={item} className="w-7 text-center text-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[stats.cheapest ? t('grCheapestAt', { store: stats.cheapest.store }) : stats.last.store || '', stats.last.qty ? t('grLastBoughtQty', { qty: stats.last.qty }) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-semibold tabular-nums text-foreground" dir="ltr">{hide(fmt(stats.last.price))}</span>
                    <span className="block text-[11px] text-muted-foreground">{per(stats.last, t)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default memo(PricesView);
