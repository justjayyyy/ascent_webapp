import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Baseline, Bold, Italic, RemoveFormatting, Strikethrough, Underline, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { textDir } from './noteUtils';
import {
  clearMarks, drawRich, marksAt, plainText, readRich, replaceRich, spliceRich, toggleMark,
} from './richText';

// Ctrl/⌘+B, I and U as everywhere, Ctrl/⌘+Shift+X strikes through, Ctrl/⌘+\ takes the formatting off
const SHORTCUT_MARKS = { b: 'b', i: 'i', u: 'u' };
// Formatting asked for by the browser itself (the B I U on a phone's selection menu)
const FORMAT_INPUTS = { formatBold: 'b', formatItalic: 'i', formatUnderline: 'u', formatStrikeThrough: 's' };
const FORMAT_EVENT = 'note-format';

const layout = (root) => {
  const points = [];
  const value = readRich(root, points);
  return { value, points, length: plainText(value).length };
};

// Where a place on the page is in the line's plain text
function offsetOf(root, { points, length }, node, offset) {
  if (node.nodeType === 3) {
    const at = points.find(p => p.node === node);
    if (at) return at.start + Math.min(offset, at.length);
  }
  // Between nodes: where the first text or break after it starts
  const range = root.ownerDocument.createRange();
  range.setStart(node, offset);
  for (const p of points) {
    const after = p.node.nodeType === 3
      ? range.comparePoint(p.node, 0)
      : range.comparePoint(p.node.parentNode, [...p.node.parentNode.childNodes].indexOf(p.node));
    if (after >= 0) return p.start;
  }
  return length;
}

// The place on the page for a place in the plain text; between two pieces, the end of the one before, so
// typing there goes on in its formatting
function pointAt(root, { points }, at) {
  for (const p of points) {
    if (p.node.nodeType === 3 && at >= p.start && at <= p.start + p.length) return [p.node, at - p.start];
    if (p.node.nodeType === 1 && at === p.start) return [p.node.parentNode, [...p.node.parentNode.childNodes].indexOf(p.node)];
  }
  const last = root.lastChild;
  const count = root.childNodes.length;
  return [root, last && last.nodeType === 1 && last.tagName === 'BR' ? count - 1 : count];
}

function selectionIn(root) {
  const sel = root.ownerDocument.getSelection?.();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const box = layout(root);
  const start = offsetOf(root, box, range.startContainer, range.startOffset);
  return [start, range.collapsed ? start : offsetOf(root, box, range.endContainer, range.endOffset)];
}

function select(root, start, end = start) {
  const sel = root.ownerDocument.getSelection?.();
  if (!sel) return;
  const box = layout(root);
  const clamp = (n) => Math.max(0, Math.min(box.length, n));
  const range = root.ownerDocument.createRange();
  range.setStart(...pointAt(root, box, clamp(start)));
  range.setEnd(...pointAt(root, box, clamp(end)));
  sel.removeAllRanges();
  sel.addRange(range);
}

// What a line drawn from `text` looks like, to tell when the browser left the page in another shape
const drawnHtml = (doc, text) => {
  const box = doc.createElement('div');
  drawRich(box, text);
  return box.innerHTML;
};

/**
 * A line of a note that can be formatted in parts (bold, italic, underline, strikethrough), standing in for a
 * textarea: it grows with its text, runs the way its text is written, and is used like one. `value` is the text
 * with its formatting (see richText.js); `onChange` gets `{ target: { value, selectionStart, selectionEnd } }`;
 * the element has `value` (its plain text), `selectionStart`, `selectionEnd` and `setSelectionRange()` counted in
 * plain text, and `format(mark)`, `clearFormat()` and `activeMarks()` for a formatting bar.
 */
export const RichTextarea = forwardRef(function RichTextarea({
  value, onChange, onKeyDown, onPaste, onFocus, onBlur, readOnly, placeholder, className, ...props
}, ref) {
  const el = useRef(null);
  const shown = useRef(null); // the text the line on the page shows
  const wantSelection = useRef(null); // where the cursor goes once the line shows its new text
  const lastSelection = useRef(null);
  const pending = useRef(null); // formatting picked with nothing selected, for what is typed there next
  const composing = useRef(false);
  const latest = useRef({});
  latest.current = { value, onChange, onKeyDown, readOnly };
  const [empty, setEmpty] = useState(!plainText(value));

  const selection = () => (el.current && selectionIn(el.current)) || lastSelection.current;
  const announce = () => el.current?.dispatchEvent(new Event(FORMAT_EVENT, { bubbles: true }));

  const emit = (next, sel) => {
    const at = sel || [plainText(next).length, plainText(next).length];
    latest.current.onChange?.({ target: { value: next, selectionStart: at[0], selectionEnd: at[1] } });
  };

  // A change made here rather than typed: saved, and shown when it comes back as `value`
  const change = (next, sel) => {
    wantSelection.current = sel;
    lastSelection.current = sel;
    emit(next, sel);
  };

  const current = () => shown.current ?? latest.current.value ?? '';

  const insert = (text, { rich = false } = {}) => {
    const sel = selection() || [plainText(current()).length, plainText(current()).length];
    const [from, to] = sel;
    const marks = pending.current && from === to && pending.current.at === from ? pending.current.marks : undefined;
    pending.current = null;
    const next = rich ? spliceRich(current(), from, to, text) : replaceRich(current(), from, to, text, marks);
    const at = from + (rich ? plainText(text).length : text.length);
    change(next, [at, at]);
  };

  const format = (mark) => {
    if (latest.current.readOnly) return;
    const sel = selection();
    if (!sel) return;
    const [from, to] = sel;
    if (from === to) {
      // Nothing selected: what is typed here next gets it (or loses it)
      const base = pending.current?.at === from ? pending.current.marks : marksAt(current(), from);
      pending.current = { at: from, marks: base.includes(mark) ? base.replace(mark, '') : base + mark };
      announce();
      return;
    }
    change(toggleMark(current(), from, to, mark), sel);
  };

  const clearFormat = () => {
    if (latest.current.readOnly) return;
    const sel = selection();
    if (!sel) return;
    if (sel[0] === sel[1]) { pending.current = { at: sel[0], marks: '' }; announce(); return; }
    change(clearMarks(current(), sel[0], sel[1]), sel);
  };

  const activeMarks = () => {
    const sel = selection();
    if (!sel) return '';
    if (sel[0] === sel[1] && pending.current?.at === sel[0]) return pending.current.marks;
    return marksAt(current(), sel[0], sel[1]);
  };

  // Enter: the line's own keys decide first (a new line, a new item…), otherwise it is a line break in the text
  const enter = (event) => {
    latest.current.onKeyDown?.(event);
    if (!event.defaultPrevented && !latest.current.readOnly) { event.preventDefault(); insert('\n'); }
  };

  const handlers = useRef({});
  handlers.current = { format, clearFormat, activeMarks, insert, enter };

  // Draw the text when it comes from outside (opening, a formatting change, undo, someone else's edit)
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || value === shown.current || composing.current) return;
    const focused = node.ownerDocument.activeElement === node;
    const sel = wantSelection.current || (focused ? selectionIn(node) : null);
    drawRich(node, value ?? '');
    shown.current = value ?? '';
    setEmpty(!plainText(value));
    if (focused && sel) { select(node, ...sel); wantSelection.current = null; }
  }, [value]);

  // What was typed, read back from the page; the page is drawn again when the browser left it in another shape
  const readPage = (redraw) => {
    const node = el.current;
    const next = readRich(node);
    shown.current = next;
    setEmpty(!plainText(next));
    const sel = selectionIn(node);
    if (redraw && node.innerHTML !== drawnHtml(node.ownerDocument, next)) {
      drawRich(node, next);
      if (sel) select(node, ...sel);
    }
    lastSelection.current = sel;
    emit(next, sel);
  };

  const onInput = (e) => {
    if (composing.current || e.nativeEvent?.isComposing) { readPage(false); return; }
    readPage(true);
  };

  // The browser's own events: formatting from its menus, Enter from keyboards that send no key, typing in a
  // format picked with nothing selected
  useEffect(() => {
    const node = el.current;
    const before = (e) => {
      if (latest.current.readOnly) return;
      const mark = FORMAT_INPUTS[e.inputType];
      if (mark) { e.preventDefault(); handlers.current.format(mark); return; }
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault();
        const event = {
          key: 'Enter', shiftKey: e.inputType === 'insertLineBreak', ctrlKey: false, metaKey: false, altKey: false,
          nativeEvent: { isComposing: false }, target: node, currentTarget: node, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
        };
        handlers.current.enter(event);
        return;
      }
      if (e.inputType === 'insertText' && e.data && pending.current) {
        const sel = selectionIn(node);
        if (sel && sel[0] === sel[1] && sel[0] === pending.current.at) { e.preventDefault(); handlers.current.insert(e.data); }
      }
    };
    const selectionChanged = () => {
      if (node.ownerDocument.activeElement !== node) return;
      const sel = selectionIn(node);
      if (sel) lastSelection.current = sel;
      if (pending.current && (!sel || sel[0] !== pending.current.at)) pending.current = null;
    };
    node.addEventListener('beforeinput', before);
    node.ownerDocument.addEventListener('selectionchange', selectionChanged);
    return () => {
      node.removeEventListener('beforeinput', before);
      node.ownerDocument.removeEventListener('selectionchange', selectionChanged);
    };
  }, []);

  const attach = (node) => {
    el.current = node;
    if (node && !node.richLine) {
      node.richLine = true;
      Object.defineProperties(node, {
        value: { configurable: true, get: () => plainText(shown.current ?? latest.current.value) },
        selectionStart: { configurable: true, get: () => (selection() || [plainText(current()).length])[0] },
        selectionEnd: { configurable: true, get: () => { const s = selection(); return s ? s[1] : plainText(current()).length; } },
        setSelectionRange: {
          configurable: true,
          value: (start, end = start) => {
            lastSelection.current = [start, end];
            if (shown.current === latest.current.value && node.ownerDocument.activeElement === node) select(node, start, end);
            else wantSelection.current = [start, end];
          },
        },
        format: { configurable: true, value: (mark) => handlers.current.format(mark) },
        clearFormat: { configurable: true, value: () => handlers.current.clearFormat() },
        activeMarks: { configurable: true, value: () => handlers.current.activeMarks() },
      });
    }
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <div
      ref={attach}
      role="textbox"
      aria-multiline="true"
      aria-readonly={readOnly || undefined}
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      data-rich-line=""
      contentEditable={!readOnly}
      suppressContentEditableWarning
      tabIndex={0}
      dir={textDir(value)}
      onInput={onInput}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => {
        composing.current = false;
        readPage(true);
        // A change made to the text while it was being composed shows now
        const node = el.current;
        if (latest.current.value !== shown.current && node) {
          drawRich(node, latest.current.value ?? '');
          shown.current = latest.current.value ?? '';
        }
      }}
      onKeyDown={(e) => {
        const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
        if (mod && !readOnly) {
          const key = e.key.toLowerCase();
          const mark = e.shiftKey ? (key === 'x' ? 's' : null) : SHORTCUT_MARKS[key];
          if (mark) { e.preventDefault(); format(mark); return; }
          if (key === '\\') { e.preventDefault(); clearFormat(); return; }
        }
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && !composing.current) { enter(e); return; }
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented || readOnly) return;
        e.preventDefault();
        const text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
        const html = e.clipboardData?.getData('text/html') || '';
        // Copied from a page or a document: its bold, italic, underline and strikethrough come along
        if (html && typeof DOMParser !== 'undefined') {
          const rich = readRich(new DOMParser().parseFromString(html, 'text/html').body, undefined, { html: true });
          if (plainText(rich)) { insert(rich, { rich: true }); return; }
        }
        if (text) insert(text);
      }}
      onDrop={(e) => { if (readOnly) e.preventDefault(); }}
      onFocus={(e) => {
        const want = wantSelection.current;
        if (want && shown.current === latest.current.value) { select(el.current, ...want); wantSelection.current = null; }
        announce();
        onFocus?.(e);
      }}
      onBlur={(e) => { pending.current = null; announce(); onBlur?.(e); }}
      className={cn(
        'block w-full cursor-text whitespace-pre-wrap break-words bg-transparent outline-none [overflow-wrap:anywhere]',
        empty && placeholder && 'before:pointer-events-none before:absolute before:text-muted-foreground/70 before:content-[attr(data-placeholder)]',
        className
      )}
      {...props}
    />
  );
});

/** Formatting of the line being typed in inside `root`: { line, marks }, kept up to date as the cursor moves. */
export function useActiveFormat(rootRef) {
  const [state, setState] = useState({ line: null, marks: '' });
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument || document;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = doc.activeElement;
        const line = active?.richLine && rootRef.current?.contains(active) ? active : null;
        const marks = line ? line.activeMarks() : '';
        setState(s => (s.line === line && s.marks === marks ? s : { line, marks }));
      });
    };
    doc.addEventListener('selectionchange', update);
    doc.addEventListener('focusin', update);
    doc.addEventListener('focusout', update);
    doc.addEventListener(FORMAT_EVENT, update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener('selectionchange', update);
      doc.removeEventListener('focusin', update);
      doc.removeEventListener('focusout', update);
      doc.removeEventListener(FORMAT_EVENT, update);
    };
  }, [rootRef]);
  return state;
}

const FORMATS = [
  { mark: 'b', icon: Bold, label: 'ntBold' },
  { mark: 'i', icon: Italic, label: 'ntItalic' },
  { mark: 'u', icon: Underline, label: 'ntUnderline' },
  { mark: 's', icon: Strikethrough, label: 'ntStrikethrough' },
];
// Pressing a button keeps the cursor (and the selection, and a phone's keyboard) in the line
const keepFocus = { onPointerDown: (e) => e.preventDefault(), onMouseDown: (e) => e.preventDefault() };

const BAR_KEY = 'notes.formatBar';

/** Whether the formatting bar is out, remembered on this device. */
export function useFormatBar() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(BAR_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => setOpen((was) => {
    try { localStorage.setItem(BAR_KEY, was ? '0' : '1'); } catch { /* private window */ }
    return !was;
  });
  return [open, toggle];
}

/** The button that brings out the formatting bar. */
export function FormatToggle({ open, onToggle, t, className }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      {...keepFocus}
      onClick={onToggle}
      aria-pressed={open}
      aria-label={t('ntFormatText')}
      title={t('ntFormatText')}
      className={cn(open && 'bg-foreground/10 text-foreground', className)}
    >
      <Baseline />
    </Button>
  );
}

/** Bold, italic, underline, strikethrough and plain again, for the selection in the line being typed in under `rootRef`. */
export function FormatBar({ rootRef, t, onClose, className, buttonClassName }) {
  const { line, marks } = useActiveFormat(rootRef);
  return (
    <div role="toolbar" aria-label={t('ntFormatText')} className={cn('flex min-w-0 items-center gap-0.5', className)}>
      {FORMATS.map(({ mark, icon: Icon, label }) => (
        <Button
          key={mark}
          type="button"
          variant="ghost"
          size="icon"
          {...keepFocus}
          disabled={!line}
          onClick={() => line?.format(mark)}
          aria-pressed={marks.includes(mark)}
          aria-label={t(label)}
          title={t(label)}
          className={cn(marks.includes(mark) && 'bg-foreground/15 text-foreground', buttonClassName)}
        >
          <Icon />
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        {...keepFocus}
        disabled={!line}
        onClick={() => line?.clearFormat()}
        aria-label={t('ntClearFormatting')}
        title={t('ntClearFormatting')}
        className={buttonClassName}
      >
        <RemoveFormatting />
      </Button>
      {!line && <span className="min-w-0 truncate px-1 text-xs text-muted-foreground">{t('ntFormatHint')}</span>}
      {onClose && (
        <Button type="button" variant="ghost" size="icon" {...keepFocus} onClick={onClose} aria-label={t('ntClose')} title={t('ntClose')} className={cn('ms-auto', buttonClassName)}>
          <X />
        </Button>
      )}
    </div>
  );
}
