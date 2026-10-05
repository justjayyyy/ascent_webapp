import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Plus } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { DictateButton, useDictation } from '@/components/notes/useDictation';
import { cn } from '@/lib/utils';
import { normalizeName, parseEntries } from './groceryUtils';
import { ItemEmoji } from './GroceryParts';

/**
 * Add to the list by typing or speaking: "milk, 2 eggs, bread". While typing, things the household has
 * bought before are offered first, so one tap puts them back on the list. `onQueryChange` hears what is
 * typed, for a page that filters what it shows; with `suggest={false}` only the "Add" row is offered,
 * because the page already shows the matches.
 */
export default function AddBar({ items, onAddText, onPick, onQueryChange, suggest = true, placeholder, className, inputRef: givenRef }) {
  const { t, language } = useTheme();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const ownRef = useRef(null);
  const inputRef = givenRef || ownRef;
  const listId = useId();

  const submit = (text) => {
    if (!text.trim()) return;
    onAddText(text);
    setValue('');
  };
  const dictation = useDictation({ language, t, onText: submit });
  useEffect(() => { onQueryChange?.(value); }, [value, onQueryChange]);

  const entries = useMemo(() => parseEntries(value), [value]);
  const matches = useMemo(() => {
    const q = normalizeName(value);
    if (!q || entries.length > 1 || !suggest) return [];
    return items
      .filter((i) => !i.onList)
      .map((i) => ({ i, at: normalizeName(i.name).indexOf(q) }))
      .filter((m) => m.at >= 0)
      .sort((a, b) => a.at - b.at || (b.i.purchases?.length || 0) - (a.i.purchases?.length || 0))
      .slice(0, 5)
      .map((m) => m.i);
  }, [items, value, entries.length, suggest]);
  const exact = matches.some((m) => normalizeName(m.name) === normalizeName(value));
  // The in-page "Add" row stays while there is text, so the page does not jump when a tile is tapped
  const open = (focused || !suggest) && value.trim().length > 0;

  return (
    <div className={cn('relative', className)}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(value); }}
        className="flex h-12 items-center gap-1 rounded-2xl border border-input/90 bg-card/80 pe-1.5 ps-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05)] transition-colors focus-within:border-ring"
      >
        <input
          ref={inputRef}
          value={dictation.listening && dictation.interim ? dictation.interim : value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); setValue(''); } }}
          placeholder={placeholder || t('grAddPlaceholder')}
          aria-label={t('grAddLabel')}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          enterKeyHint="done"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/80 md:text-[15px]"
        />
        {value.trim() ? (
          <button type="submit" aria-label={t('grAdd')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95">
            <CornerDownLeft className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        ) : (
          <DictateButton dictation={dictation} t={t} className="h-9 w-9 shrink-0 rounded-xl" />
        )}
      </form>

      {open && (
        // Over the page while it offers matches; just the "Add" row sits in the page, above the matches it shows
        <div id={listId} role="listbox" className={cn('overflow-hidden rounded-2xl border border-border/60 bg-popover p-1.5', suggest ? 'absolute inset-x-0 top-[calc(100%+6px)] z-30 shadow-xl' : 'mt-1.5')}>
          {entries.length > 1 ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(value)}
              className="flex w-full flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2 text-start hover:bg-accent"
            >
              <span className="me-1 text-sm font-semibold text-foreground">{t('grAddCount', { n: entries.length })}</span>
              {entries.map((e, i) => (
                <span key={i} className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs font-medium text-foreground">
                  {e.qty ? <span className="tabular-nums text-muted-foreground">{e.qty} </span> : null}{e.name}
                </span>
              ))}
            </button>
          ) : (
            <>
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onPick(item); setValue(''); }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-start hover:bg-accent"
                >
                  <ItemEmoji item={item} className="text-lg" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{t('grBoughtBefore')}</span>
                </button>
              ))}
              {!exact && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(value)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-start hover:bg-accent"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/15 text-primary"><Plus className="h-4 w-4" /></span>
                  <span className="flex-1 truncate text-sm text-foreground">{t('grAddNew', { name: entries[0]?.name || value.trim() })}</span>
                  {entries[0]?.qty && <span className="text-xs tabular-nums text-muted-foreground">{entries[0].qty}</span>}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
