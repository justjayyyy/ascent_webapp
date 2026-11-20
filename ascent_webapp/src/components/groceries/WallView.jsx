import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { LayoutGroup, motion, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import AddBar from './AddBar';
import { ItemEmoji, TONE, daysAgo, leftLabel, localeOf, useWho } from './GroceryParts';
import { SHOPS, isGrocery, isTracked, lastBought, normalizeName, parseEntries, supplyOf } from './groceryUtils';

const HOLD_MS = 450;
// A tapped tile stays where it is, ticked, until the taps stop for this long; then the ticked ones move
// together. Tiles never slide under a finger that is still tapping, and a second tap on one undoes it.
const SETTLE_MS = 2200;

/** Tap does the tile's action; holding it (or right-click, or the context-menu key) opens its details. */
function useTileGestures(onTap, onHold) {
  const timer = useRef(null);
  const held = useRef(false);
  const start = useRef(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => { held.current = true; haptic('selection'); onHold(); }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick: () => { if (held.current) { held.current = false; return; } onTap(); },
    onContextMenu: (e) => { e.preventDefault(); clear(); held.current = false; onHold(); },
    onKeyDown: (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onHold(); } },
  };
}

const Tile = memo(function Tile({ item, kind, supply, label, by, qty, ticked, onTap, onHold, actionLabel, reduce }) {
  const gestures = useTileGestures(onTap, onHold);
  const tone = TONE[supply?.status || 'unknown'];
  return (
    <motion.li layoutId={reduce ? undefined : `tile-${item.id}`} layout={!reduce} transition={{ type: 'spring', stiffness: 420, damping: 36 }} className="list-none">
      <button
        type="button"
        {...gestures}
        aria-pressed={ticked}
        aria-label={`${item.name}${qty ? `, ${qty}` : ''}${label ? `, ${label}` : ''}. ${actionLabel}`}
        className={cn(
          'relative flex aspect-square w-full select-none flex-col justify-end overflow-hidden rounded-[20px] border p-2.5 text-start transition-[transform,background-color,border-color] [-webkit-touch-callout:none] active:scale-[0.96] sm:p-3',
          ticked && kind === 'buy' && 'border-success/60 bg-success/[0.14]',
          ticked && kind !== 'buy' && 'border-primary/45 bg-gradient-to-br from-primary/[0.24] to-primary/[0.07]',
          !ticked && kind === 'buy' && 'border-primary/45 bg-gradient-to-br from-primary/[0.24] to-primary/[0.07]',
          !ticked && kind === 'suggest' && 'border-[1.5px] border-dashed border-warning/60 bg-warning/[0.06]',
          !ticked && kind === 'home' && 'border-border/70 bg-card/80'
        )}
      >
        {kind === 'home' && !ticked && supply?.share !== null && supply?.share !== undefined && (
          <span aria-hidden className={cn('absolute inset-x-0 bottom-0 border-t-2 transition-[height] duration-700 ease-out', tone.fill, tone.line)} style={{ height: `${Math.max(4, supply.share * 100)}%` }} />
        )}
        <ItemEmoji item={item} className={cn('absolute start-2.5 top-2.5 text-[28px] transition-opacity sm:start-3 sm:top-3 sm:text-[32px]', ticked && kind === 'buy' && 'opacity-50')} />
        {ticked ? (
          <span aria-hidden className={cn('absolute end-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-full', kind === 'buy' ? 'bg-success text-background' : 'bg-primary text-primary-foreground')}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : kind === 'buy' && qty ? (
          <span className="absolute end-2 top-2 grid h-[22px] min-w-[24px] place-items-center rounded-full bg-primary px-1.5 text-xs font-extrabold tabular-nums text-primary-foreground">{qty}</span>
        ) : kind === 'suggest' ? (
          <span aria-hidden className="absolute end-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-full bg-warning text-background"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></span>
        ) : null}
        <span className={cn('relative line-clamp-2 text-[13.5px] font-semibold leading-tight text-foreground sm:text-sm', ticked && kind === 'buy' && 'line-through decoration-foreground/50')}>{item.name}</span>
        {(label || by) && (
          <span className={cn('relative mt-0.5 truncate text-xs tabular-nums', ticked ? 'font-semibold text-foreground/80' : kind === 'home' && supply?.status !== 'ok' ? tone.text : 'text-muted-foreground')}>
            {label || by}
          </span>
        )}
      </button>
    </motion.li>
  );
});

/**
 * Taps on the Wall, held for a moment: { ticked: { [id]: 'bought' | 'listed' }, tap }. Tapping ticks a tile
 * (tapping it again unticks it); once the taps stop, everything ticked is bought or put on the list at once.
 * Anything still ticked when the Wall closes is done then.
 */
function useSettledTaps(list) {
  const [ticked, setTicked] = useState({});
  const pending = useRef({});
  const timer = useRef(null);
  const listRef = useRef(list);
  listRef.current = list;

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const done = pending.current;
    pending.current = {};
    setTicked({});
    const { items, boughtMany, putOnList } = listRef.current;
    const byId = new Map(items.map((i) => [i.id, i]));
    const bought = [];
    for (const [id, action] of Object.entries(done)) {
      const item = byId.get(id);
      if (!item) continue;
      if (action === 'bought' && item.onList) bought.push(item);
      if (action === 'listed' && !item.onList) putOnList(item);
    }
    boughtMany(bought);
  }, []);

  const tap = useCallback((item, action) => {
    haptic(pending.current[item.id] ? 'selection' : 'light');
    const next = { ...pending.current };
    if (next[item.id]) delete next[item.id]; else next[item.id] = action;
    pending.current = next;
    setTicked(next);
    clearTimeout(timer.current);
    timer.current = Object.keys(next).length ? setTimeout(settle, SETTLE_MS) : null;
  }, [settle]);

  useEffect(() => () => { if (Object.keys(pending.current).length) settle(); }, [settle]);

  return { ticked, tap, settle };
}

const matches = (item, q) => !q || normalizeName(item.name).includes(q);

/** Groceries | Other: which side of the Wall is showing, with how many are to buy on each. */
function SideSwitch({ side, onChange, counts, t }) {
  const sides = [['groceries', t('grSideGroceries')], ['other', t('grSideOther')]];
  return (
    <div role="radiogroup" aria-label={t('grSides')} className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.06] p-1">
      {sides.map(([key, label]) => {
        const on = side === key;
        const n = counts[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(key)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'bg-popover text-foreground shadow-[0_2px_10px_-4px_hsl(0_0%_0%/0.5)]' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            {/* What waits on the side not showing stands out, so it is not forgotten */}
            <span className={cn('min-w-6 rounded-full px-1.5 text-xs font-bold tabular-nums', !on && key === 'other' && n > 0 ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.08] text-muted-foreground')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Wall: everything as tiles, in two sides. Groceries: what to buy on top, the staples running low under it
 * (one tap, or all at once, to put them on the list), and below, everything at home, each tile filled to how
 * much is probably left. Other: what to buy at the pharmacy, the hardware shop and so on, by shop, and what was
 * bought there before (one-offs, so not tracked at home). Typing in the add field narrows the tiles to what
 * matches; a new name goes to the side it belongs to, or the one showing when the name does not say.
 */
function WallView({ list, shell }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const reduce = useReducedMotion();
  const who = useWho();
  const { items, low, groceriesToBuy, othersToBuy, today } = list;
  const [params, setParams] = useSearchParams();
  const side = params.get('buy') === 'other' ? 'other' : 'groceries';
  const setSide = (next) => {
    if (next === side) return;
    haptic('selection');
    const nextParams = new URLSearchParams(params);
    if (next === 'other') nextParams.set('buy', 'other'); else nextParams.delete('buy');
    setParams(nextParams, { replace: true });
  };
  const { ticked, tap } = useSettledTaps(list);
  const [query, setQuery] = useState('');
  // Several things typed at once ("milk, eggs") are being added, not searched for
  const q = parseEntries(query).length > 1 ? '' : normalizeName(query);

  const home = useMemo(() => {
    const suggested = new Set(low.map((l) => l.item.id));
    return items
      .filter((i) => isGrocery(i) && !i.onList && !suggested.has(i.id))
      .map((item) => {
        const supply = supplyOf(item, today);
        return { item, supply, tracked: isTracked(item) || supply.manual };
      })
      .sort((a, b) => (b.tracked - a.tracked)
        || ((a.supply.share ?? 2) - (b.supply.share ?? 2))
        || a.item.name.localeCompare(b.item.name, loc));
  }, [items, low, today, loc]);

  // Bought elsewhere before: the latest first, one tap puts it back on the list
  const boughtBefore = useMemo(() => items
    .filter((i) => !isGrocery(i) && !i.onList && lastBought(i))
    .sort((a, b) => String(lastBought(b)).localeCompare(String(lastBought(a)))), [items]);

  const onList = side === 'other' ? othersToBuy : groceriesToBuy;
  const shownBuy = onList.filter((i) => matches(i, q));
  const shownBefore = boughtBefore.filter((i) => matches(i, q));
  const shops = SHOPS.map(({ key }) => ({ key, items: shownBuy.filter((i) => i.shop === key) })).filter((s) => s.items.length);

  // A name that belongs on the other side goes there, and says so with a way to look
  const addText = async (text) => {
    const added = await list.addText(text, { shop: side === 'other' ? 'other' : '' });
    const elsewhere = added.filter((i) => isGrocery(i) !== (side === 'groceries'));
    if (!elsewhere.length) return;
    const there = side === 'groceries' ? 'other' : 'groceries';
    toast(t(there === 'other' ? 'grAddedToOther' : 'grAddedToGroceries', { name: elsewhere.map((i) => i.name).join(', ') }), {
      action: { label: t('grShow'), onClick: () => setSide(there) },
    });
  };
  const shownLow = low.filter(({ item }) => matches(item, q));
  const shownHome = home.filter(({ item }) => matches(item, q));
  const addAll = () => {
    haptic('light');
    low.forEach(({ item }) => list.putOnList(item));
  };

  const heading = (id, title, count, aside) => (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
      <h2 id={id} className="text-[15px] font-bold tracking-tight text-foreground">
        {title} <span className="ms-1 font-medium tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {aside}
    </div>
  );

  return (
    <>
      <AddBar
        inputRef={shell.addRef} items={items} onAddText={addText} onPick={(i) => list.putOnList(i)}
        onQueryChange={setQuery} suggest={false} placeholder={t('grSearchOrAdd')} className="mb-5"
      />

      <SideSwitch side={side} onChange={setSide} counts={{ groceries: groceriesToBuy.length, other: othersToBuy.length }} t={t} />

      {side === 'other' ? (
        <LayoutGroup>
          {onList.length === 0 && !q && (
            <p className="rounded-3xl bg-foreground/[0.04] px-5 py-6 text-center text-sm text-muted-foreground">{t('grOtherEmpty')}</p>
          )}
          {shops.map(({ key, items: rows }, i) => (
            <section key={key} aria-labelledby={`gw-shop-${key}`} className={cn(i > 0 && 'mt-7')}>
              {heading(`gw-shop-${key}`, t(`grShop_${key}`), rows.length, i === 0 && <span className="truncate text-xs text-muted-foreground">{t('grTapWhenBought')}</span>)}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {rows.map((item) => (
                  <Tile
                    key={item.id} item={item} kind="buy" reduce={reduce} qty={item.qty} ticked={ticked[item.id] === 'bought'}
                    label={ticked[item.id] ? t('grGotIt') : ''}
                    by={who.isShared ? who.of(item.listedBy)?.name : ''}
                    actionLabel={t('grTapToMarkBought')}
                    onTap={() => tap(item, 'bought')} onHold={() => shell.openItem(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {shownBefore.length > 0 && (
            <section aria-labelledby="gw-before" className={cn(shops.length > 0 && 'mt-7')}>
              {heading('gw-before', t('grBoughtBefore'), boughtBefore.length, <span className="truncate text-xs text-muted-foreground">{t('grTapToAddShort')}</span>)}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {shownBefore.map((item) => {
                  const supply = supplyOf(item, today);
                  return (
                    <Tile
                      key={item.id} item={item} kind="home" reduce={reduce} supply={null} ticked={ticked[item.id] === 'listed'}
                      label={ticked[item.id] ? t('grAdded') : t(`grShop_${item.shop}`) + (supply.lastBought ? ` · ${daysAgo(supply.sinceBought, loc)}` : '')}
                      actionLabel={t('grTapToAdd')}
                      onTap={() => tap(item, 'listed')} onHold={() => shell.openItem(item)}
                    />
                  );
                })}
              </ul>
            </section>
          )}
        </LayoutGroup>
      ) : (
        <LayoutGroup>
          {(!q || shownBuy.length > 0) && (
            <section aria-labelledby="gw-buy">
              {heading('gw-buy', t('grToBuy'), onList.length, onList.length > 0 && <span className="truncate text-xs text-muted-foreground">{t('grTapWhenBought')}</span>)}
              {onList.length === 0 ? (
                <p className="rounded-3xl bg-foreground/[0.04] px-5 py-6 text-center text-sm text-muted-foreground">{t('grListEmpty')}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {shownBuy.map((item) => (
                    <Tile
                      key={item.id} item={item} kind="buy" reduce={reduce} qty={item.qty} ticked={ticked[item.id] === 'bought'}
                      label={ticked[item.id] ? t('grGotIt') : ''}
                      by={who.isShared ? who.of(item.listedBy)?.name : ''}
                      actionLabel={t('grTapToMarkBought')}
                      onTap={() => tap(item, 'bought')} onHold={() => shell.openItem(item)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {shownLow.length > 0 && (
            <section aria-labelledby="gw-low" className="mt-7">
              {heading('gw-low', t('grRunningLowShort'), low.length, !q && low.length > 1 && (
                <button
                  type="button"
                  onClick={addAll}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-warning/15 px-3 text-xs font-bold text-warning transition-[background-color,transform] hover:bg-warning/25 active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />{t('grAddAll')}
                </button>
              ))}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {shownLow.map(({ item, supply }) => (
                  <Tile
                    key={item.id} item={item} kind="suggest" reduce={reduce} supply={supply} ticked={ticked[item.id] === 'listed'}
                    label={ticked[item.id] ? t('grAdded') : supply.status === 'out' ? t('grProbablyOut') : leftLabel(supply, t)}
                    actionLabel={t('grTapToAdd')}
                    onTap={() => tap(item, 'listed')} onHold={() => shell.openItem(item)}
                  />
                ))}
              </ul>
            </section>
          )}

          {shownHome.length > 0 && (
            <section aria-labelledby="gw-home" className="mt-7">
              {heading('gw-home', t('grAtHome'), home.length, <span className="truncate text-xs text-muted-foreground">{t('grTapToAddShort')}</span>)}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {shownHome.map(({ item, supply, tracked }) => (
                  <Tile
                    key={item.id} item={item} kind="home" reduce={reduce} supply={tracked ? supply : null} ticked={ticked[item.id] === 'listed'}
                    label={ticked[item.id] ? t('grAdded') : tracked ? leftLabel(supply, t) : supply.lastBought ? daysAgo(supply.sinceBought, loc) : ''}
                    actionLabel={t('grTapToAdd')}
                    onTap={() => tap(item, 'listed')} onHold={() => shell.openItem(item)}
                  />
                ))}
              </ul>
            </section>
          )}
        </LayoutGroup>
      )}

      {items.length > 0 && <p className="mt-6 text-center text-xs text-muted-foreground">{t('grHoldForDetails')}</p>}
    </>
  );
}

export default memo(WallView);
