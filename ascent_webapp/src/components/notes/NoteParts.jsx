import React, { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { NOTE_COLORS, resolveColor } from './noteUtils';

const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const nameFromEmail = (email = '') => email.split('@')[0] || email;
const initialsOf = (name = '') => {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
};

/** Everyone in the workspace who can be picked for a note, keyed by user id. */
export function buildPeople(workspace, me) {
  const byId = {};
  const list = [];
  (workspace?.members || []).forEach((m, i) => {
    if (!m?.email || m.status === 'rejected') return;
    const id = m.userId ? String(m.userId) : null;
    const name = nameFromEmail(m.email);
    const person = {
      id,
      email: m.email,
      name,
      initials: initialsOf(name),
      pending: m.status !== 'accepted' || !id,
      isMe: !!id && (id === me?.id || id === me?._id),
      color: `hsl(${SERIES[i % SERIES.length]})`,
    };
    list.push(person);
    if (id) byId[id] = person;
  });
  return { byId, list };
}

export function PersonDot({ person, size = 24, className }) {
  if (!person) return null;
  return (
    <span
      title={person.email}
      className={cn('inline-flex items-center justify-center rounded-full font-semibold leading-none text-background ring-2 ring-background shrink-0 select-none', className)}
      style={{ width: size, height: size, backgroundColor: person.color, fontSize: 12 }}
    >
      {person.initials}
    </span>
  );
}

export function PeopleStack({ people, max = 3, size = 24 }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5 rtl:space-x-reverse">
      {shown.map(p => <PersonDot key={p.id || p.email} person={p} size={size} />)}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background text-[12px] font-medium"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

/** A textarea that grows with its content instead of scrolling. */
export const AutoTextarea = forwardRef(function AutoTextarea({ value, onChange, className, ...props }, ref) {
  const inner = useRef(null);
  useImperativeHandle(ref, () => inner.current);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={inner}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn('block w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/70 overflow-hidden', className)}
      {...props}
    />
  );
});

export function ColorPicker({ value, onChange, t, disabled }) {
  const current = resolveColor(value);
  return (
    <div role="radiogroup" aria-label={t('noteColor')} className="flex flex-wrap gap-1.5 p-0.5">
      {NOTE_COLORS.map(key => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={current === key}
          aria-label={t(`ntColor_${key}`)}
          title={t(`ntColor_${key}`)}
          disabled={disabled}
          onClick={() => onChange(key)}
          data-note-color={key === 'default' ? undefined : key}
          className={cn(
            'relative h-8 w-8 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            key === 'default' ? 'bg-card border-border' : 'note-swatch border-transparent',
            current === key && 'ring-2 ring-primary ring-offset-2 ring-offset-popover'
          )}
        >
          {current === key && (
            <Check className="absolute inset-0 m-auto h-4 w-4 text-foreground" strokeWidth={3} />
          )}
        </button>
      ))}
    </div>
  );
}

/** Labels on a note: chips plus an input that suggests labels already used elsewhere. */
export function LabelEditor({ labels, suggestions, onChange, t, disabled }) {
  const [text, setText] = useState('');
  const norm = (s) => s.trim();
  const has = (s) => labels.some(l => l.toLowerCase() === s.toLowerCase());

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return suggestions
      .filter(s => !has(s) && (!q || s.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [text, suggestions, labels]);

  const add = (raw) => {
    const label = norm(raw);
    if (!label || has(label)) { setText(''); return; }
    onChange([...labels, label.slice(0, 40)]);
    setText('');
  };
  const exact = suggestions.some(s => s.toLowerCase() === text.trim().toLowerCase());

  return (
    <div className="space-y-2">
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map(l => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <Tag className="h-3 w-3" />
              {l}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`${t('ntRemoveLabel')} ${l}`}
                  onClick={() => onChange(labels.filter(x => x !== l))}
                  className="-me-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); add(text); }
            }}
            placeholder={t('ntEnterLabel')}
            aria-label={t('ntAddLabel')}
            maxLength={40}
            className="h-9"
          />
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {matches.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-accent"
              >
                <Tag className="h-3.5 w-3.5 text-muted-foreground" /> {s}
              </button>
            ))}
            {text.trim() && !exact && !has(text.trim()) && (
              <button
                type="button"
                onClick={() => add(text)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm text-primary hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> {t('ntCreateLabel').replace('{label}', text.trim())}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
