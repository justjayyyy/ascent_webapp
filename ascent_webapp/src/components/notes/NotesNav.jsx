import React from 'react';
import { Archive, Bell, Folder, FolderPlus, Lightbulb, Pencil, Tag, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// A chip in the phone's bar: 40px tall, with an invisible 4px above and below on touch screens (44px and a margin)
const CHIP = "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-y-1 [@media(pointer:coarse)]:before:inset-x-0 [@media(pointer:coarse)]:before:content-['']";
const chipState = (active) => (active
  ? 'border-transparent bg-primary text-primary-foreground'
  : 'border-border/70 bg-card/60 text-foreground/80 hover:bg-accent');
const CHIP_ACTION = 'border-dashed border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground';
const RAIL_ICON_BUTTON = 'grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A rail section: its heading with its buttons, then its entries (a folder or a label each). */
function RailSection({ title, actions, empty, entries, icon: Icon, current, onPick }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 ps-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="flex items-center">{actions}</div>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(({ name, count }) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => onPick(name)}
                aria-current={same(current, name) ? 'page' : undefined}
                className={cn(
                  'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                  same(current, name) ? 'bg-primary/15 font-medium text-primary' : 'text-foreground/80 hover:bg-accent'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 truncate text-start">{name}</span>
                <span className="text-xs tabular text-muted-foreground">{count || ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where you are in your notes: everything, shared, reminders, archive, trash, your folders and your labels.
 * A vertical rail on large screens and a scrolling chip bar on phones.
 */
export default function NotesNav({
  view, label, labels, folder, folders, counts, onSelect, onEditLabels, onEditFolders, onNewFolder, t, variant,
}) {
  const main = [
    { key: 'notes', icon: Lightbulb, name: t('notes'), count: counts.notes },
    { key: 'shared', icon: Users, name: t('ntShared'), count: counts.shared },
    { key: 'reminders', icon: Bell, name: t('ntReminders'), count: counts.reminders },
    { key: 'archive', icon: Archive, name: t('ntArchiveNav'), count: counts.archive },
    { key: 'trash', icon: Trash2, name: t('ntTrashNav'), count: counts.trash },
  ];
  const isActive = (key) => view === key && !label && !folder;

  if (variant === 'chips') {
    return (
      <nav
        aria-label={t('ntFilters')}
        // pt-1/pb-2 (was pb-1): room above and below for the chips' invisible touch area, which a scrolling strip
        // would otherwise clip; the -my-1 keeps the bar where it was
        className="-mx-4 -my-1 flex gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {main.map(({ key, icon: Icon, name }) => (
          <button key={key} type="button" onClick={() => onSelect(key)} aria-current={isActive(key) ? 'page' : undefined} className={cn(CHIP, chipState(isActive(key)))}>
            <Icon className="h-4 w-4" /> {name}
          </button>
        ))}
        {folders.map(({ name, count }) => (
          <button
            key={`folder-${name}`}
            type="button"
            onClick={() => onSelect('folder', name)}
            aria-current={same(folder, name) ? 'page' : undefined}
            className={cn(CHIP, chipState(same(folder, name)))}
          >
            <Folder className="h-4 w-4" /> {name}
            {count > 0 && <span className="text-xs opacity-70">{count}</span>}
          </button>
        ))}
        {onNewFolder && (
          <button type="button" onClick={onNewFolder} className={cn(CHIP, CHIP_ACTION)}>
            <FolderPlus className="h-4 w-4" /> {t('ntNewFolder')}
          </button>
        )}
        {labels.map(({ name, count }) => (
          <button
            key={`label-${name}`}
            type="button"
            onClick={() => onSelect('label', name)}
            aria-current={label === name ? 'page' : undefined}
            className={cn(CHIP, chipState(label === name))}
          >
            <Tag className="h-4 w-4" /> {name}
            <span className="text-xs opacity-70">{count}</span>
          </button>
        ))}
        {onEditFolders && folders.length > 0 && (
          <button type="button" onClick={onEditFolders} className={cn(CHIP, CHIP_ACTION)}>
            <Pencil className="h-4 w-4" /> {t('ntEditFolders')}
          </button>
        )}
        {onEditLabels && labels.length > 0 && (
          <button type="button" onClick={onEditLabels} className={cn(CHIP, CHIP_ACTION)}>
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

      <RailSection
        title={t('ntFolders')}
        empty={t('ntNoFolders')}
        entries={folders}
        icon={Folder}
        current={folder}
        onPick={(name) => onSelect('folder', name)}
        actions={(
          <>
            {onNewFolder && (
              <button type="button" onClick={onNewFolder} aria-label={t('ntNewFolder')} title={t('ntNewFolder')} className={RAIL_ICON_BUTTON}>
                <FolderPlus className="h-4 w-4" />
              </button>
            )}
            {onEditFolders && folders.length > 0 && (
              <button type="button" onClick={onEditFolders} aria-label={t('ntEditFolders')} title={t('ntEditFolders')} className={RAIL_ICON_BUTTON}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      />

      <RailSection
        title={t('ntLabels')}
        empty={t('ntNoLabels')}
        entries={labels}
        icon={Tag}
        current={label}
        onPick={(name) => onSelect('label', name)}
        actions={onEditLabels && labels.length > 0 && (
          <button type="button" onClick={onEditLabels} aria-label={t('ntEditLabels')} title={t('ntEditLabels')} className={RAIL_ICON_BUTTON}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      />
    </nav>
  );
}
