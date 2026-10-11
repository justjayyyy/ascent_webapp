import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/lib/motion';
import { Camera, Image as ImageIcon, Images, ListChecks, Palette, Plus, Tag } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ChecklistEditor from './ChecklistEditor';
import { AutoTextarea, ColorPicker, LabelEditor, NoteTypeMenu } from './NoteParts';
import { FormatBar, FormatToggle, useFormatBar } from './RichTextarea';
import {
  blankItem, flowBlocks, flowChanges, formChanges, hasAmount, isEmptyNote, newItemId, noteForm, resolveColor,
} from './noteUtils';

const blank = (tag) => ({
  title: '', content: '', type: 'text', flow: false, items: [], color: 'default', tags: tag ? [tag] : [],
});

/** "Take a note…" bar that opens into a full inline editor, like Google Keep. */
export default function NoteComposer({
  t, labels, itemSuggestions, defaultTag, onCreate, onImage, onDocument, request, onRequestHandled, currency, language,
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => blank(defaultTag));
  const [formatting, toggleFormatting] = useFormatBar();
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The id its text is edited under while it is plain text (see NoteEditor)
  const textBlockId = useRef(newItemId());

  const patch = (changes) => setDraft(d => ({ ...d, ...changes }));

  const commit = useCallback(() => {
    const d = draftRef.current;
    if (!isEmptyNote(d)) {
      onCreate({
        ...d,
        items: d.type === 'checklist' ? d.items.filter(i => i.text.trim() || hasAmount(i)) : [],
        content: d.type === 'checklist' ? '' : d.content,
      });
    }
    setDraft(blank(defaultTag));
    setOpen(false);
  }, [onCreate, defaultTag]);

  // Something outside asked for a new note (shortcut, shared text, install shortcut)
  useEffect(() => {
    if (!request) return;
    setDraft({
      ...blank(defaultTag),
      title: request.title || '',
      content: request.content || '',
      type: request.type || 'text',
      items: request.type === 'checklist' ? [blankItem()] : [],
    });
    setOpen(true);
    onRequestHandled?.();
  }, [request, defaultTag, onRequestHandled]);

  // Tapping anywhere else files the note away, just like Keep
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]')) return;
      commit();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, commit]);

  // A paste with pictures needs a note to put them in: it becomes one, opened, with what was written so far
  const handOff = (lines) => {
    const d = draftRef.current;
    onDocument({ title: d.title, color: d.color, tags: d.tags, lines, flow: noteForm(d) === 'text' });
    setDraft(blank(defaultTag));
    setOpen(false);
  };

  const changeBlocks = (blocks) => {
    const changes = flowChanges(draftRef.current, blocks);
    if ('content' in changes && blocks[0]) textBlockId.current = blocks[0].id;
    patch(changes);
  };

  const startChecklist = () => {
    setDraft({ ...blank(defaultTag), type: 'checklist', items: [blankItem()] });
    setOpen(true);
  };

  const setForm = (to) => {
    const changes = formChanges(draftRef.current, to);
    if (changes) patch(changes);
  };

  const color = resolveColor(draft.color);

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-xl">
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
          <motion.div
            key="closed"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex items-center rounded-2xl border border-border/60 bg-card/75 pe-1.5 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-start text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('ntTakeNote')}</span>
            </button>
            <Button variant="ghost" size="icon" onClick={startChecklist} aria-label={t('ntNewChecklist')} title={t('ntNewChecklist')}>
              <ListChecks />
            </Button>
            {onImage && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('ntNewImageNote')} title={t('ntNewImageNote')}>
                      <ImageIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuItem onSelect={() => cameraRef.current?.click()}>
                      <Camera className="me-2 h-4 w-4" /> {t('ntTakePhoto')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                      <Images className="me-2 h-4 w-4" /> {t('ntChoosePhotos')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-hidden
                  tabIndex={-1}
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) onImage(e.target.files); e.target.value = ''; }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label={t('ntNewImageNote')}
                  tabIndex={-1}
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) onImage(e.target.files); e.target.value = ''; }}
                />
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="open"
            initial={reduce ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            data-note-color={color === 'default' ? undefined : color}
            onKeyDown={(e) => { if (e.key === 'Escape') commit(); }}
            className={cn(
              'note-surface overflow-hidden rounded-2xl border shadow-[0_18px_50px_-18px_hsl(0_0%_0%/0.6)]',
              color === 'default' && 'border-border/60 bg-card'
            )}
          >
            <div className="px-4 pt-3">
              <AutoTextarea
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value.replace(/\n/g, ' ') })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.querySelector('[data-rich-line], textarea')?.focus(); } }}
                placeholder={t('noteTitle')}
                aria-label={t('noteTitle')}
                maxLength={500}
                className="text-base font-semibold tracking-tight"
              />
              <div ref={bodyRef} className="mt-1 pb-2">
                {noteForm(draft) === 'checklist' ? (
                  <ChecklistEditor
                    items={draft.items.length ? draft.items : [blankItem()]}
                    onChange={(items) => patch({ items })}
                    autoFocus
                    suggestions={itemSuggestions}
                    t={t}
                    currency={currency}
                    language={language}
                    onPasteDocument={onDocument ? handOff : undefined}
                  />
                ) : (
                  <div className="min-h-[4.5rem]">
                    <ChecklistEditor
                      flow
                      items={flowBlocks(draft, textBlockId.current)}
                      onChange={changeBlocks}
                      autoFocus
                      placeholder={t('ntTakeNote')}
                      suggestions={itemSuggestions}
                      t={t}
                      currency={currency}
                      language={language}
                      onPasteDocument={onDocument ? handOff : undefined}
                    />
                  </div>
                )}
              </div>
              {draft.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2">
                  {draft.tags.map(tag => (
                    <span key={tag} className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium">{tag}</span>
                  ))}
                </div>
              )}
            </div>
            {formatting && <FormatBar rootRef={bodyRef} t={t} onClose={toggleFormatting} className="border-t border-foreground/10 px-2 pt-1.5" />}
            <div className="flex items-center gap-1 border-t border-foreground/10 px-2 py-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('noteColor')}><Palette /></Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto max-w-[17rem] rounded-2xl p-2.5">
                  <ColorPicker value={draft.color} onChange={(c) => patch({ color: c })} t={t} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('ntLabels')}><Tag /></Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 rounded-2xl p-3">
                  <LabelEditor labels={draft.tags} suggestions={labels} onChange={(tags) => patch({ tags })} t={t} />
                </PopoverContent>
              </Popover>
              <NoteTypeMenu value={noteForm(draft)} onChange={setForm} t={t} />
              <FormatToggle open={formatting} onToggle={toggleFormatting} t={t} />
              <Button variant="ghost" onClick={commit} className="ms-auto">{t('ntClose')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
