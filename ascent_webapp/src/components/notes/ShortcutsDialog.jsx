import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const GROUPS = [
  { title: 'ntShortcutsGeneral', rows: [
    [['c'], 'ntKeyNewNote'],
    [['l'], 'ntKeyNewList'],
    [['/'], 'ntKeySearch'],
    [['?'], 'ntKeyHelp'],
  ] },
  { title: 'ntShortcutsSelection', rows: [
    [['Ctrl', 'A'], 'ntKeySelectAll'],
    [['f'], 'ntKeyPin'],
    [['e'], 'ntKeyArchive'],
    [['#'], 'ntKeyTrash'],
    [['Esc'], 'ntKeyClearSelection'],
  ] },
  { title: 'ntShortcutsEditor', rows: [
    [['Ctrl', 'Enter'], 'ntKeyClose'],
    [['Ctrl', 'Shift', '8'], 'ntKeyToggleList'],
    [['Ctrl', 'Z'], 'ntKeyUndo'],
    [['Ctrl', 'Shift', 'Z'], 'ntKeyRedo'],
  ] },
];

const Key = ({ children }) => (
  <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-border/80 bg-foreground/[0.05] px-1.5 py-0.5 font-sans text-xs font-medium text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
    {children}
  </kbd>
);

export default function ShortcutsDialog({ open, onOpenChange, t }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle>{t('ntShortcuts')}</DialogTitle>
          <DialogDescription>{t('ntShortcutsHint')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] space-y-5 overflow-y-auto">
          {GROUPS.map(g => (
            <section key={g.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(g.title)}</h3>
              <ul className="space-y-1.5">
                {g.rows.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{t(label)}</span>
                    <span className="flex shrink-0 items-center gap-1" dir="ltr">
                      {keys.map(k => <Key key={k}>{k === 'Ctrl' && mac ? '⌘' : k}</Key>)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
