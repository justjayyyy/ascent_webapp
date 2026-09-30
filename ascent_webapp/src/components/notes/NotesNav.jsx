import React from 'react';
import { Archive, Bell, Lightbulb, Pencil, Tag, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where you are in your notes: everything, shared, archive, trash, and your labels.
 * A vertical rail on large screens and a scrolling chip bar on phones.
 */
export default function NotesNav({ view, label, labels, counts, onSelect, onEditLabels, t, variant }) {
  const main = [
    { key: 'notes', icon: Lightbulb, name: t('notes'), count: counts.notes },
    { key: 'shared', icon: Users, name: t('ntShared'), count: counts.shared },
    { key: 'reminders', icon: Bell, name: t('ntReminders'), count: counts.reminders },
    { key: 'archive', icon: Archive, name: t('ntArchiveNav'), count: counts.archive },
    { key: 'trash', icon: Trash2, name: t('ntTrashNav'), count: counts.trash },
  ];
  const isActive = (key) => view === key && !label;

  if (variant === 'chips') {
    return (
      <nav
        aria-label={t('ntFilters')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {main.map(({ key, icon: Icon, name }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-current={isActive(key) ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
              isActive(key)
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border/70 bg-card/60 text-foreground/80 hover:bg-accent'
            )}
          >
            <Icon className="h-4 w-4" /> {name}
          </button>
        ))}
        {labels.map(({ name, count }) => (
          <button
            key={name}
            type="button"
            onClick={() => onSelect('label', name)}
            aria-current={label === name ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
              label === name
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border/70 bg-card/60 text-foreground/80 hover:bg-accent'
            )}
          >
            <Tag className="h-4 w-4" /> {name}
            <span className="text-xs opacity-70">{count}</span>
          </button>
        ))}
        {onEditLabels && labels.length > 0 && (
          <button
            type="button"
            onClick={onEditLabels}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-dashed border-border/70 px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4" /> {t('ntEditLabels')}
          </button>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label={t('ntFilters')} className="space-y-6">
      <ul className="space-y-1">
        {main.map(({ key, icon: Icon, name, count }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-current={isActive(key) ? 'page' : undefined}
              className={cn(
                'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                isActive(key) ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-accent'
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1 truncate text-start">{name}</span>
              {count > 0 && <span className="text-xs tabular text-muted-foreground">{count}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2 ps-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('ntLabels')}</p>
          {onEditLabels && labels.length > 0 && (
            <button
              type="button"
              onClick={onEditLabels}
              aria-label={t('ntEditLabels')}
              title={t('ntEditLabels')}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {labels.length === 0 ? (
          <p className="px-3 text-sm text-muted-foreground">{t('ntNoLabels')}</p>
        ) : (
          <ul className="space-y-1">
            {labels.map(({ name, count }) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onSelect('label', name)}
                  aria-current={label === name ? 'page' : undefined}
                  className={cn(
                    'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                    label === name ? 'bg-primary/15 font-medium text-primary' : 'text-foreground/80 hover:bg-accent'
                  )}
                >
                  <Tag className="h-4 w-4" />
                  <span className="flex-1 truncate text-start">{name}</span>
                  <span className="text-xs tabular text-muted-foreground">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
