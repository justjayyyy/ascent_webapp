import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from '@/lib/motion';
import {
  ChevronRight, Coins, CornerDownRight, GripVertical, Heading, Highlighter, ImagePlus, ListOrdered, ListPlus, Pilcrow, Plus, RotateCcw, SquareCheck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AutoTextarea } from './NoteParts';
import { LinePicture } from './NoteExtras';
import {
  blankItem, canHaveAmount, fmt, formatAmount, hasAmount, highlight, isTickable, isTicked, lineKind, newItemId, parseAmount,
  textDir, useLatest,
} from './noteUtils';
import { amountTotals, lineNumbers, readPaste } from './noteDocument';
import { pictureFromSrc } from './importDocument';

const MAX_SUGGESTIONS = 5;

// The kinds of line a checklist can hold: tickable items, and text, titles, numbered lines and boxes between them.
// Pictures are added with their own button and stay pictures.
const KINDS = [
  { kind: 'item', icon: SquareCheck, label: 'ntKindItem' },
  { kind: 'text', icon: Pilcrow, label: 'ntKindText' },
  { kind: 'title', icon: Heading, label: 'ntKindTitle' },
  { kind: 'number', icon: ListOrdered, label: 'ntKindNumber' },
  { kind: 'callout', icon: Highlighter, label: 'ntKindCallout' },
];
// Lines that may run over several lines (Shift+Enter); the rest stay on one
const MULTILINE = new Set(['text', 'number', 'callout']);
const withKind = (item, kind) => {
  const { kind: _old, ...rest } = item;
  const next = kind === 'item' ? rest : { ...rest, kind, done: false };
  if (!canHaveAmount(next)) { delete next.amount; delete next.currency; }
  if (!MULTILINE.has(kind)) next.text = next.text.replace(/\n/g, ' ');
  return next;
};
const withoutAmount = ({ amount: _a, currency: _c, ...rest }) => rest;
const PLACEHOLDER = { item: 'ntListItem', text: 'ntTextLine', title: 'ntTitleLine', number: 'ntNumberLine', callout: 'ntCalloutLine' };

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

/** Switches a line between a checkbox item, text, a title, a numbered line and a box, and gives it an amount. */
function KindMenu({ item, onChange, onAmount, t }) {
  const kind = lineKind(item);
  const Current = KINDS.find(k => k.kind === kind)?.icon || SquareCheck;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('ntLineKind')}
          title={t('ntLineKind')}
          // On touch screens it shows on the line being edited, leaving the others their full width
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:hidden [@media(hover:none)]:opacity-60 [@media(hover:none)]:group-focus-within/row:flex [@media(hover:none)]:data-[state=open]:flex"
        >
          <Current className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('ntLineKind')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={kind} onValueChange={onChange}>
          {KINDS.map(({ kind: k, icon: Icon, label }) => (
            <DropdownMenuRadioItem key={k} value={k}>
              <Icon className="me-2 h-4 w-4" /> {t(label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {canHaveAmount(item) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAmount}>
              <Coins className="me-2 h-4 w-4" /> {hasAmount(item) ? t('ntRemoveAmount') : t('ntAddAmount')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The amount on the side of a line: the number while you type it, written as money otherwise. */
function AmountInput({ item, currency, language, readOnly, onChange, t, inputRef }) {
  const [typing, setTyping] = useState(null);
  const cur = item.currency || currency;
  const shown = typing ?? (item.amount ? formatAmount(item.amount, cur, language) : '');
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={shown}
      readOnly={readOnly}
      placeholder={formatAmount(0, cur, language)}
      aria-label={item.text ? `${t('ntAmount')}: ${item.text.split('\n')[0]}` : t('ntAmount')}
      onFocus={() => { if (!readOnly) setTyping(item.amount ? String(item.amount) : ''); }}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        setTyping(e.target.value);
        const money = parseAmount(e.target.value);
        if (money) onChange(money.amount);
        else if (!e.target.value.trim()) onChange(0);
      }}
      className="mt-0.5 h-8 w-[5.25rem] shrink-0 rounded-lg sm:w-[6.5rem] bg-transparent px-1.5 text-end text-sm font-medium tabular-nums outline-none placeholder:text-muted-foreground/50 focus:bg-foreground/[0.06] read-only:focus:bg-transparent"
    />
  );
}

/** The sum under a run of lines with amounts. */
function TotalRow({ totals, language, t, editable }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 border-t border-dashed border-foreground/20 pb-1 pt-1.5 text-sm', editable ? 'pe-[4.5rem] [@media(hover:none)]:pe-[2.4rem]' : 'pe-0')}>
      <span className="text-muted-foreground">{t('ntTotal')}</span>
      <span className="min-w-[5.25rem] px-1.5 text-end font-semibold tabular-nums sm:min-w-[6.5rem]">
        {totals.map(s => formatAmount(s.amount, s.currency, language)).join(' + ')}
      </span>
    </div>
  );
}

function Row({
  item, number, total, reorderable, readOnly, t, onChange, onRemove, onEnter, onBackspaceEmpty, onPasteLines, registerRef,
  onKind, suggestions, onPick, onFocusChange, noteId, online, currency, language,
}) {
  const controls = useDragControls();
  const [highlighted, setHighlighted] = useState(-1);
  const [dismissed, setDismissed] = useState(null);
  const amountRef = useRef(null);
  const list = suggestions?.length && dismissed !== item.text ? suggestions : [];
  useEffect(() => { setHighlighted(-1); }, [item.text]);
  const kind = lineKind(item);

  const Wrapper = reorderable ? Reorder.Item : 'div';
  const wrapperProps = reorderable
    ? { value: item, dragListener: false, dragControls: controls, whileDrag: { scale: 1.02, boxShadow: '0 10px 30px -10px hsl(0 0% 0% / 0.45)', zIndex: 20 } }
    : {};

  const toggleAmount = () => {
    if (hasAmount(item)) { onChange(withoutAmount(item)); return; }
    onChange({ ...item, amount: 0, ...(currency ? { currency } : {}) });
    requestAnimationFrame(() => amountRef.current?.focus());
  };

  const grip = !readOnly && reorderable && (
    <button
      type="button"
      aria-label={t('ntDragItem')}
      onPointerDown={(e) => controls.start(e)}
      className="mt-1 flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  const removeButton = !readOnly && (
    <button
      type="button"
      aria-label={kind === 'image' ? t('ntRemovePicture') : t('ntDeleteItem')}
      onClick={onRemove}
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60"
    >
      <X className="h-4 w-4" />
    </button>
  );

  if (kind === 'image') {
    return (
      <Wrapper {...wrapperProps} className="group/row relative rounded-lg py-1">
        <div className="flex items-start gap-1.5">
          {grip}
          <figure className="min-w-0 flex-1">
            <LinePicture noteId={noteId} fileId={item.fileId} load={online} alt={item.text} className="max-h-80" />
            {(!readOnly || item.text) && (
              <AutoTextarea
                ref={registerRef}
                value={item.text}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...item, text: e.target.value.replace(/\n/g, ' ') })}
                onFocus={() => onFocusChange?.(true)}
                onBlur={() => onFocusChange?.(false)}
                onKeyDown={(e) => {
                  if (!readOnly && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); }
                }}
                placeholder={t('ntCaption')}
                aria-label={t('ntCaption')}
                className="mt-1 py-0.5 text-center text-xs leading-5 text-muted-foreground"
              />
            )}
          </figure>
          {removeButton}
        </div>
      </Wrapper>
    );
  }

  const multiline = MULTILINE.has(kind);
  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'group/row relative rounded-lg',
        kind === 'title' && 'pt-2',
        kind === 'callout' && 'my-1 rounded-xl border-s-[3px] border-foreground/25 bg-foreground/[0.06] py-1 ps-1'
      )}
    >
      {/* A Hebrew line sits right to left in an English list, and the other way round */}
      <div dir={textDir(item.text)} className="flex items-start gap-1.5">
        {grip}
        {kind === 'item' && (
          <Checkbox
            checked={item.done}
            disabled={readOnly}
            onCheckedChange={(v) => onChange({ ...item, done: !!v })}
            aria-label={item.text || t('ntListItem')}
            className="mt-[7px] h-[18px] w-[18px] rounded-md"
          />
        )}
        {kind === 'number' && (
          <span aria-hidden className="min-w-[1.5rem] shrink-0 py-1 text-end text-base font-medium leading-6 tabular-nums text-muted-foreground sm:text-sm">
            {number}.
          </span>
        )}
        <AutoTextarea
          ref={registerRef}
          value={item.text}
          readOnly={readOnly}
          onChange={(e) => {
            let text = e.target.value;
            // Only text, numbered lines and boxes may run over several lines
            if (!multiline) text = text.replace(/\n/g, ' ');
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
            // Several lines, or a page or document, make one line each: items, titles, text, numbered lines,
            // boxes, amounts and pictures where the copy has them. Multi-line kinds keep plain text as typed.
            if (readOnly || !onPasteLines) return;
            const html = e.clipboardData?.getData('text/html') || '';
            const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || '';
            const lines = readPaste({ html, text: multiline ? '' : text });
            if (!lines || (multiline && lines.every(l => lineKind(l) === 'text' && !('amount' in l)))) return;
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
        {hasAmount(item) && (
          <AmountInput
            item={item}
            currency={currency}
            language={language}
            readOnly={readOnly}
            onChange={(amount) => onChange({ ...item, amount })}
            t={t}
            inputRef={amountRef}
          />
        )}
        {!readOnly && onKind && <KindMenu item={item} onChange={onKind} onAmount={toggleAmount} t={t} />}
        {removeButton}
      </div>
      {list.length > 0 && <Suggestions list={list} highlighted={highlighted} query={item.text.trim()} onPick={onPick} t={t} />}
      {total && <TotalRow totals={total} language={language} t={t} editable={!readOnly} />}
    </Wrapper>
  );
}

/**
 * Checklist body of a note: reorderable open lines (items, text, titles, numbered lines, boxes, pictures,
 * amounts with their totals) and a collapsible list of completed ones. `onAddImage(blob)` uploads a picture
 * to the note and resolves to its file id (null when it cannot). Where there is no note yet (the composer),
 * a paste with pictures goes to `onPasteDocument(lines)` whole, to become a note that can hold them.
 */
export default function ChecklistEditor({
  items, onChange, readOnly, autoFocus, t, suggestions, noteId, online = true, currency, language, onAddImage, onPasteDocument,
}) {
  const refs = useRef({});
  const pictureInput = useRef(null);
  const [showDone, setShowDone] = useState(false);
  const itemsRef = useLatest(items);
  const open = items.filter(i => !isTicked(i));
  const done = items.filter(isTicked);
  const numbers = useMemo(() => lineNumbers(open), [open]);
  const totals = useMemo(() => amountTotals(open, currency), [open, currency]);
  const canPicture = !!onAddImage && online && !readOnly;

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

  const replace = (item) => patch(itemsRef.current.map(i => (i.id === item.id ? item : i)));

  // New lines go right under `afterId`, or at the end of the open lines
  const insertLines = (afterId, fresh) => {
    const list = itemsRef.current;
    const idx = afterId ? list.findIndex(i => i.id === afterId) : -1;
    if (idx < 0) {
      const openNow = list.filter(i => !isTicked(i));
      patch([...openNow, ...fresh, ...list.filter(isTicked)]);
    } else {
      const next = [...list];
      next.splice(idx + 1, 0, ...fresh);
      patch(next);
    }
    focusLastOpen(fresh);
  };

  // The cursor goes to the last of the new lines still on screen (a ticked one is folded away)
  const focusLastOpen = (fresh) => {
    const target = [...fresh].reverse().find(i => !isTicked(i));
    if (target) focusSoon(target.id);
  };

  const insertAfter = (id, kind) => insertLines(id, [blankItem(kind)]);

  const addLine = (kind, extra = {}) => insertLines(focusedItem?.id, [{ ...blankItem(kind), ...extra }]);

  const addPicture = async (file) => {
    if (!file || !onAddImage) return;
    const anchor = focusedItem?.id;
    const loading = toast.loading(t('ntAddingPictures'));
    const fileId = await onAddImage(file);
    toast.dismiss(loading);
    if (!fileId) { toast.error(t('ntPictureFailed')); return; }
    insertLines(anchor, [{ ...blankItem('image'), fileId }]);
  };

  const setKind = (id, kind) => {
    patch(itemsRef.current.map(i => (i.id === id ? withKind(i, kind) : i)));
    focusSoon(id);
  };

  const pick = (rowId, s) => {
    const list = itemsRef.current;
    const idx = list.findIndex(i => i.id === rowId);
    if (idx < 0) return;
    if (s.kind === 'fill') {
      const fresh = blankItem();
      const next = list.map(i => (i.id === rowId ? { ...i, text: s.text } : i));
      next.splice(idx + 1, 0, fresh);
      patch(next);
      focusSoon(fresh.id);
      return;
    }
    // A ticked item comes back in place of the one being typed; one already on the list is jumped to
    const target = list.find(i => i.id === s.id);
    if (!target) return;
    const next = list.filter(i => i.id !== rowId && i.id !== s.id);
    const at = list.slice(0, idx).filter(i => i.id !== s.id).length;
    next.splice(at, 0, s.kind === 'restore' ? { ...target, done: false } : target);
    patch(next);
    focusSoon(target.id, target.text.length);
  };

  const remove = (id) => patch(itemsRef.current.filter(i => i.id !== id));

  // A paste of several lines: pictures in it are uploaded first, then everything goes in where the paste was
  const pasteLines = async (id, lines) => {
    let ready = lines;
    const pictures = lines.some(l => l.kind === 'image');
    if (pictures && !canPicture && onPasteDocument) {
      const list = itemsRef.current;
      const at = list.findIndex(i => i.id === id);
      const fresh = lines.map(line => ({ done: false, ...line, id: newItemId() }));
      const kept = list.filter(i => i.text || i.id !== id);
      const pos = at < 0 ? kept.length : kept.findIndex(i => i.id === id) + 1 || at;
      onPasteDocument([...kept.slice(0, pos), ...fresh, ...kept.slice(pos)]);
      return;
    }
    if (pictures) {
      const loading = canPicture ? toast.loading(t('ntAddingPictures')) : null;
      let missed = 0;
      ready = [];
      for (const line of lines) {
        if (line.kind !== 'image') { ready.push(line); continue; }
        const fileId = canPicture ? await pictureFromSrc(line.src).then(onAddImage).catch(() => null) : null;
        if (fileId) ready.push({ kind: 'image', text: line.text || '', fileId });
        else missed += 1;
      }
      if (loading) toast.dismiss(loading);
      if (missed) toast.error(fmt(t('ntPicturesSkipped'), { n: missed }));
    }
    if (!ready.length) return;
    const fresh = ready.map(({ src: _src, ...line }) => ({ done: false, ...line, id: newItemId() }));
    const list = itemsRef.current;
    const current = list.find(i => i.id === id);
    // An empty line takes the first pasted one's place; one with text keeps it and the paste goes under
    if (current && !current.text && lineKind(current) !== 'image') {
      const idx = list.indexOf(current);
      const next = [...list];
      next.splice(idx, 1, ...fresh);
      patch(next);
      focusLastOpen(fresh);
    } else {
      insertLines(current ? id : null, fresh);
    }
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
  const shared = { t, noteId, online, currency, language };

  return (
    <div className="space-y-0.5">
      <Reorder.Group axis="y" values={open} onReorder={reorderOpen} className="space-y-0.5">
        {open.map((item, i) => (
            <Row
              {...shared}
              key={item.id}
              item={item}
              number={numbers[i]}
              total={totals.get(i)}
              reorderable={!readOnly}
              readOnly={readOnly}
              onChange={replace}
              onRemove={() => remove(item.id)}
              onEnter={() => insertAfter(item.id, lineKind(item) === 'number' ? 'number' : undefined)}
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
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" {...keepFocus} className={addButton}>
                <ListPlus className="h-4 w-4" /> {t('ntAddMore')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => addLine('number')}>
                <ListOrdered className="me-2 h-4 w-4" /> {t('ntAddNumber')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => addLine('callout')}>
                <Highlighter className="me-2 h-4 w-4" /> {t('ntAddCallout')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => addLine('text', { amount: 0, ...(currency ? { currency } : {}) })}>
                <Coins className="me-2 h-4 w-4" /> {t('ntAddAmountLine')}
              </DropdownMenuItem>
              {onAddImage && (
                <DropdownMenuItem disabled={!canPicture} onSelect={() => pictureInput.current?.click()}>
                  <ImagePlus className="me-2 h-4 w-4" /> {online ? t('ntAddPicture') : t('ntNeedOnline')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {onAddImage && (
            <input
              ref={pictureInput}
              type="file"
              accept="image/*"
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => { addPicture(e.target.files?.[0]); e.target.value = ''; }}
            />
          )}
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
                  {...shared}
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
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
