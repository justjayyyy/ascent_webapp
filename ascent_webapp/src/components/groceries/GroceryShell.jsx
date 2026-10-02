import React, { useCallback, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/hooks/useHousehold';
import { localDay } from '@/lib/localDay';
import { cn } from '@/lib/utils';
import { guessItem, parseEntries } from './groceryUtils';
import ItemSheet from './ItemSheet';
import ShoppingMode from './ShoppingMode';
import FinishTrip from './FinishTrip';

/**
 * What every Groceries layout shares: the item sheet, shopping mode and the finish after it, and the
 * dock's + jumping to the add field. Pages lay out the list; this holds the overlays.
 */
export function useGroceryShell(list) {
  const [openId, setOpenId] = useState(null);
  const [shopping, setShopping] = useState(false);
  const [trip, setTrip] = useState(null); // { items, date }
  const addRef = useRef(null);

  usePageCreateAction(useCallback(() => {
    addRef.current?.focus();
    addRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []));

  const finish = useCallback(async (cart, { store = '' } = {}) => {
    const date = localDay();
    setShopping(false);
    setTrip({ items: cart, date, store });
    await list.markBought(cart, { date, store });
  }, [list]);

  const item = openId ? list.items.find((i) => i.id === openId) : null;

  const overlays = (
    <>
      <ItemSheet
        item={item}
        open={!!item}
        onClose={() => setOpenId(null)}
        onSave={list.save}
        onLevel={list.setLevel}
        onList={(i) => list.putOnList(i)}
        onUnlist={list.takeOffList}
        onDelete={list.remove}
        onPrice={list.setPurchasePrice}
        items={list.items}
      />
      <ShoppingMode open={shopping} list={list} onClose={() => setShopping(false)} onDone={finish} />
      <FinishTrip trip={trip} list={list} onClose={() => setTrip(null)} />
    </>
  );

  return { openItem: (i) => setOpenId(i.id), startShopping: () => setShopping(true), addRef, overlays };
}

/** The page title, the household's faces, a view switch (`toggle`), and Start shopping on wider screens. */
export function GroceryHeader({ title, subtitle, count, onShop, toggle }) {
  const { t } = useTheme();
  const { members, isShared } = useHousehold();
  return (
    <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground md:text-base">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {toggle}
        {isShared && (
          <span className={cn('flex', toggle && 'hidden sm:flex')} aria-label={t('grSharedWith', { names: members.map((m) => m.name).join(', ') })}>
            {members.slice(0, 4).map((m) => (
              <span key={m.email} title={m.name} className="-ms-2 grid h-8 w-8 place-items-center rounded-full border-2 border-background text-xs font-bold text-background first:ms-0" style={{ background: m.color }}>
                {m.initials.slice(0, 1)}
              </span>
            ))}
          </span>
        )}
        {count > 0 && onShop && (
          <Button onClick={onShop} className="hidden h-10 rounded-full px-5 md:inline-flex">
            <ShoppingCart className="me-2 h-4 w-4" />{t('grStartShopping')}
            <span className="ms-2 rounded-full bg-primary-foreground/15 px-2 text-xs tabular-nums">{count}</span>
          </Button>
        )}
      </div>
    </header>
  );
}

/** Nothing here yet: one tap on the everyday basics starts the list. */
export function GroceriesEmpty({ onAddText }) {
  const { t } = useTheme();
  const starters = parseEntries(t('grStarters'));
  return (
    <section className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center sm:px-10 sm:py-12">
      <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">{t('grEmptyTitle')}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('grEmptyHint')}</p>
      <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {starters.map(({ name }) => (
          <button
            key={name}
            type="button"
            onClick={() => onAddText(name)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/60 px-4 text-sm font-medium text-foreground transition-[background-color,transform] hover:bg-primary/10 active:scale-95"
          >
            <span aria-hidden className="text-lg leading-none">{guessItem(name).emoji || '🛒'}</span>{name}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The floating "Start shopping" pill above the dock on phones (wider screens show it in the header). */
export function StartShopping({ count, onClick, className }) {
  const { t } = useTheme();
  if (!count) return null;
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-20 flex justify-center md:hidden', className)}>
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex h-[52px] items-center gap-2.5 rounded-full bg-primary pe-5 ps-4 text-[15px] font-bold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--glow)/0.55)] transition-transform active:scale-[0.97]"
      >
        <ShoppingCart className="h-5 w-5" strokeWidth={2.4} />
        {t('grStartShopping')}
        <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[13px] tabular-nums">{count}</span>
      </button>
    </div>
  );
}
