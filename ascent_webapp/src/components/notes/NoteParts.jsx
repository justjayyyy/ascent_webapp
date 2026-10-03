import React, { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { NOTE_COLORS, highlight, linkHost, resolveColor, textDir } from './noteUtils';

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
    // The name they go by in the household (sent with each member), else one made from the address
    const name = m.name?.trim() || nameFromEmail(m.email);
    const person = {
      id,
      email: m.email,
      name,
      initials: initialsOf(name),
      // linked accounts count as members straight away, just as the rest of the app treats them
      pending: !id,
      isMe: !!id && (id === me?.id || id === me?._id),
      color: `hsl(${SERIES[i % SERIES.length]})`,
    };
    list.push(person);
    if (id) byId[id] = person;
  });
  const meId = me?.id || me?._id;
  return { byId, list, me: { id: meId ? String(meId) : null, email: me?.email?.toLowerCase() || null } };
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

/** A textarea that grows with its content instead of scrolling, and runs the way its text is written. */
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
      dir={textDir(value)}
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

/**
 * Multi-select for labels: every label already in use is listed with a checkbox and
 * narrows as you type; Enter toggles the top match, or creates the label if none match.
 */
export function LabelEditor({ labels, suggestions, onChange, t, disabled }) {
  const [text, setText] = useState('');
  const q = text.trim();
  const lower = (s) => s.toLowerCase();
  const isOn = (s) => labels.some(l => lower(l) === lower(s));

  // Everything already used, plus anything on this note that no other note uses
  const all = useMemo(() => {
    const seen = new Set();
    return [...labels, ...suggestions].filter(s => {
      const k = lower(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [labels, suggestions]);

  const matches = useMemo(
    () => all.filter(s => !q || lower(s).includes(lower(q))),
    [all, q]
  );
  const canCreate = q && !all.some(s => lower(s) === lower(q));

  const toggle = (name) => {
    onChange(isOn(name) ? labels.filter(l => lower(l) !== lower(name)) : [...labels, name.slice(0, 40)]);
  };
  const create = () => { toggle(q); setText(''); };

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {labels.map(l => <span key={l} className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">{l}</span>)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!q) return;
          if (matches.length) { toggle(matches[0]); setText(''); } else create();
        }}
        placeholder={t('ntSearchLabels')}
        aria-label={t('ntSearchLabels')}
        autoComplete="off"
        autoCapitalize="none"
        maxLength={40}
        className="h-10"
      />
      <ul role="listbox" aria-multiselectable="true" aria-label={t('ntLabels')} className="max-h-52 space-y-0.5 overflow-y-auto overscroll-contain">
        {matches.map((name, i) => (
          <li key={name} role="option" aria-selected={isOn(name)}>
            <button
              type="button"
              onClick={() => toggle(name)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-start text-sm hover:bg-accent',
                q && i === 0 && 'bg-accent/60'
              )}
            >
              <span className={cn(
                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border',
                isOn(name) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
              )}>
                {isOn(name) && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{highlight(name, q)}</span>
            </button>
          </li>
        ))}
        {canCreate && (
          <li>
            <button type="button" onClick={create} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-start text-sm text-primary hover:bg-accent">
              <Plus className="h-4 w-4" /> {t('ntCreateLabel').replace('{label}', q)}
            </button>
          </li>
        )}
        {!matches.length && !canCreate && <li className="px-2 py-2 text-sm text-muted-foreground">{t('ntNoLabels')}</li>}
      </ul>
    </div>
  );
}

/** Web links found in a note, as tappable chips (Keep shows them under the note). */
export function LinkChips({ links, compact, className }) {
  if (!links?.length) return null;
  const shown = compact ? links.slice(0, 2) : links;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {shown.map(url => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'pointer-events-auto relative z-[2] flex min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.07] text-start transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'min-h-9 px-2.5 text-xs' : 'min-h-11 px-3 text-sm'
          )}
        >
          <ExternalLink className={cn('shrink-0 text-muted-foreground', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          <span className="min-w-0 flex-1 truncate font-medium" dir="ltr">{linkHost(url)}</span>
        </a>
      ))}
    </div>
  );
}
