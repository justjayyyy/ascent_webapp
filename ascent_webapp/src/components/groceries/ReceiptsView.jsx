import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, FileText, Loader2, Receipt, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/components/ThemeProvider';
import { useMoney } from '@/hooks/useWorkspaceData';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { localeOf, money, useWho } from './GroceryParts';
import { openReceiptFile, useReceiptFile, useReceiptVault } from './useReceiptVault';

const card = 'rounded-3xl border border-border/60 bg-card/75 p-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] sm:p-5';
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'RUB'];
const SEARCH_FROM = 7; // receipts before the search field shows
const isImage = (r) => (r.type || '').startsWith('image/');
const dayDate = (day) => new Date(`${day}T12:00:00`);

/** Take a photo / upload, as two buttons, each with its own hidden input. */
function AddButtons({ onFiles, t, className }) {
  const camera = useRef(null);
  const upload = useRef(null);
  const pick = (e) => { onFiles(e.target.files); e.target.value = ''; };
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Button onClick={() => camera.current?.click()} className="h-12 rounded-2xl text-[15px]">
        <Camera className="me-2 h-5 w-5" />{t('rcptTakePhoto')}
      </Button>
      <Button variant="secondary" onClick={() => upload.current?.click()} className="h-12 rounded-2xl text-[15px]">
        <Upload className="me-2 h-5 w-5" />{t('rcptUpload')}
      </Button>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden onChange={pick} />
      <input ref={upload} type="file" accept="image/*,application/pdf" multiple className="hidden" tabIndex={-1} aria-hidden onChange={pick} />
    </div>
  );
}

/** One receipt in the grid: its photo (or a PDF mark), the shop, the day and the total. */
const ReceiptTile = memo(function ReceiptTile({ receipt, reading, onOpen, loc, fmt, blur, t }) {
  const image = isImage(receipt);
  const thumb = useReceiptFile(receipt, 'thumb', image && (receipt.hasThumb || !!receipt.preview));
  const src = receipt.preview || thumb.data;
  const busy = receipt.uploading || reading;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(receipt)}
        disabled={receipt.uploading}
        className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/75 text-start transition-[transform,box-shadow] hover:shadow-[0_12px_30px_-14px_hsl(0_0%_0%/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-default"
      >
        <span className="relative block aspect-[4/5] w-full overflow-hidden bg-foreground/[0.05]">
          {image && src ? (
            <img src={src} alt="" draggable={false} className={cn('h-full w-full object-cover object-top transition-opacity', busy && 'opacity-60')} />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted-foreground">
              {image ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <span className="flex flex-col items-center gap-1.5"><FileText className="h-8 w-8" /><span className="text-xs font-bold tracking-wide">PDF</span></span>
              )}
            </span>
          )}
          {busy && (
            <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-background/85 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
              {receipt.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />}
              {receipt.uploading ? t('rcptSaving') : t('rcptReading')}
            </span>
          )}
        </span>
        <span className="block w-full p-2.5">
          <span className={cn('block truncate text-sm font-semibold', receipt.store ? 'text-foreground' : 'text-muted-foreground')}>
            {receipt.store || t('rcptUntitled')}
          </span>
          <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{receipt.date ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(dayDate(receipt.date)) : '—'}</span>
            {receipt.total !== null && receipt.total !== undefined && (
              <span className={cn('shrink-0 font-semibold tabular-nums text-foreground', blur && 'blur-sm')} dir="ltr">{fmt(receipt.currency)(receipt.total)}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
});

/** A full-screen look at the photo. */
function PhotoViewer({ src, name, onClose }) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent sheet={false} className="max-w-3xl p-2 sm:p-4">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        {src && <img src={src} alt={name} className="max-h-[85dvh] w-full rounded-lg bg-white object-contain" />}
      </DialogContent>
    </Dialog>
  );
}

/** One receipt: the photo, what it says (editable), and opening, reading or deleting it. */
function ReceiptSheet({ receipt, vault, stores, onClose }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const who = useWho();
  const image = receipt ? isImage(receipt) : false;
  const file = useReceiptFile(receipt, 'file', !!receipt && image);
  const [form, setForm] = useState(null);
  const [zoom, setZoom] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const reading = receipt ? vault.reading.has(receipt.id) : false;

  useEffect(() => {
    if (!receipt) return;
    setForm({
      store: receipt.store || '',
      date: receipt.date || '',
      total: receipt.total ?? '',
      currency: receipt.currency || user?.currency || 'ILS',
      note: receipt.note || '',
    });
    setConfirming(false);
  }, [receipt?.id, receipt?.store, receipt?.date, receipt?.total, receipt?.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!receipt || !form) return null;
  const set = (changes) => setForm((f) => ({ ...f, ...changes }));
  const currencies = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES];
  const adder = who.of(receipt.addedBy);
  const added = receipt.created_date ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(receipt.created_date)) : '';
  const canDelete = vault.canDelete(receipt);

  const save = async (e) => {
    e.preventDefault();
    const total = form.total === '' ? null : parseFloat(form.total);
    const changes = {
      store: form.store.trim(), date: form.date, note: form.note.trim(), currency: form.currency,
      total: Number.isFinite(total) && total >= 0 ? total : null,
    };
    const changed = Object.fromEntries(Object.entries(changes).filter(([k, v]) => (receipt[k] ?? (k === 'total' ? null : '')) !== v));
    if (Object.keys(changed).length) await vault.update(receipt, changed);
    onClose();
  };

  const open = async () => {
    setOpening(true);
    try { await openReceiptFile(receipt); } finally { setOpening(false); }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
          <DialogHeader className="text-start">
            <DialogTitle className="text-xl font-bold tracking-tight">{receipt.store || t('rcptUntitled')}</DialogTitle>
            <DialogDescription>{[adder && who.isShared ? t('rcptAddedBy', { name: adder.name }) : null, added].filter(Boolean).join(' · ')}</DialogDescription>
          </DialogHeader>

          {image ? (
            <button
              type="button"
              onClick={() => file.data && setZoom(true)}
              aria-label={t('rcptViewPhoto')}
              className="relative block h-56 w-full overflow-hidden rounded-2xl bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-64"
            >
              {file.data ? (
                <img src={file.data} alt={t('grReceiptPhoto')} className="h-full w-full object-cover object-top" draggable={false} />
              ) : (
                <span className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></span>
              )}
              {reading && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 animate-[grScan_1.6s_ease-in-out_infinite] bg-primary shadow-[0_2px_12px_0_hsl(var(--glow)/0.6)] motion-reduce:hidden" />
              )}
            </button>
          ) : (
            <button type="button" onClick={open} className="flex h-28 w-full items-center justify-center gap-3 rounded-2xl bg-foreground/[0.05] text-sm font-medium text-foreground hover:bg-foreground/10">
              {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-6 w-6" />}{t('rcptOpenPdf')}
            </button>
          )}

          {image && vault.aiReady && !receipt.read && (
            <Button type="button" variant="secondary" disabled={reading} onClick={() => vault.readWithAssistant(receipt)} className="h-11 rounded-xl">
              {reading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
              {reading ? t('rcptReading') : t('rcptReadIt')}
            </Button>
          )}

          <form onSubmit={save} className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              {t('grStore')}
              <Input value={form.store} onChange={(e) => set({ store: e.target.value })} list="rc-stores" maxLength={80} className="h-11 rounded-xl" />
              <datalist id="rc-stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                {t('date')}
                <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className="h-11 rounded-xl" />
              </label>
              <div className="grid gap-1.5 text-sm font-medium text-foreground">
                <label htmlFor="rc-total">{t('grTotal')}</label>
                <div className="flex gap-1.5">
                  <Input
                    id="rc-total" type="number" inputMode="decimal" min="0" step="any" value={form.total}
                    onChange={(e) => set({ total: e.target.value })} className="h-11 min-w-0 flex-1 rounded-xl tabular-nums"
                  />
                  <select
                    value={form.currency} onChange={(e) => set({ currency: e.target.value })} aria-label={t('rcptCurrency')}
                    className="h-11 shrink-0 rounded-xl border border-input bg-transparent px-1.5 text-sm"
                  >
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              {t('rcptNote')}
              <textarea
                value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} rows={2}
                placeholder={t('rcptNotePlaceholder')}
                className="min-h-[3.5rem] rounded-xl border border-input bg-transparent px-3 py-2 text-base font-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </label>
            <Button type="submit" className="h-12 rounded-xl text-base">{t('save')}</Button>
          </form>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={open} disabled={opening} className="h-11 flex-1 rounded-xl">
              {opening ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}{t('rcptDownload')}
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant={confirming ? 'destructive' : 'ghost'}
                onClick={() => { if (confirming) { vault.remove(receipt); onClose(); } else setConfirming(true); }}
                className={cn('h-11 flex-1 rounded-xl', !confirming && 'text-danger hover:text-danger')}
              >
                <Trash2 className="me-2 h-4 w-4" />{confirming ? t('rcptDeleteConfirm') : t('delete')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <PhotoViewer src={zoom ? file.data : null} name={receipt.store || t('grReceiptPhoto')} onClose={() => setZoom(false)} />
    </>
  );
}

/**
 * The receipts vault: snap or upload a receipt and it is kept for the whole household, grouped by
 * month with what each month's receipts add up to. The assistant (when on) fills in shop, day and total.
 */
function ReceiptsView() {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const blur = !!user?.blurValues;
  const currency = user?.currency || 'ILS';
  const { convert } = useMoney(currency);
  const { currentMember, isWorkspaceOwner } = useAuth();
  const vault = useReceiptVault();
  const { receipts, isLoading, reading } = vault;
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const fmt = useCallback((c) => money(loc, c || currency), [loc, currency]);
  const stores = useMemo(() => [...new Set(receipts.map((r) => r.store).filter(Boolean))].sort(), [receipts]);

  const months = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = !q ? receipts : receipts.filter((r) => [r.store, r.note, r.total, r.date].some((v) => v != null && String(v).toLowerCase().includes(q)));
    const byMonth = new Map();
    for (const r of shown) {
      const key = (r.date || String(r.created_date || '').slice(0, 10) || '').slice(0, 7) || 'none';
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(r);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)))
      .map(([key, rows]) => ({
        key,
        label: key === 'none' ? t('rcptNoDate') : new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(dayDate(`${key}-15`)),
        rows: rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_date).localeCompare(String(a.created_date))),
        total: rows.reduce((sum, r) => sum + (typeof r.total === 'number' ? (!r.currency || r.currency === currency ? r.total : convert(r.total, r.currency) || 0) : 0), 0),
      }));
  }, [receipts, query, loc, t, currency, convert]);

  const open = receipts.find((r) => r.id === openId) || null;
  // Whoever added a receipt can delete it, and so can the household's owner and admins (as on the server)
  const isAdmin = isWorkspaceOwner || currentMember?.role === 'admin';
  const vaultWithRules = useMemo(() => ({
    ...vault,
    canDelete: (r) => isAdmin || r.createdBy === (user?.id || user?._id) || r.addedBy === user?.email?.toLowerCase(),
  }), [vault, user, isAdmin]);

  return (
    <div className="space-y-5">
      <section className={card} aria-labelledby="rc-title">
        <div className="mb-3 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><Receipt className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="rc-title" className="text-base font-semibold tracking-tight text-foreground">{t('rcptTitle')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{vault.aiReady ? t('rcptHintAi') : t('rcptHint')}</p>
          </div>
        </div>
        <AddButtons onFiles={vault.add} t={t} />
      </section>

      {receipts.length >= SEARCH_FROM && (
        <label className="relative block">
          <span className="sr-only">{t('rcptSearch')}</span>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('rcptSearch')} className="h-11 rounded-2xl ps-10" />
        </label>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : !receipts.length ? (
        <section className="rounded-3xl border border-dashed border-foreground/15 px-5 py-10 text-center">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{t('rcptEmptyTitle')}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t('rcptEmptyHint')}</p>
        </section>
      ) : !months.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('rcptNoMatch')}</p>
      ) : (
        months.map((m) => (
          <section key={m.key} aria-labelledby={`rc-${m.key}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 id={`rc-${m.key}`} className="text-sm font-semibold text-foreground first-letter:uppercase">{m.label}</h3>
              <p className="text-xs text-muted-foreground">
                {m.total > 0 && <span className={cn('font-semibold tabular-nums text-foreground', blur && 'blur-sm')} dir="ltr">{fmt(currency)(m.total)}</span>}
                {m.total > 0 && ' · '}{t('rcptCount', { n: m.rows.length })}
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {m.rows.map((r) => (
                <ReceiptTile key={r.id} receipt={r} reading={reading.has(r.id)} onOpen={(x) => setOpenId(x.id)} loc={loc} fmt={fmt} blur={blur} t={t} />
              ))}
            </ul>
          </section>
        ))
      )}

      {open && <ReceiptSheet receipt={open} vault={vaultWithRules} stores={stores} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export default memo(ReceiptsView);
