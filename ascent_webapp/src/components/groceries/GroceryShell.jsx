import React, { useCallback, useRef, useState } from 'react';
import { Plus, ScanLine } from 'lucide-react';
import { usePageCreateAction } from '@/components/shell/QuickActions';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/hooks/useHousehold';
import { guessItem, parseEntries } from './groceryUtils';
import ItemSheet from './ItemSheet';
import ScanReceipt from './ScanReceipt';

/**
 * What every Groceries layout shares: the item sheet, a scanned receipt, and the dock's + jumping to the add
 * field (held: add, or scan a receipt). Pages lay out the list; this holds the overlays.
 */
export function useGroceryShell(list) {
  const { t } = useTheme();
  const [openId, setOpenId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const addRef = useRef(null);

  const focusAdd = useCallback(() => {
    addRef.current?.focus();
    addRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);
  usePageCreateAction(focusAdd, [
    { id: 'add', label: t('grAddLabel'), icon: Plus, run: focusAdd },
    { id: 'receipt', label: t('grScanAReceipt'), icon: ScanLine, run: () => setScanning(true) },
  ]);

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
      <ScanReceipt open={scanning} onClose={() => setScanning(false)} />
    </>
  );

  return { openItem: (i) => setOpenId(i.id), scanReceipt: () => setScanning(true), addRef, overlays };
}

/**
 * The page title, the household's faces, a view switch (`toggle`) and Scan a receipt (`onScan`).
 */
export function GroceryHeader({ title, subtitle, onScan, toggle }) {
  const { t } = useTheme();
  const { members, isShared } = useHousehold();
  return (
    // Until there is room for all of it on one line (xl), the view switch takes its own row under the
    // title, so neither squeezes the other (beside the sidebar, the title shrank to its first letter)
    <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-3 sm:mb-6 xl:flex-nowrap">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground md:text-base">{subtitle}</p>}
      </div>
      {toggle && <div className="order-last w-full xl:order-none xl:w-auto xl:shrink-0">{toggle}</div>}
      <div className="flex shrink-0 items-center gap-3 empty:hidden">
        {isShared && (
          <span className="flex" aria-label={t('grSharedWith', { names: members.map((m) => m.name).join(', ') })}>
            {members.slice(0, 4).map((m) => (
              <span key={m.email} title={m.name} className="-ms-2 grid h-8 w-8 place-items-center rounded-full border-2 border-background text-xs font-bold text-background first:ms-0" style={{ background: m.color }}>
                {m.initials.slice(0, 1)}
              </span>
            ))}
          </span>
        )}
        {onScan && (
          <Button variant="secondary" onClick={onScan} aria-label={t('grScanAReceipt')} className="h-10 rounded-full px-3 sm:px-4">
            <ScanLine className="h-4 w-4 sm:me-2" /><span className="hidden sm:inline">{t('grScanAReceipt')}</span>
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
