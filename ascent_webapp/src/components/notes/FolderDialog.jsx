import React, { useEffect, useState } from 'react';
import { Check, Folder, FolderMinus, FolderPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmt } from './noteUtils';

const same = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

/**
 * Pick the folder for one or more notes (`mode` 'move'), or name a new folder to open (`mode` 'new').
 * A note is in one folder at most; `current` is the folder they are all in, if they share one.
 */
export default function FolderDialog({ open, onOpenChange, mode = 'move', folders, current = '', count = 1, onPick, t }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);

  const pick = (folder) => { onPick(folder); onOpenChange(false); };
  const submit = (e) => {
    e.preventDefault();
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    // A name that is already a folder goes to that folder, as it is written there
    pick(folders.find(f => same(f.name, clean))?.name || clean);
  };

  const rowClass = (active) => cn(
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-primary/15 font-medium text-primary' : 'hover:bg-accent'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-sm rounded-3xl p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? t('ntNewFolder') : t('ntMoveToFolder')}</DialogTitle>
          <DialogDescription>
            {mode === 'new' ? t('ntNewFolderHint') : count > 1 ? fmt(t('ntMoveManyHint'), { n: count }) : t('ntMoveToFolderHint')}
          </DialogDescription>
        </DialogHeader>

        {mode === 'move' && (
          <ul className="-mx-1 max-h-[45dvh] space-y-0.5 overflow-y-auto overscroll-contain">
            {folders.map(({ name: folder }) => (
              <li key={folder}>
                <button type="button" onClick={() => pick(folder)} className={rowClass(same(current, folder))} aria-current={same(current, folder) || undefined}>
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder}</span>
                  {same(current, folder) && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
            {current && (
              <li>
                <button type="button" onClick={() => pick('')} className={rowClass(false)}>
                  <FolderMinus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t('ntRemoveFromFolder')}</span>
                </button>
              </li>
            )}
          </ul>
        )}

        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            autoFocus={mode === 'new' || folders.length === 0}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ntFolderName')}
            aria-label={t('ntFolderName')}
            className="h-11 flex-1"
          />
          <Button type="submit" disabled={!name.trim()} className="h-11 shrink-0">
            <FolderPlus /> {mode === 'new' ? t('ntCreate') : t('ntMove')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
