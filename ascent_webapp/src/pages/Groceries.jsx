import React, { memo, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, ListChecks, Loader2, Receipt, Tag } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { useGroceryList } from '@/components/groceries/useGroceryList';
import { GroceriesEmpty, GroceryHeader, StartShopping, useGroceryShell } from '@/components/groceries/GroceryShell';
import AddBar from '@/components/groceries/AddBar';
import WallView from '@/components/groceries/WallView';
import CheckView from '@/components/groceries/CheckView';
import PricesView from '@/components/groceries/PricesView';
import ReceiptsView from '@/components/groceries/ReceiptsView';
import { checkQueue } from '@/components/groceries/groceryUtils';

// The Wall is the default; the Check, Prices and Receipts are one tap away and kept in the address (?view=check)
const VIEWS = [
  { key: 'wall', icon: LayoutGrid, label: 'grViewWall' },
  { key: 'check', icon: ListChecks, label: 'grViewCheck' },
  { key: 'prices', icon: Tag, label: 'grViewPrices' },
  { key: 'receipts', icon: Receipt, label: 'grViewReceipts' },
];

/** Wall | Check, as tabs: arrow keys move between them, the pill slides to the one chosen. */
function ViewSwitch({ view, onChange, t, reduce, controls }) {
  const refs = useRef({});
  const onKey = (e) => {
    const at = VIEWS.findIndex((v) => v.key === view);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    // Left and right follow the reading direction
    const flip = getComputedStyle(e.currentTarget).direction === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const next = VIEWS[(at + (flip ? -step : step) + VIEWS.length) % VIEWS.length];
    onChange(next.key);
    refs.current[next.key]?.focus();
  };
  return (
    <div role="tablist" aria-label={t('grViews')} onKeyDown={onKey} className="flex h-10 w-full items-center gap-0.5 rounded-full bg-foreground/[0.06] p-1 xl:w-auto">
      {VIEWS.map(({ key, icon: Icon, label }) => {
        const on = key === view;
        return (
          <button
            key={key}
            ref={(el) => { refs.current[key] = el; }}
            type="button"
            role="tab"
            id={`gr-tab-${key}`}
            aria-selected={on}
            aria-label={t(label)}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(key)}
            className={cn(
              // 32px tall, with an invisible 6px above and below on touch screens to reach 44px (DESIGN.md)
              'relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors xl:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-y-1.5 [@media(pointer:coarse)]:before:inset-x-0 [@media(pointer:coarse)]:before:content-[\'\']',
              on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {on && (
              <motion.span
                layoutId={reduce ? undefined : 'gr-view-pill'}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-full bg-popover shadow-[0_2px_10px_-4px_hsl(0_0%_0%/0.5)]"
              />
            )}
            <Icon className="relative h-4 w-4" aria-hidden />
            {/* On phones the other view is just its icon, so long titles (Продукты) keep their room */}
            <span className={cn('relative', !on && 'sr-only sm:not-sr-only')}>{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Groceries() {
  const { t } = useTheme();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const view = ['check', 'prices', 'receipts'].includes(params.get('view')) ? params.get('view') : 'wall';
  const list = useGroceryList();
  const shell = useGroceryShell(list);
  const { items, isLoading, low, onList, today } = list;

  const setView = (next) => {
    if (next === view) return;
    haptic('selection');
    const nextParams = new URLSearchParams(params);
    if (next === 'wall') nextParams.delete('view'); else nextParams.set('view', next);
    setParams(nextParams, { replace: true });
  };

  const toCheck = useMemo(() => (view === 'check' ? checkQueue(items, today).length : 0), [view, items, today]);
  const subtitle = view === 'receipts' ? t('rcptSubtitle')
    : !items.length ? t('grSubtitle')
    : view === 'check' && toCheck ? t('grCheckToGo', { n: toCheck })
      : [t('grToBuyCount', { n: onList.length }), low.length ? t('grRunningLowCount', { n: low.length }) : null].filter(Boolean).join(' · ');

  const View = view === 'check' ? CheckView : view === 'prices' ? PricesView : view === 'receipts' ? ReceiptsView : WallView;
  const empty = items.length === 0 && view !== 'receipts';
  const showsPanel = !isLoading && !empty;

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col p-3 pb-40 sm:p-4 sm:pb-24 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--glow)/0.14),transparent_70%)]" />
      <GroceryHeader
        title={t('grTitle')}
        subtitle={subtitle}
        count={onList.length}
        onShop={shell.startShopping}
        // The tabs point at the panel only while it is there (not while loading or on the empty list)
        toggle={<ViewSwitch view={view} onChange={setView} t={t} reduce={reduce} controls={showsPanel ? 'gr-view' : undefined} />}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : empty ? (
        <>
          <AddBar inputRef={shell.addRef} items={items} onAddText={list.addText} onPick={(i) => list.putOnList(i)} className="mb-5" />
          <GroceriesEmpty onAddText={list.addText} />
        </>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            id="gr-view"
            role="tabpanel"
            aria-labelledby={`gr-tab-${view}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <View list={list} shell={shell} />
          </motion.div>
        </AnimatePresence>
      )}

      <StartShopping count={onList.length} onClick={shell.startShopping} />
      {shell.overlays}
    </div>
  );
}

export default memo(Groceries);
