import React, { useEffect, useState } from 'react';
import { Check, Pencil, Tag, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmt } from './noteUtils';

function LabelRow({ label, count, onRename, onDelete, t }) {
  const [text, setText] = useState(label);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setText(label); }, [label]);

  const commit = () => {
    setEditing(false);
    const next = text.trim().slice(0, 40);
    if (next && next !== label) onRename(label, next);
    else setText(label);
  };

  return (
    <li className="flex items-center gap-1">
      <span className="grid h-11 w-9 shrink-0 place-items-center text-muted-foreground"><Tag className="h-4 w-4" /></span>
      {editing ? (
        <Input
          autoFocus
          value={text}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.stopPropagation(); setText(label); setEditing(false); }
          }}
          aria-label={t('ntRenameLabel')}
          className="h-10 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-start text-sm hover:bg-accent"
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        </button>
      )}
      <Button
        variant="ghost" size="icon"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (editing ? commit() : setEditing(true))}
        aria-label={editing ? t('ntDone') : t('ntRenameLabel')}
        className="h-11 w-11 shrink-0"
      >
        {editing ? <Check /> : <Pencil />}
      </Button>
      <Button
        variant="ghost" size="icon"
        onClick={() => onDelete(label)}
        aria-label={`${t('ntDeleteLabel')}: ${label}`}
        className={cn('h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive')}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Rename or remove a label everywhere it is used, like Keep's "Edit labels". */
export default function EditLabelsDialog({ open, onOpenChange, labels, onRename, onDelete, t }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-sm rounded-3xl p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>{t('ntEditLabels')}</DialogTitle>
          <DialogDescription>{t('ntEditLabelsHint')}</DialogDescription>
        </DialogHeader>
        {labels.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('ntNoLabels')}</p>
        ) : (
          <ul className="-mx-1 max-h-[55dvh] space-y-0.5 overflow-y-auto overscroll-contain">
            {labels.map(({ name, count }) => (
              <LabelRow key={name} label={name} count={fmt(t('ntNotesCount'), { n: count })} onRename={onRename} onDelete={onDelete} t={t} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
