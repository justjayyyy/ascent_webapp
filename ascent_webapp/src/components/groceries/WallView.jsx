import React, { memo, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { LayoutGroup, motion, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import AddBar from './AddBar';
import { ItemEmoji, TONE, daysAgo, leftLabel, localeOf, useWho } from './GroceryParts';
import { isTracked, supplyOf } from './groceryUtils';

const HOLD_MS = 450;

/** Tap does the tile's action; holding it (or right-click, or the context-menu key) opens its details. */
function useTileGestures(onTap, onHold) {
  const timer = useRef(null);
  const held = useRef(false);
  const start = useRef(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e) => {
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => { held.current = true; onHold(); }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClick: () => { if (held.current) { held.current = false; return; } onTap(); },
    onContextMenu: (e) => { e.preventDefault(); clear(); held.current = false; onHold(); },
    onKeyDown: (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onHold(); } },
  };
}

const Tile = memo(function Tile({ item, kind, supply, label, by, qty, onTap, onHold, actionLabel, reduce }) {
  const gestures = useTileGestures(onTap, onHold);
  const tone = TONE[supply?.status || 'unknown'];
  return (
    <motion.li layoutId={reduce ? undefined : `tile-${item.id}`} layout={!reduce} transition={{ type: 'spring', stiffness: 420, damping: 36 }} className="list-none">
      <button
        type="button"
        {...gestures}
        aria-label={`${item.name}${qty ? `, ${qty}` : ''}${label ? `, ${label}` : ''}. ${actionLabel}`}
        className={cn(
          'relative flex aspect-square w-full select-none flex-col justify-end overflow-hidden rounded-[20px] border p-2.5 text-start transition-[transform,background-color] [-webkit-touch-callout:none] active:scale-[0.96] sm:p-3',
          kind === 'buy' && 'border-primary/45 bg-gradient-to-br from-primary/[0.24] to-primary/[0.07]',
          kind === 'suggest' && 'border-[1.5px] border-dashed border-warning/60 bg-warning/[0.06]',
          kind === 'home' && 'border-border/70 bg-card/80'
        )}
      >
        {kind === 'home' && supply?.share !== null && supply?.share !== undefined && (
          <span aria-hidden className={cn('absolute inset-x-0 bottom-0 border-t-2 transition-[height] duration-700 ease-out', tone.fill, tone.line)} style={{ height: `${Math.max(4, supply.share * 100)}%` }} />
        )}
        <ItemEmoji item={item} className="absolute start-2.5 top-2.5 text-[28px] sm:start-3 sm:top-3 sm:text-[32px]" />
        {kind === 'buy' && qty && (
          <span className="absolute end-2 top-2 grid h-[22px] min-w-[24px] place-items-center rounded-full bg-primary px-1.5 text-xs font-extrabold tabular-nums text-primary-foreground">{qty}</span>
        )}
        {kind === 'suggest' && (
          <span aria-hidden className="absolute end-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-full bg-warning text-background"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></span>
        )}
        <span className="relative line-clamp-2 text-[13.5px] font-semibold leading-tight text-foreground sm:text-sm">{item.name}</span>
        {(label || by) && (
          <span className={cn('relative mt-0.5 truncate text-xs tabular-nums', kind === 'home' && supply?.status !== 'ok' ? tone.text : 'text-muted-foreground')}>
            {label || by}
          </span>
        )}
      </button>
    </motion.li>
  );
});

/**
 * The Wall: everything as tiles. What to buy on top (with the staples running low suggested beside it),
 * and below, everything at home, each tile filled to how much is probably left.
 */
function WallView({ list, shell }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const reduce = useReducedMotion();
  const who = useWho();
  const { items, low, onList, today } = list;

  const home = useMemo(() => {
    const suggested = new Set(low.map((l) => l.item.id));
    return items
      .filter((i) => !i.onList && !suggested.has(i.id))
      .map((item) => ({ item, supply: supplyOf(item, today), tracked: isTracked(item) }))
      .sort((a, b) => (b.tracked - a.tracked)
        || ((a.supply.share ?? 2) - (b.supply.share ?? 2))
        || a.item.name.localeCompare(b.item.name, loc));
  }, [items, low, today, loc]);

  return (
    <>
      <AddBar inputRef={shell.addRef} items={items} onAddText={list.addText} onPick={(i) => list.putOnList(i)} placeholder={t('grSearchOrAdd')} className="mb-5" />

      <LayoutGroup>
        <section aria-labelledby="gw-buy">
          <div className="mb-2.5 flex items-baseline justify-between px-0.5">
            <h2 id="gw-buy" className="text-[15px] font-bold tracking-tight text-foreground">
              {t('grToBuy')} <span className="ms-1 font-medium tabular-nums text-muted-foreground">{onList.length}</span>
            </h2>
            {onList.length > 0 && <span className="text-xs text-muted-foreground">{t('grTapWhenBought')}</span>}
          </div>
          {onList.length + low.length === 0 ? (
            <p className="rounded-3xl bg-foreground/[0.04] px-5 py-6 text-center text-sm text-muted-foreground">{t('grListEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {onList.map((item) => (
                <Tile
                  key={item.id} item={item} kind="buy" reduce={reduce} qty={item.qty}
                  by={who.isShared ? who.of(item.listedBy)?.name : ''}
                  actionLabel={t('grTapToMarkBought')}
                  onTap={() => list.boughtOne(item)} onHold={() => shell.openItem(item)}
                />
              ))}
              {low.map(({ item, supply }) => (
                <Tile
                  key={item.id} item={item} kind="suggest" reduce={reduce} supply={supply}
                  label={supply.status === 'out' ? t('grProbablyOut') : leftLabel(supply, t)}
                  actionLabel={t('grTapToAdd')}
                  onTap={() => list.putOnList(item)} onHold={() => shell.openItem(item)}
                />
              ))}
            </ul>
          )}
        </section>

        {home.length > 0 && (
          <section aria-labelledby="gw-home" className="mt-7">
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 id="gw-home" className="text-[15px] font-bold tracking-tight text-foreground">
                {t('grAtHome')} <span className="ms-1 font-medium tabular-nums text-muted-foreground">{home.length}</span>
              </h2>
              <span className="text-xs text-muted-foreground">{t('grHoldForLevel')}</span>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {home.map(({ item, supply, tracked }) => (
                <Tile
                  key={item.id} item={item} kind="home" reduce={reduce} supply={tracked ? supply : null}
                  label={tracked ? leftLabel(supply, t) : supply.lastBought ? daysAgo(supply.sinceBought, loc) : ''}
                  actionLabel={t('grTapToAdd')}
                  onTap={() => list.putOnList(item)} onHold={() => shell.openItem(item)}
                />
              ))}
            </ul>
          </section>
        )}
      </LayoutGroup>
    </>
  );
}

export default memo(WallView);
