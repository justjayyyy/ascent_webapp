import React, { useEffect, useId, useState } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';

/** A settings area: heading outside, one grouped surface inside. */
export function Section({ id, icon: Icon, title, description, action, index = 0, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      style={{ animationDelay: `${index * 60}ms` }}
      className="scroll-mt-32 lg:scroll-mt-8 animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out fill-mode-backwards motion-reduce:animate-none"
    >
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground text-balance">
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground text-pretty max-sm:hidden">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Grouped surface whose direct children are separated by hairlines. */
export function Group({ className, children }) {
  return (
    <div className={cn('divide-y divide-border/60 overflow-hidden rounded-3xl border border-border bg-card', className)}>
      {children}
    </div>
  );
}

/** Label + hint on one side, control on the other. `wide` stacks the control under the label on phones. */
export function Row({ label, description, htmlFor, wide = false, children, className }) {
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-4 sm:px-5',
        wide ? 'flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6' : 'items-center justify-between gap-4',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">{label}</label>
        {description && <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      <div className={cn('shrink-0', wide && 'max-sm:w-full')}>{children}</div>
    </div>
  );
}

/**
 * A row that folds its content away: label + hint + `summary` (what is set now) on the button,
 * the full control or long text underneath once opened. `open` forces it open (e.g. while a search matches).
 */
export function Disclosure({ label, description, summary, icon: Icon, defaultOpen = false, open: forced, children, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const expanded = open || !!forced;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!expanded)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-start outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            {label}
          </span>
          {description && <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">{description}</span>}
        </span>
        {summary != null && <span className="flex min-w-0 shrink items-center gap-2 text-sm text-muted-foreground">{summary}</span>}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div
        id={id}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
        inert={expanded ? undefined : ''}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4 sm:px-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Radio-group segmented control (arrow keys, single tab stop). */
export function Segmented({ value, onValueChange, options, label, className }) {
  const { isRTL } = useTheme();
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn('inline-flex max-w-full gap-1 rounded-2xl bg-muted p-1 max-sm:flex max-sm:w-full', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className="inline-flex h-10 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-[0_1px_2px_hsl(0_0%_0%/0.25),0_0_0_1px_hsl(var(--border))] max-sm:flex-1 [@media(pointer:coarse)]:h-11"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/** Always-editable text field; Save / Cancel only appear once the draft differs. Enter saves, Escape reverts. */
export function EditableField({ id, value, onSave, disabled = false, placeholder, maxLength = 80, icon: Icon }) {
  const { t } = useTheme();
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => {
    if (!justSaved) return undefined;
    const timer = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const trimmed = draft.trim();
  const dirty = trimmed !== (value || '').trim();
  const revert = () => setDraft(value || '');

  const submit = async (e) => {
    e?.preventDefault();
    if (!dirty || !trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      setJustSaved(true);
    } catch {
      revert();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 max-sm:w-full">
      <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
        {Icon && <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          disabled={disabled || saving}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && dirty) { e.preventDefault(); revert(); } }}
          className={cn('h-11 rounded-xl bg-muted/60 sm:h-10', Icon && 'ps-9', justSaved && 'pe-9')}
        />
        {justSaved && (
          <Check className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success animate-in fade-in zoom-in-50 duration-200" aria-label={t('setSaved')} />
        )}
      </div>
      {dirty && (
        <div className="flex shrink-0 items-center gap-1.5 animate-in fade-in slide-in-from-start-2 duration-200 motion-reduce:animate-none">
          <Button type="submit" disabled={!trimmed || saving} className="h-11 rounded-xl px-4 sm:h-10">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t('save')}
          </Button>
          <Button type="button" variant="ghost" onClick={revert} disabled={saving} className="h-11 rounded-xl px-3 sm:h-10">
            {t('cancel')}
          </Button>
        </div>
      )}
    </form>
  );
}
