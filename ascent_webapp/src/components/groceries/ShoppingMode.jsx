import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { basketEstimate, groupByAisle, knownStores, pricePoints, priceStats } from './groceryUtils';
import { useMoney } from '@/hooks/useWorkspaceData';

const STORE_KEY = 'ascent_gr_store';
const readStore = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; } };
import { ItemEmoji, WhoDot, localeOf, money, useWho } from './GroceryParts';
import AddBar from './AddBar';

// The phone stays awake while the list is open in the shop
function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => { if (stopped) l.release(); else lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { stopped = true; document.removeEventListener('visibilitychange', take); lock?.release().catch(() => {}); };
  }, [active]);
}

/** Someone else ticked something: "Dana got the eggs". */
function usePartnerTicks(items, me, who, t, active) {
  const seen = useRef(null);
  useEffect(() => {
    if (!active) { seen.current = null; return; }
    const now = new Map(items.map((i) => [i.id, i.inCart]));
    if (seen.current) {
      items.forEach((i) => {
        if (i.inCart && seen.current.get(i.id) === false && i.cartBy && i.cartBy !== me) {
          const person = who.of(i.cartBy);
          toast(t('grPartnerGot', { name: person?.name || '', item: i.name }), { duration: 2500 });
        }
      });
    }
    seen.current = now;
  }, [items, me, who, t, active]);
}

/** What it cost last time here (or anywhere, when it was never bought here), and a cheaper shop if there is one. */
function priceHint(item, store, toMine) {
  const points = pricePoints(item, toMine);
  if (!points.length) return null;
  const want = store.trim().toLowerCase();
  const here = want ? points.filter((p) => p.store.toLowerCase() === want).at(-1) : null;
  const stats = priceStats(item, toMine);
  const cheaper = stats?.cheapest && want && stats.cheapest.store.toLowerCase() !== want && here && here.price - stats.cheapest.avg > 0.05 * here.price
    ? stats.cheapest : null;
  return { price: (here || points.at(-1)).price, here: !!here, cheaper };
}

function ShopRow({ item, who, t, fmt, blur, reduce, onToggle, store, toMine }) {
  const last = priceHint(item, store, toMine);
  const by = item.inCart ? who.of(item.cartBy) : who.of(item.listedBy);
  return (
    <motion.li layout={!reduce} initial={false} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={!!item.inCart}
        aria-label={[item.name, item.qty].filter(Boolean).join(', ')}
        onClick={() => onToggle(item)}
        className={cn('flex min-h-[64px] w-full items-center gap-4 px-4 text-start transition-colors active:bg-foreground/[0.04]', item.inCart && 'opacity-55')}
      >
        <span className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border-2 transition-colors',
          item.inCart ? 'border-success bg-success text-background' : 'border-input'
        )}>
          {item.inCart && <Check className="h-5 w-5" strokeWidth={3} />}
        </span>
        <ItemEmoji item={item} className="text-2xl" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[17px] font-semibold text-foreground', item.inCart && 'line-through decoration-foreground/40')}>{item.name}</span>
          {(item.qty || item.note || (last && !item.inCart)) && (
            <span className="block truncate text-sm text-muted-foreground">
              {[
                item.qty,
                item.note,
                last && !item.inCart && !blur ? t(last.here ? 'grLastPaidHere' : 'grLastPaid', { price: fmt(last.price) }) : null,
                last?.cheaper && !item.inCart && !blur ? t('grCheaperAt', { store: last.cheaper.store, price: fmt(last.cheaper.avg) }) : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {who.isShared && by && <WhoDot person={by} />}
      </button>
    </motion.li>
  );
}

/** The list in the shop: big rows by aisle, ticked ones drop into the cart, Done when finished. */
export default function ShoppingMode({ open, list, onClose, onDone }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const reduce = useReducedMotion();
  const who = useWho();
  const [adding, setAdding] = useState(false);
  const { onList, toggleCart, addText, putOnList, items, me } = list;
  const todo = useMemo(() => groupByAisle(onList.filter((i) => !i.inCart)), [onList]);
  const cart = useMemo(() => onList.filter((i) => i.inCart), [onList]);
  const total = onList.length;

  // Which shop this is: prices shown are this shop's, and the trip is saved with it
  const currency = user?.currency || 'ILS';
  const { convert } = useMoney(currency);
  const toMine = useCallback((p, c) => (!c || c === currency ? p : convert(p, c)), [convert, currency]);
  const stores = useMemo(() => knownStores(items), [items]);
  const [store, setStore] = useState(readStore);
  const [typing, setTyping] = useState(false);
  const pickStore = (name) => {
    const next = name === store ? '' : name;
    setStore(next);
    try { localStorage.setItem(STORE_KEY, next); } catch { /* storage unavailable */ }
  };
  const estimate = useMemo(() => basketEstimate(onList, { toMine, store }), [onList, toMine, store]);
  const inCartEstimate = useMemo(() => basketEstimate(cart, { toMine, store }), [cart, toMine, store]);

  useWakeLock(open);
  usePartnerTicks(onList, me, who, t, open);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  const fmt = money(loc, user?.currency);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('grShopping')} className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="shrink-0 px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label={t('grCloseShopping')} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-6 w-6" />
          </button>
          <h2 className="flex-1 text-2xl font-bold tracking-tight text-foreground">{t('grShopping')}</h2>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{t('grInCartOf', { n: cart.length, total })}</span>
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label={t('grAdd')} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cart.length} aria-label={t('grProgress')}>
          <div className="h-full rounded-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${total ? (cart.length / total) * 100 : 0}%` }} />
        </div>
        <div className="-mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label={t('grWhichShop')}>
          <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {(store && !stores.some((s) => s.toLowerCase() === store.toLowerCase()) ? [store, ...stores] : stores).slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={store.toLowerCase() === s.toLowerCase()}
              onClick={() => pickStore(s)}
              className={cn('inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
                store.toLowerCase() === s.toLowerCase() ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10')}
            >
              {s}
            </button>
          ))}
          {typing ? (
            <form onSubmit={(e) => { e.preventDefault(); const v = e.currentTarget.elements.shop.value.trim(); if (v) pickStore(v.slice(0, 80)); setTyping(false); }} className="shrink-0">
              <input name="shop" autoFocus maxLength={80} placeholder={t('grStoreName')} aria-label={t('grStoreName')} onBlur={(e) => { const v = e.target.value.trim(); if (v) pickStore(v.slice(0, 80)); setTyping(false); }}
                className="h-9 w-36 rounded-full bg-foreground/[0.06] px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" />
            </form>
          ) : (
            <button type="button" onClick={() => setTyping(true)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />{stores.length ? t('grOtherShop') : t('grWhichShop')}
            </button>
          )}
        </div>
        {estimate.priced > 0 && !user?.blurValues && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('grEstimate', { total: fmt(estimate.total), n: estimate.priced, all: total })}
            {cart.length > 0 && inCartEstimate.priced > 0 && <span className="ms-1 font-semibold text-foreground">· {t('grInCartAbout', { total: fmt(inCartEstimate.total) })}</span>}
          </p>
        )}
        {adding && <AddBar items={items} onAddText={addText} onPick={(i) => putOnList(i)} className="mt-3" />}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-32">
        <LayoutGroup>
          {todo.map(({ aisle, items: rows }) => (
            <section key={aisle} className="mt-2">
              <h3 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t(`grAisle_${aisle}`)}</h3>
              <ul className="divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/60 bg-card/75">
                {rows.map((item) => <ShopRow key={item.id} item={item} who={who} t={t} fmt={fmt} blur={!!user?.blurValues} reduce={reduce} onToggle={toggleCart} store={store} toMine={toMine} />)}
              </ul>
            </section>
          ))}
          {todo.length === 0 && total > 0 && (
            <p className="px-4 pb-2 pt-8 text-center text-lg font-semibold text-foreground">{t('grAllInCart')}</p>
          )}
          {total === 0 && <p className="px-4 pt-12 text-center text-muted-foreground">{t('grNothingToBuy')}</p>}
          <AnimatePresence initial={false}>
            {cart.length > 0 && (
              <motion.section key="cart" layout={!reduce} className="mt-5">
                <h3 className="px-4 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t('grInTheCart', { n: cart.length })}</h3>
                <ul className="divide-y divide-border/50 overflow-hidden rounded-3xl bg-foreground/[0.03]">
                  {cart.map((item) => <ShopRow key={item.id} item={item} who={who} t={t} fmt={fmt} blur={!!user?.blurValues} reduce={reduce} onToggle={toggleCart} store={store} toMine={toMine} />)}
                </ul>
              </motion.section>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <button
          type="button"
          disabled={cart.length === 0}
          onClick={() => onDone(cart, { store })}
          className="pointer-events-auto flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--glow)/0.55)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
        >
          <Check className="h-5 w-5" strokeWidth={3} />
          {cart.length ? t('grDoneShopping', { n: cart.length }) : t('grTickToFinish')}
        </button>
      </div>
    </div>,
    document.body
  );
}
