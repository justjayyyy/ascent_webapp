import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from '@/lib/motion';
import {
  ChevronRight, CornerDownRight, GripVertical, Heading, Pilcrow, Plus, RotateCcw, SquareCheck, X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AutoTextarea } from './NoteParts';
import { blankItem, fmt, highlight, isTickable, isTicked, lineKind, parseLines, textDir } from './noteUtils';

const MAX_SUGGESTIONS = 5;

// The kinds of line a checklist can hold: tickable items, and plain text or titles between them
const KINDS = [
  { kind: 'item', icon: SquareCheck, label: 'ntKindItem' },
  { kind: 'text', icon: Pilcrow, label: 'ntKindText' },
  { kind: 'title', icon: Heading, label: 'ntKindTitle' },
];
const withKind = (item, kind) => {
  const { kind: _old, ...rest } = item;
  return kind === 'item' ? rest : { ...rest, kind, done: false };
};
const PLACEHOLDER = { item: 'ntListItem', text: 'ntTextLine', title: 'ntTitleLine' };

/**
 * What to offer while typing an item: a ticked item of this list comes back, an item already
 * on it is pointed to, and anything written on another checklist can be filled in.
 */
export function suggestFor(item, items, elsewhere = []) {
  const q = item.text.trim().toLowerCase();
  if (!q || !isTickable(item)) return [];
  const out = [];
  const here = new Set();
  for (const other of items) {
    const text = other.text.trim();
    if (other.id === item.id || !text || !isTickable(other)) continue;
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

/** Switches a line between a checkbox item, plain text and a title. */
function KindMenu({ kind, onChange, t }) {
  const Current = KINDS.find(k => k.kind === kind)?.icon || SquareCheck;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('ntLineKind')}
          title={t('ntLineKind')}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-60"
        >
          <Current className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('ntLineKind')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={kind} onValueChange={onChange}>
          {KINDS.map(({ kind: k, icon: Icon, label }) => (
            <DropdownMenuRadioItem key={k} value={k}>
              <Icon className="me-2 h-4 w-4" /> {t(label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({
  item, reorderable, readOnly, t, onChange, onRemove, onEnter, onBackspaceEmpty, onPasteLines, registerRef,
  onKind, suggestions, onPick, onFocusChange,
}) {
  const controls = useDragControls();
  const [highlighted, setHighlighted] = useState(-1);
  const [dismissed, setDismissed] = useState(null);
  const list = suggestions?.length && dismissed !== item.text ? suggestions : [];
  useEffect(() => { setHighlighted(-1); }, [item.text]);
  const kind = lineKind(item);

  const Wrapper = reorderable ? Reorder.Item : 'div';
  const wrapperProps = reorderable
    ? { value: item, dragListener: false, dragControls: controls, whileDrag: { scale: 1.02, boxShadow: '0 10px 30px -10px hsl(0 0% 0% / 0.45)', zIndex: 20 } }
    : {};
  return (
    <Wrapper {...wrapperProps} className={cn('group/row relative rounded-lg', kind === 'title' && 'pt-2')}>
      {/* A Hebrew line sits right to left in an English list, and the other way round */}
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
        {kind === 'item' && (
          <Checkbox
            checked={item.done}
            disabled={readOnly}
            onCheckedChange={(v) => onChange({ ...item, done: !!v })}
            aria-label={item.text || t('ntListItem')}
            className="mt-[7px] h-[18px] w-[18px] rounded-md"
          />
        )}
        <AutoTextarea
          ref={registerRef}
          value={item.text}
          readOnly={readOnly}
          onChange={(e) => {
            let text = e.target.value;
            // Only plain text may run over several lines
            if (kind !== 'text') text = text.replace(/\n/g, ' ');
            // "# " at the start of an item makes it a title, like in most editors
            if (kind === 'item' && /^#\s/.test(text) && !/^#\s/.test(item.text)) {
              onChange(withKind({ ...item, text: text.slice(2) }, 'title'));
              return;
            }
            onChange({ ...item, text });
          }}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onPaste={(e) => {
            // Pasting several lines makes one line each: items, and titles and text where the copy marks them
            if (readOnly || !onPasteLines || kind === 'text') return;
            const text = e.clipboardData?.getData('text') || '';
            if (!/\r?\n/.test(text.trim())) return;
            const lines = parseLines(text);
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
              else onEnter();
            }
            if (e.key === 'Backspace' && item.text === '') {
              e.preventDefault();
              // An empty title or text line turns back into an item first
              if (kind !== 'item') onKind('item');
              else onBackspaceEmpty();
            }
          }}
          placeholder={t(PLACEHOLDER[kind])}
          aria-label={t(PLACEHOLDER[kind])}
          className={cn(
            'py-1',
            kind === 'title' ? 'text-lg font-semibold leading-7 tracking-tight sm:text-base' : 'text-base leading-6 sm:text-sm',
            kind === 'item' && item.done && 'text-muted-foreground line-through'
          )}
        />
        {!readOnly && onKind && <KindMenu kind={kind} onChange={onKind} t={t} />}
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
    </Wrapper>
  );
}

/** Checklist body of a note: reorderable open lines (items, text, titles) and a collapsible list of completed ones. */
export default function ChecklistEditor({ items, onChange, readOnly, autoFocus, t, suggestions }) {
  const refs = useRef({});
  const [showDone, setShowDone] = useState(false);
  const open = items.filter(i => !isTicked(i));
  const done = items.filter(isTicked);

  // The line being typed in, for suggestions and for where new lines go.
  // Blur waits a moment so a tapped suggestion or add button still knows the line.
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

  // Focus a line once it is on screen: a new line only exists after the list re-renders with it
  const wantFocus = useRef(null);
  const focusPending = () => {
    const want = wantFocus.current;
    const el = want && refs.current[want.id];
    if (!el) return false;
    wantFocus.current = null;
    el.focus();
    if (want.caret !== undefined) el.setSelectionRange(want.caret, want.caret);
    return true;
  };
  useEffect(() => { focusPending(); });
  const focusSoon = (id, caret) => {
    wantFocus.current = { id, caret };
    // Already on screen (an existing line): no re-render may come, so try on the next frame too
    requestAnimationFrame(focusPending);
  };

  const patch = (next) => onChange(next);

  const replace = (item) => patch(items.map(i => (i.id === item.id ? item : i)));

  const insertAfter = (id, kind) => {
    const fresh = blankItem(kind);
    const idx = items.findIndex(i => i.id === id);
    const next = [...items];
    next.splice(idx + 1, 0, fresh);
    patch(next);
    focusSoon(fresh.id);
  };

  // New lines go right under the line you were in, or at the end of the list
  const addLine = (kind) => {
    const anchor = focusedItem;
    if (anchor) { insertAfter(anchor.id, kind); return; }
    const fresh = blankItem(kind);
    patch([...open, fresh, ...done]);
    focusSoon(fresh.id);
  };

  const setKind = (id, kind) => {
    patch(items.map(i => (i.id === id ? withKind(i, kind) : i)));
    focusSoon(id);
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
    const fresh = lines.map(line => ({ ...blankItem(line.kind), text: line.text, done: line.done }));
    // An empty line takes the first pasted one's place; one with text keeps it and the paste goes under
    const next = [...items];
    next.splice(idx, 1, ...(current.text ? [current, ...fresh] : fresh));
    patch(next);
    focusSoon(fresh[fresh.length - 1].id);
  };

  const backspaceEmpty = (id) => {
    const idx = open.findIndex(i => i.id === id);
    remove(id);
    const prev = open[idx - 1];
    if (prev) focusSoon(prev.id);
  };

  const reorderOpen = (nextOpen) => patch([...nextOpen, ...done]);

  // Keep the line's text box focused while an add button is pressed, so the new line goes under it
  const keepFocus = { onPointerDown: (e) => e.preventDefault(), onMouseDown: (e) => e.preventDefault() };
  const addButton = 'flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground';

  return (
    <div className="space-y-0.5">
      <Reorder.Group axis="y" values={open} onReorder={reorderOpen} className="space-y-0.5">
        {open.map(item => (
          <Row
            key={item.id}
            item={item}
            reorderable={!readOnly}
            readOnly={readOnly}
            t={t}
            onChange={replace}
            onRemove={() => remove(item.id)}
            onEnter={() => insertAfter(item.id)}
            onBackspaceEmpty={() => backspaceEmpty(item.id)}
            onPasteLines={(lines) => pasteLines(item.id, lines)}
            onKind={(kind) => setKind(item.id, kind)}
            suggestions={focusedId === item.id ? offered : null}
            onPick={(s) => pick(item.id, s)}
            onFocusChange={trackFocus(item.id)}
            registerRef={(el) => { if (el) refs.current[item.id] = el; else delete refs.current[item.id]; }}
          />
        ))}
      </Reorder.Group>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-x-1">
          <button type="button" {...keepFocus} onClick={() => addLine('item')} className={addButton}>
            <Plus className="h-4 w-4" /> {t('ntAddItem')}
          </button>
          <button type="button" {...keepFocus} onClick={() => addLine('text')} className={addButton}>
            <Pilcrow className="h-4 w-4" /> {t('ntAddText')}
          </button>
          <button type="button" {...keepFocus} onClick={() => addLine('title')} className={addButton}>
            <Heading className="h-4 w-4" /> {t('ntAddTitle')}
          </button>
        </div>
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
