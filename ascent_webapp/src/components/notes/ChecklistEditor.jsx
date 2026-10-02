import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from '@/lib/motion';
import { ChevronRight, CornerDownRight, GripVertical, Plus, RotateCcw, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { AutoTextarea } from './NoteParts';
import { blankItem, fmt, highlight, textDir } from './noteUtils';

const cleanLine = (l) => l.replace(/^\s*(?:[-*•]\s+|\[[ xX]\]\s*)/, '').trim();
const MAX_SUGGESTIONS = 5;

/**
 * What to offer while typing an item: a ticked item of this list comes back, an item already
 * on it is pointed to, and anything written on another checklist can be filled in.
 */
export function suggestFor(item, items, elsewhere = []) {
  const q = item.text.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  const here = new Set();
  for (const other of items) {
    const text = other.text.trim();
    if (other.id === item.id || !text) continue;
    here.add(text.toLowerCase());
    if (text.toLowerCase().includes(q)) out.push({ kind: other.done ? 'restore' : 'duplicate', text, id: other.id });
  }
  for (const text of elsewhere) {
    const lower = text.trim().toLowerCase();
    if (!lower || lower === q || here.has(lower) || !lower.includes(q)) continue;
    here.add(lower);
    out.push({ kind: 'fill', text: text.trim() });
  }
  // This list's own items first (ticked ones before ones still open), and what starts with the typed text
  const rank = (s) => (s.kind === 'fill' ? 4 : 0) + (s.text.toLowerCase().startsWith(q) ? 0 : 2) + (s.kind === 'duplicate' ? 1 : 0);
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s)
    .slice(0, MAX_SUGGESTIONS);
}

function Suggestions({ list, highlighted, query, onPick, t }) {
  return (
    <ul role="listbox" aria-label={t('ntItemSuggestions')} className="mb-1 ms-8 me-9 overflow-hidden rounded-xl border border-foreground/10 bg-popover/95 py-1 shadow-lg backdrop-blur">
      {list.map((s, i) => (
        <li key={`${s.kind}:${s.id || s.text}`} role="option" aria-selected={i === highlighted}>
          <button
            type="button"
            // Keep the item's text box focused so the pick lands before the list closes
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s)}
            dir={textDir(s.text)}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 px-3 text-start text-sm hover:bg-accent',
              i === highlighted && 'bg-accent'
            )}
          >
            {s.kind === 'restore'
              ? <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : s.kind === 'duplicate'
                ? <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                : <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className={cn('min-w-0 flex-1 truncate', s.kind === 'restore' && 'text-muted-foreground line-through')}>
              {highlight(s.text, query)}
            </span>
            {s.kind !== 'fill' && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.kind === 'restore' ? t('ntRestoreItem') : t('ntAlreadyOnList')}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Row({
  item, reorderable, readOnly, t, onChange, onRemove, onEnter, onBackspaceEmpty, onPasteLines, registerRef,
  onInsertBelow, suggestions, onPick, onFocusChange,
}) {
  const controls = useDragControls();
  const [highlighted, setHighlighted] = useState(-1);
  const [dismissed, setDismissed] = useState(null);
  const list = suggestions?.length && dismissed !== item.text ? suggestions : [];
  useEffect(() => { setHighlighted(-1); }, [item.text]);

  const Wrapper = reorderable ? Reorder.Item : 'div';
  const wrapperProps = reorderable
    ? { value: item, dragListener: false, dragControls: controls, whileDrag: { scale: 1.02, boxShadow: '0 10px 30px -10px hsl(0 0% 0% / 0.45)', zIndex: 20 } }
    : {};
  return (
    <Wrapper {...wrapperProps} className="group/row relative rounded-lg">
      {/* A Hebrew item sits right to left in an English list, and the other way round */}
      <div dir={textDir(item.text)} className="flex items-start gap-1.5">
        {!readOnly && reorderable && (
          <button
            type="button"
            aria-label={t('ntDragItem')}
            onPointerDown={(e) => controls.start(e)}
            className="mt-1 flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <Checkbox
          checked={item.done}
          disabled={readOnly}
          onCheckedChange={(v) => onChange({ ...item, done: !!v })}
          aria-label={item.text || t('ntListItem')}
          className="mt-[7px] h-[18px] w-[18px] rounded-md"
        />
        <AutoTextarea
          ref={registerRef}
          value={item.text}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...item, text: e.target.value.replace(/\n/g, ' ') })}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onPaste={(e) => {
            // Pasting several lines makes one item per line, like Keep
            if (readOnly || !onPasteLines) return;
            const text = e.clipboardData?.getData('text') || '';
            if (!/\r?\n/.test(text.trim())) return;
            const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
            if (lines.length < 2) return;
            e.preventDefault();
            onPasteLines(lines);
          }}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (list.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              // -1 is "nothing picked", so the arrows cycle through the list and back to the text
              const n = list.length + 1;
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setHighlighted(h => ((h + 1 + step + n) % n) - 1);
              return;
            }
            if (list.length && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(item.text); return; }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (highlighted >= 0 && list[highlighted]) onPick(list[highlighted]);
              else onEnter(e.currentTarget.selectionStart ?? item.text.length);
            }
            if (e.key === 'Backspace' && item.text === '') { e.preventDefault(); onBackspaceEmpty(); }
          }}
          placeholder={t('ntListItem')}
          aria-label={t('ntListItem')}
          className={cn('py-1 text-base leading-6 sm:text-sm', item.done && 'text-muted-foreground line-through')}
        />
        {!readOnly && (
          <button
            type="button"
            aria-label={t('ntDeleteItem')}
            onClick={onRemove}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {list.length > 0 && <Suggestions list={list} highlighted={highlighted} query={item.text.trim()} onPick={onPick} t={t} />}
      {onInsertBelow && (
        // A new item between this one and the next
        <button
          type="button"
          onClick={onInsertBelow}
          aria-label={t('ntInsertItemBelow')}
          title={t('ntInsertItemBelow')}
          className="absolute -bottom-2.5 start-7 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-foreground/15 bg-popover text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </Wrapper>
  );
}

/** Checklist body of a note: reorderable open items and a collapsible list of completed ones. */
export default function ChecklistEditor({ items, onChange, readOnly, autoFocus, t, suggestions }) {
  const refs = useRef({});
  const [showDone, setShowDone] = useState(false);
  const open = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  // The item being typed in, for suggestions. Blur waits a moment so a tapped suggestion still lands.
  const [focusedId, setFocusedId] = useState(null);
  const blurTimer = useRef(null);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const trackFocus = (id) => (on) => {
    clearTimeout(blurTimer.current);
    if (on) setFocusedId(id);
    else blurTimer.current = setTimeout(() => setFocusedId(cur => (cur === id ? null : cur)), 150);
  };
  const focusedItem = focusedId ? open.find(i => i.id === focusedId) : null;
  const offered = useMemo(
    () => (focusedItem && !readOnly ? suggestFor(focusedItem, items, suggestions) : []),
    [focusedItem, items, suggestions, readOnly]
  );

  // Land in the first empty row of a brand-new list
  useEffect(() => {
    if (!autoFocus) return;
    const first = items.find(i => !i.done && !i.text);
    if (first) requestAnimationFrame(() => refs.current[first.id]?.focus());
  }, []);

  const focusSoon = (id, caret) => requestAnimationFrame(() => {
    const el = refs.current[id];
    if (!el) return;
    el.focus();
    if (caret !== undefined) el.setSelectionRange(caret, caret);
  });

  const patch = (next) => onChange(next);

  const replace = (item) => patch(items.map(i => (i.id === item.id ? item : i)));

  const insertAfter = (id) => {
    const fresh = blankItem();
    const idx = items.findIndex(i => i.id === id);
    const next = [...items];
    next.splice(idx + 1, 0, fresh);
    patch(next);
    focusSoon(fresh.id);
  };

  // Enter at the end adds an item below, at the start adds one above, in the middle splits the item in two
  const enterAt = (id, caret) => {
    const idx = items.findIndex(i => i.id === id);
    const item = items[idx];
    if (!item || caret >= item.text.length) { insertAfter(id); return; }
    const next = [...items];
    if (caret <= 0) {
      const fresh = blankItem();
      next.splice(idx, 0, fresh);
      patch(next);
      focusSoon(fresh.id);
      return;
    }
    const rest = { ...blankItem(), text: item.text.slice(caret).trimStart() };
    next.splice(idx, 1, { ...item, text: item.text.slice(0, caret).trimEnd() }, rest);
    patch(next);
    focusSoon(rest.id, 0);
  };

  const pick = (rowId, s) => {
    const idx = items.findIndex(i => i.id === rowId);
    if (idx < 0) return;
    if (s.kind === 'fill') {
      const fresh = blankItem();
      const next = items.map(i => (i.id === rowId ? { ...i, text: s.text } : i));
      next.splice(idx + 1, 0, fresh);
      patch(next);
      focusSoon(fresh.id);
      return;
    }
    // A ticked item comes back in place of the one being typed; one already on the list is jumped to
    const target = items.find(i => i.id === s.id);
    if (!target) return;
    const next = items.filter(i => i.id !== rowId && i.id !== s.id);
    const at = items.slice(0, idx).filter(i => i.id !== s.id).length;
    next.splice(at, 0, s.kind === 'restore' ? { ...target, done: false } : target);
    patch(next);
    focusSoon(target.id, target.text.length);
  };

  const remove = (id) => patch(items.filter(i => i.id !== id));

  const pasteLines = (id, lines) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const current = items[idx];
    const fresh = lines.slice(1).map(text => ({ ...blankItem(), text }));
    const next = [...items];
    next.splice(idx, 1, { ...current, text: current.text ? `${current.text} ${lines[0]}` : lines[0] }, ...fresh);
    patch(next);
    focusSoon((fresh[fresh.length - 1] || current).id);
  };

  const backspaceEmpty = (id) => {
    const idx = open.findIndex(i => i.id === id);
    remove(id);
    const prev = open[idx - 1];
    if (prev) focusSoon(prev.id);
  };

  const reorderOpen = (nextOpen) => patch([...nextOpen, ...done]);

  const addItem = () => {
    const fresh = blankItem();
    patch([...open, fresh, ...done]);
    focusSoon(fresh.id);
  };

  return (
    <div className="space-y-0.5">
      <Reorder.Group axis="y" values={open} onReorder={reorderOpen} className="space-y-0.5">
        {open.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            reorderable={!readOnly}
            readOnly={readOnly}
            t={t}
            onChange={replace}
            onRemove={() => remove(item.id)}
            onEnter={(caret) => enterAt(item.id, caret)}
            onBackspaceEmpty={() => backspaceEmpty(item.id)}
            onPasteLines={(lines) => pasteLines(item.id, lines)}
            onInsertBelow={!readOnly && i < open.length - 1 ? () => insertAfter(item.id) : undefined}
            suggestions={focusedId === item.id ? offered : null}
            onPick={(s) => pick(item.id, s)}
            onFocusChange={trackFocus(item.id)}
            registerRef={(el) => { if (el) refs.current[item.id] = el; else delete refs.current[item.id]; }}
          />
        ))}
      </Reorder.Group>

      {!readOnly && (
        <button
          type="button"
          onClick={addItem}
          className="flex min-h-9 w-full items-center gap-2 rounded-lg px-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> {t('ntAddItem')}
        </button>
      )}

      {done.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            aria-expanded={showDone}
            className="flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform rtl:rotate-180', showDone && 'rotate-90 rtl:rotate-90')} />
            {fmt(t('ntCompletedCount'), { n: done.length })}
          </button>
          {showDone && (
            <div className="space-y-0.5">
              {done.map(item => (
                <Row
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  t={t}
                  onChange={replace}
                  onRemove={() => remove(item.id)}
                  onEnter={() => {}}
                  onBackspaceEmpty={() => remove(item.id)}
                  registerRef={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
