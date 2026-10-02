import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellOff, Download, File as FileIcon, FileText, Image as ImageIcon, Loader2, Repeat, X } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  REPEATS, base64ToBlob, formatBytes, formatReminder, isPreviewable, reminderPresets, toLocalInput,
} from './noteUtils';

async function fetchBlob(noteId, att) {
  const file = await ascent.entities.Note.getFile(noteId, att.id);
  return base64ToBlob(file.data, file.type);
}

export function useThumb(noteId, att, enabled) {
  return useQuery({
    queryKey: ['note-file', noteId, att.id],
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () => URL.createObjectURL(await fetchBlob(noteId, att)),
  });
}

function Tile({ noteId, att, canEdit, online, onRemove, onPreview, t, wide }) {
  const image = isPreviewable(att.type);
  const thumb = useThumb(noteId, att, image && online);
  const Icon = image ? ImageIcon : /pdf|text|word|sheet/.test(att.type || '') ? FileText : FileIcon;

  const open = async () => {
    if (!online) { toast.error(t('ntNeedOnline')); return; }
    if (image && thumb.data) { onPreview({ url: thumb.data, name: att.name }); return; }
    try {
      const url = URL.createObjectURL(await fetchBlob(noteId, att));
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      toast.error(t('ntUploadFailed'));
    }
  };

  return (
    <li className={cn('group/att relative', wide && 'col-span-2')}>
      <button
        type="button"
        onClick={open}
        aria-label={`${att.name}, ${formatBytes(att.size)}`}
        className={cn(
          'flex w-full items-center gap-3 overflow-hidden rounded-xl bg-foreground/[0.06] text-start transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          image && thumb.data ? (wide ? 'h-56 sm:h-64' : 'h-36 sm:h-44') : cn('min-h-12 p-2.5', canEdit ? 'pe-12' : 'pe-2.5')
        )}
      >
        {image && thumb.data ? (
          <img src={thumb.data} alt={att.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
              {image && thumb.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{att.name}</span>
              <span className="block text-xs text-muted-foreground">{formatBytes(att.size)}</span>
            </span>
            {!canEdit && <Download className="me-1 h-4 w-4 shrink-0 text-muted-foreground" />}
          </>
        )}
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${t('ntRemoveFile')}: ${att.name}`}
          className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur hover:bg-background [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** True once the element has come near the screen (photos on note cards load as you scroll). */
function useNearView(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

function CardPhoto({ noteId, att, load, className, more }) {
  const thumb = useThumb(noteId, att, load);
  return (
    <span className={cn('relative block overflow-hidden bg-foreground/[0.06]', className)}>
      {thumb.data && <img src={thumb.data} alt="" draggable={false} className="h-full w-full object-cover" />}
      {more > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-semibold text-white">+{more}</span>
      )}
    </span>
  );
}

/** The photos on a note card, edge to edge across its top: one large, or a small mosaic of three. */
export function CardPhotos({ note, online }) {
  const ref = useRef(null);
  const near = useNearView(ref);
  const photos = (note.attachments || []).filter(a => isPreviewable(a.type));
  if (!photos.length) return null;
  const load = near && online;
  const shown = photos.slice(0, 3);
  const more = photos.length - shown.length;
  return (
    <div ref={ref} aria-hidden className={cn('-mx-4 -mt-4 mb-1 grid gap-0.5', shown.length > 1 && 'grid-cols-2')}>
      {shown.map((att, i) => (
        <CardPhoto
          key={att.id}
          noteId={note.id}
          att={att}
          load={load}
          more={i === shown.length - 1 ? more : 0}
          className={cn(
            shown.length === 1 ? 'h-44 sm:h-48' : shown.length === 3 && i === 0 ? 'col-span-2 h-32' : 'h-24',
            shown.length === 2 && 'h-32'
          )}
        />
      ))}
    </div>
  );
}

/**
 * What is attached to a note. `kind="photos"` is the photos, large, at the top of the note (with the
 * upload in progress); `kind="files"` is every other file as a row to download, below the text.
 */
export function AttachmentPanel({ note, canEdit, online, uploading, onRemove, t, kind = 'files' }) {
  const [preview, setPreview] = useState(null);
  const photos = kind === 'photos';
  const list = (note.attachments || []).filter(a => isPreviewable(a.type) === photos);
  const busy = photos && uploading > 0;
  if (!list.length && !busy) return null;
  return (
    <section className={photos ? 'mb-4' : 'mt-4'} aria-label={photos ? t('ntPhotos') : t('ntAttachments')}>
      <ul className="grid grid-cols-2 gap-2">
        {list.map(att => (
          <Tile
            key={att.id}
            noteId={note.id}
            att={att}
            canEdit={canEdit}
            online={online}
            onRemove={() => onRemove(att.id)}
            onPreview={setPreview}
            t={t}
            wide={photos && list.length === 1}
          />
        ))}
        {busy && (
          <li className={cn('flex min-h-12 items-center gap-2 rounded-xl bg-foreground/[0.06] p-2.5 text-sm text-muted-foreground', !list.length && 'col-span-2')}>
            <Loader2 className="h-4 w-4 animate-spin" /> {t('ntUploading')}
          </li>
        )}
      </ul>
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent sheet={false} className="max-w-3xl p-2 sm:p-4">
          <DialogTitle className="sr-only">{preview?.name}</DialogTitle>
          {preview && <img src={preview.url} alt={preview.name} className="max-h-[75dvh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Pick when to be reminded: quick options, or an exact date and time, optionally repeating. */
export function ReminderPicker({ value, repeat: repeatValue = 'none', onChange, onDone, t, language }) {
  const [custom, setCustom] = useState(() => toLocalInput(value || new Date(Date.now() + 3600000)));
  const [repeat, setRepeat] = useState(repeatValue || 'none');
  const presets = reminderPresets();

  const set = (date) => { onChange(date.toISOString(), repeat); onDone?.(); };
  const pickRepeat = (r) => {
    setRepeat(r);
    if (value) onChange(value, r); // already set: change how it repeats in place
  };

  return (
    <div className="space-y-1">
      {value && (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          {t('ntRemindAt')}: <span className="font-medium text-foreground">{formatReminder(value, language)}</span>
          {repeatValue && repeatValue !== 'none' && <> · {t(`ntRepeat_${repeatValue}`)}</>}
        </p>
      )}
      <div className="px-2 pb-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Repeat className="h-3.5 w-3.5" /> {t('ntRepeat')}</p>
        <div role="radiogroup" aria-label={t('ntRepeat')} className="flex flex-wrap gap-1">
          {REPEATS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={repeat === r}
              onClick={() => pickRepeat(r)}
              className={cn(
                'min-h-9 rounded-full px-2.5 text-xs font-medium transition-colors',
                repeat === r ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10'
              )}
            >
              {t(`ntRepeat_${r}`)}
            </button>
          ))}
        </div>
      </div>
      {presets.map(({ key, date }) => (
        <button
          key={key}
          type="button"
          onClick={() => set(date)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-start text-sm hover:bg-accent"
        >
          <span>{t(`ntRemind_${key}`)}</span>
          <span className="text-xs text-muted-foreground">{formatReminder(date.toISOString(), language)}</span>
        </button>
      ))}
      <div className="space-y-2 border-t border-border/60 px-2 pt-3">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="note-reminder-custom">{t('ntPickDateTime')}</label>
        <input
          id="note-reminder-custom"
          type="datetime-local"
          value={custom}
          min={toLocalInput(new Date())}
          onChange={(e) => setCustom(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-base"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={!custom || new Date(custom).getTime() <= Date.now()}
            onClick={() => set(new Date(custom))}
          >
            {t('ntSetReminder')}
          </Button>
          {value && (
            <Button size="sm" variant="outline" onClick={() => { onChange(null, 'none'); onDone?.(); }}>
              <BellOff /> {t('ntRemoveReminder')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
