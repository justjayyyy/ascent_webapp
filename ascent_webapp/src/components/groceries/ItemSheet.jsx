import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ListPlus, ListX, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { AISLES, LEVEL_VALUE, isTracked, knownStores, lastPrice, priceStats, supplyOf } from './groceryUtils';
import { useMoney } from '@/hooks/useWorkspaceData';
import { Sparkline } from '@/components/review/ReviewParts';
import { TONE, daysAgo, leftLabel, localeOf, money } from './GroceryParts';

const LEVELS = ['full', 'half', 'low', 'out'];
const nearestLevel = (share) => LEVELS.reduce((best, l) => (Math.abs(LEVEL_VALUE[l] - share) < Math.abs(LEVEL_VALUE[best] - share) ? l : best), 'full');
const statusOfLevel = (level) => (level === 'out' ? 'out' : level === 'low' ? 'low' : 'ok');

/**
 * How much is left, as a glass you pour: drag the surface up or down (or use the arrow keys) and it
 * settles on Full, Half, Low or Out.
 */
export function LevelVessel({ item, supply, onLevel, t }) {
  const share = supply.share;
  const ref = useRef(null);
  const [drag, setDrag] = useState(null); // live share while dragging
  const shown = drag ?? share ?? 0;
  const level = drag !== null ? nearestLevel(drag) : share === null ? null : nearestLevel(share);
  // While dragging it shows the level being poured; otherwise the estimate, in its own words
  const settled = drag === null && !supply.manual;
  const tone = TONE[settled ? supply.status : level ? statusOfLevel(level) : 'unknown'];
  const caption = settled ? leftLabel(supply, t) : level ? t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`) : '';

  const shareAt = (clientY) => {
    const box = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (box.bottom - clientY) / box.height));
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(shareAt(e.clientY));
  };
  const onMove = (e) => {
    if (drag === null) return;
    const next = shareAt(e.clientY);
    if (nearestLevel(next) !== nearestLevel(drag)) haptic('selection');
    setDrag(next);
  };
  const onUp = () => {
    if (drag === null) return;
    onLevel(nearestLevel(drag));
    setDrag(null);
  };
  const onKey = (e) => {
    const at = level ? LEVELS.indexOf(level) : 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onLevel(LEVELS[Math.max(0, at - 1)]); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onLevel(LEVELS[Math.min(LEVELS.length - 1, at + 1)]); }
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('grHowMuchLeft')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={level ? t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`) : t('grLevelUnknown')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      className="relative mx-auto h-48 w-36 cursor-ns-resize touch-none select-none overflow-hidden rounded-[32px_32px_40px_40px] border-2 border-foreground/15 bg-foreground/[0.03] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={cn('absolute inset-x-0 bottom-0 border-t-[3px]', tone.fill, tone.line, drag === null && 'transition-[height] duration-500 ease-out')}
        style={{ height: `${shown * 100}%` }}
      />
      <span aria-hidden className="absolute start-1/2 top-[28%] -translate-x-1/2 text-5xl leading-none rtl:translate-x-1/2">{item.emoji || '🛒'}</span>
      {caption && (
        <span
          className={cn('absolute start-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background shadow-lg rtl:translate-x-1/2', drag === null && 'transition-[bottom] duration-500 ease-out')}
          style={{ bottom: `calc(${Math.min(0.9, Math.max(0.04, shown)) * 100}% - 13px)` }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

/**
 * What it has cost: the last price and how it moved, the range, each shop's price with the cheapest
 * named, and a place to type in the price of the last purchase when it has none.
 */
function PriceMemory({ item, items, onPrice, t, loc, user }) {
  const currency = user?.currency || 'ILS';
  const { convert } = useMoney(currency);
  const toMine = useCallback((p, c) => (!c || c === currency ? p : convert(p, c)), [convert, currency]);
  const stats = useMemo(() => priceStats(item, toMine), [item, toMine]);
  const stores = useMemo(() => knownStores(items || []), [items]);
  const fmt = money(loc, currency);
  const blur = !!user?.blurValues;
  const lastPurchase = (item.purchases || []).at(-1);
  const needsPrice = lastPurchase && typeof lastPurchase.price !== 'number';
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');
  // The purchase being priced stays open once a price is in, so the shop can still be typed after it
  const [pricing, setPricing] = useState(null);
  const saved = useRef('');
  useEffect(() => {
    setPrice('');
    setStore(lastPurchase?.store || '');
    setPricing(needsPrice ? lastPurchase.id : null);
    saved.current = '';
  }, [item.id, lastPurchase?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const asking = pricing && lastPurchase?.id === pricing;
  if (!stats && !asking) return null;
  const move = stats?.changeFromAvg;
  // Saved as it is typed in: when either field is left, or on Enter
  const savePrice = (e) => {
    e?.preventDefault();
    const value = parseFloat(price);
    if (!(value > 0)) return;
    const key = `${value}|${store.trim()}`;
    if (key === saved.current) return;
    saved.current = key;
    onPrice(item, pricing, { price: value, currency, store });
    haptic('light');
  };

  return (
    <section aria-labelledby="gr-price-title" className="rounded-2xl bg-foreground/[0.04] p-3.5">
      <h3 id="gr-price-title" className="text-sm font-semibold text-foreground">{t('grPriceTitle')}</h3>
      {stats && (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('text-2xl font-bold tabular-nums tracking-tight text-foreground', blur && 'blur-sm')} dir="ltr">{fmt(stats.last.price)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[stats.last.store, new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${stats.last.date}T12:00:00`))].filter(Boolean).join(' · ')}
              </p>
            </div>
            {stats.points.length > 1 && <Sparkline values={stats.points.slice(-10).map((p) => p.price)} width={88} height={28} className="text-foreground" />}
          </div>
          {move !== null && Math.abs(move) >= 0.03 && (
            <p className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', move > 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
              {move > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {t(move > 0 ? 'grPriceUp' : 'grPriceDown', { pct: Math.round(Math.abs(move) * 100) })}
            </p>
          )}
          {stats.points.length > 1 && (
            <dl className={cn('mt-3 grid grid-cols-3 gap-2 text-center text-xs', blur && 'blur-sm')}>
              {[['grPriceLow', stats.min], ['grPriceAvg', stats.avg], ['grPriceHigh', stats.max]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-background/50 p-2">
                  <dt className="text-muted-foreground">{t(k)}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-foreground" dir="ltr">{fmt(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {stats.stores.length > 1 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {stats.stores.map((s, i) => (
                <li key={s.store} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-foreground">{s.store}</span>
                    {i === 0 && <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">{t('grCheapest')}</span>}
                  </span>
                  <span className={cn('shrink-0 tabular-nums text-muted-foreground', blur && 'blur-sm')} dir="ltr">{fmt(s.avg)}</span>
                </li>
              ))}
            </ul>
          )}
          {stats.saving > 0.05 && stats.cheapest && (
            <p className="mt-2 text-xs text-success">{t('grUsuallyLessAt', { amount: blur ? '••' : fmt(stats.saving), store: stats.cheapest.store })}</p>
          )}
        </>
      )}
      {asking && onPrice && (
        <form onSubmit={savePrice} className="mt-3 grid grid-cols-[1fr_1.3fr] gap-2">
          <Input
            type="number" inputMode="decimal" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => savePrice()}
            enterKeyHint="done" placeholder={t('grPricePlaceholder')} aria-label={t('grPriceOn', { date: lastPurchase.date })} className="h-10 rounded-xl tabular-nums"
          />
          <Input value={store} onChange={(e) => setStore(e.target.value)} onBlur={() => savePrice()} enterKeyHint="done" list="gr-stores" maxLength={80} placeholder={t('grStore')} aria-label={t('grStore')} className="h-10 rounded-xl" />
          <datalist id="gr-stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
          {/* Enter in either field saves (a form needs a submit button for that) */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
          <p className="col-span-2 text-xs text-muted-foreground">{t('grPriceOn', { date: new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${lastPurchase.date}T12:00:00`)) })}</p>
        </form>
      )}
    </section>
  );
}

// Typing is saved once it pauses for this long; picking something (an aisle, the switch) is saved at once
const TYPING_SAVE_MS = 600;

/**
 * Everything about one item: its level, aisle, how often it is bought, and putting it on or off the list.
 * Every change is saved as it is made; there is nothing to confirm.
 */
export default function ItemSheet({ item, open, onClose, onSave, onLevel, onList, onUnlist, onDelete, onPrice, items }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const [form, setForm] = useState(null);
  const formRef = useRef(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const timer = useRef(null);
  const currency = user?.currency || 'ILS';
  const { convert } = useMoney(currency);

  useEffect(() => {
    if (!open || !item) return;
    const next = { name: item.name, emoji: item.emoji || '', aisle: item.aisle || 'other', qty: item.qty || '', note: item.note || '', staple: isTracked(item) };
    formRef.current = next;
    setForm(next);
  }, [open, item?.id]);

  /** Saves whatever in the form differs from the item. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const f = formRef.current;
    const current = itemRef.current;
    if (!f || !current) return;
    const changes = {};
    if (f.name.trim() && f.name.trim() !== current.name) changes.name = f.name.trim().slice(0, 120);
    if (f.emoji !== (current.emoji || '')) changes.emoji = [...f.emoji].slice(0, 2).join('');
    if (f.aisle !== current.aisle) changes.aisle = f.aisle;
    if (current.onList && f.qty !== (current.qty || '')) changes.qty = f.qty.slice(0, 40);
    if (current.onList && f.note !== (current.note || '')) changes.note = f.note.slice(0, 300);
    if (f.staple !== isTracked(current)) changes.staple = f.staple;
    if (Object.keys(changes).length) onSave(current, changes);
  }, [onSave]);

  // Closed some other way (the page left mid-typing): what was typed is still saved
  useEffect(() => () => { if (timer.current) flush(); }, [flush]);

  if (!item || !form) return null;
  const supply = supplyOf(item);
  const last = lastPrice(item);
  const lastInMine = last && last.currency && last.currency !== currency ? convert(last.price, last.currency) : null;
  const times = new Set((item.purchases || []).map((p) => p.date)).size;
  const set = (changes, { now = false } = {}) => {
    formRef.current = { ...formRef.current, ...changes };
    setForm(formRef.current);
    clearTimeout(timer.current);
    if (now) flush(); else timer.current = setTimeout(flush, TYPING_SAVE_MS);
  };

  const close = () => {
    flush();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-3">
            <input
              value={form.emoji}
              onChange={(e) => set({ emoji: e.target.value })}
              onBlur={flush}
              aria-label={t('grEmoji')}
              placeholder="🛒"
              className="h-12 w-12 shrink-0 rounded-2xl bg-foreground/[0.05] text-center text-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="min-w-0 flex-1">
              <DialogTitle className="sr-only">{item.name}</DialogTitle>
              <input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                onBlur={flush}
                aria-label={t('grItemName')}
                maxLength={120}
                className="w-full bg-transparent text-xl font-bold tracking-tight text-foreground outline-none"
              />
              <DialogDescription className="text-sm text-muted-foreground">
                {supply.lastBought ? t('grLastBought', { when: daysAgo(supply.sinceBought, loc) }) : t('grNeverBought')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <section className="mt-1">
          <LevelVessel item={{ ...item, emoji: form.emoji }} supply={supply} onLevel={(level) => onLevel(item, level)} t={t} />
          <div role="group" aria-label={t('grHowMuchLeft')} className="mt-4 grid grid-cols-4 gap-1.5">
            {LEVELS.map((level) => {
              const on = supply.manual && item.level === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onLevel(item, level)}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold transition-colors',
                    on ? cn(TONE[statusOfLevel(level)].fill, TONE[statusOfLevel(level)].text, 'ring-1 ring-current') : 'bg-foreground/[0.06] text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`)}
                </button>
              );
            })}
          </div>
        </section>

        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grUsuallyLasts')}</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">{supply.interval ? t('grDays', { n: supply.interval }) : '—'}</dd>
          </div>
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grTimesBought')}</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">{times}</dd>
          </div>
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grLastPrice')}</dt>
            <dd className={cn('mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground', user?.blurValues && 'blur-sm')}>
              {!last ? '—' : typeof lastInMine === 'number' ? money(loc, currency)(lastInMine) : money(loc, last.currency || currency)(last.price)}
            </dd>
          </div>
        </dl>

        <PriceMemory item={item} items={items} onPrice={onPrice} t={t} loc={loc} user={user} />

        {item.onList && (
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Input value={form.qty} onChange={(e) => set({ qty: e.target.value })} onBlur={flush} placeholder={t('grQty')} aria-label={t('grQty')} maxLength={40} className="h-11 rounded-xl" />
            <Input value={form.note} onChange={(e) => set({ note: e.target.value })} onBlur={flush} placeholder={t('grNote')} aria-label={t('grNote')} maxLength={300} className="h-11 rounded-xl" />
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('grAisle')}</h3>
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
            {AISLES.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={form.aisle === a.key}
                onClick={() => set({ aisle: a.key }, { now: true })}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
                  form.aisle === a.key ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10'
                )}
              >
                <span aria-hidden>{a.emoji}</span>{t(`grAisle_${a.key}`)}
              </button>
            ))}
          </div>
        </section>

        <label className="flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] p-3.5">
          <span>
            <span className="block text-sm font-semibold text-foreground">{t('grTrackSupply')}</span>
            <span className="block text-xs text-muted-foreground">{t('grTrackSupplyHint')}</span>
          </span>
          <Switch checked={form.staple} onCheckedChange={(v) => set({ staple: v }, { now: true })} />
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => { clearTimeout(timer.current); timer.current = null; onDelete(item); onClose(); }} aria-label={t('grDelete')} className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-5 w-5" />
          </Button>
          {item.onList ? (
            <Button type="button" variant="secondary" onClick={() => { flush(); onUnlist(itemRef.current); onClose(); }} className="h-11 flex-1 rounded-xl">
              <ListX className="me-2 h-4 w-4" />{t('grTakeOffList')}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => { flush(); onList(itemRef.current); onClose(); }} className="h-11 flex-1 rounded-xl">
              <ListPlus className="me-2 h-4 w-4" />{t('grPutOnList')}
            </Button>
          )}
          <Button type="button" onClick={close} className="h-11 flex-1 rounded-xl">{t('grDone')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
