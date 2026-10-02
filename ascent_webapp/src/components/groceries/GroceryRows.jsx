import React from 'react';
import { Check } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { supplyOf } from './groceryUtils';
import { ItemEmoji, TONE, WhoDot, daysAgo, localeOf, useWho } from './GroceryParts';

/**
 * The list by aisle, as calm rows: tap a row for its details, the circle at the end when it is bought.
 */
export default function GroceryRows({ groups, today, onOpen, onBought }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const who = useWho();

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/75 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)]">
      {groups.map(({ aisle, items: rows }) => (
        <div key={aisle}>
          <h3 className="px-4 pb-1 pt-3.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t(`grAisle_${aisle}`)}</h3>
          <ul className="divide-y divide-border/50">
            {rows.map((item) => {
              const supply = supplyOf(item, today);
              const by = who.isShared ? who.of(item.listedBy) : null;
              const low = item.level === 'low' || item.level === 'out';
              return (
                <li key={item.id} className="flex items-center">
                  <button type="button" onClick={() => onOpen(item)} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 py-2 pe-2 ps-4 text-start hover:bg-foreground/[0.03]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.05]"><ItemEmoji item={item} className="text-[19px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[15px] font-medium text-foreground">{item.name}</span>
                        {item.qty && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{item.qty}</span>}
                      </span>
                      <span className={cn('flex items-center gap-1.5 truncate text-xs', low ? TONE[item.level === 'out' ? 'out' : 'low'].text : 'text-muted-foreground')}>
                        {by && <WhoDot person={by} className="h-4 w-4 text-[9px]" />}
                        {item.inCart ? t('grInCart')
                          : low ? t(item.level === 'out' ? 'grOut' : 'grRunningLowShort')
                            : supply.lastBought ? t('grLastBought', { when: daysAgo(supply.sinceBought, loc) }) : t('grNew')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onBought(item)}
                    aria-label={t('grMarkBought', { name: item.name })}
                    className="group me-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-success/10 hover:text-success focus-visible:text-success"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-current">
                      <Check className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={3} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
