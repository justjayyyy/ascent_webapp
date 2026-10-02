import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from '@/lib/motion';
import { ChevronRight, GripVertical, Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { AutoTextarea } from './NoteParts';
import { blankItem, fmt } from './noteUtils';

const cleanLine = (l) => l.replace(/^\s*(?:[-*•]\s+|\[[ xX]\]\s*)/, '').trim();

function Row({ item, reorderable, readOnly, t, onChange, onRemove, onEnter, onBackspaceEmpty, onPasteLines, registerRef }) {
  const controls = useDragControls();
  const Wrapper = reorderable ? Reorder.Item : 'div';
  const wrapperProps = reorderable
    ? { value: item, dragListener: false, dragControls: controls, whileDrag: { scale: 1.02, boxShadow: '0 10px 30px -10px hsl(0 0% 0% / 0.45)', zIndex: 20 } }
    : {};
  return (
    <Wrapper
      {...wrapperProps}
      className="group/row relative flex items-start gap-1.5 rounded-lg"
    >
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
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); }
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
    </Wrapper>
  );
}

/** Checklist body of a note: reorderable open items and a collapsible list of completed ones. */
export default function ChecklistEditor({ items, onChange, readOnly, autoFocus, t }) {
  const refs = useRef({});
  const [showDone, setShowDone] = useState(false);
  const open = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  // Land in the first empty row of a brand-new list
  useEffect(() => {
    if (!autoFocus) return;
    const first = items.find(i => !i.done && !i.text);
    if (first) requestAnimationFrame(() => refs.current[first.id]?.focus());
  }, []);

  const focusSoon = (id) => requestAnimationFrame(() => refs.current[id]?.focus());

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
