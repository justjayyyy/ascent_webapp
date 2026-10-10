import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Camera, Check, CircleAlert, FileUp, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useTheme } from '@/components/ThemeProvider';
import { ascent } from '@/api/client';
import { useAssistStatus } from '@/hooks/useWorkspaceData';
import { localDay } from '@/lib/localDay';
import { cn } from '@/lib/utils';
import { isPdf, prepareReceipt } from './receiptImage';
import { ItemEmoji, localeOf, money } from './GroceryParts';
import { aisleEmoji, guessItem, lastBought, lineQty, receiptPurchases } from './groceryUtils';
import { useGroceryList } from './useGroceryList';
import { ExpenseQuestion, useShopExpense } from './ShopExpense';

const TAG = {
  list: ['grTagOnList', 'bg-success/[0.14] text-success'],
  new: ['grTagNew', 'bg-primary/[0.14] text-primary'],
  known: ['grTagKnown', 'bg-foreground/[0.07] text-muted-foreground'],
};

/**
 * A receipt into Groceries, list or no list: snap it (or pick a photo or a PDF), and everything on it goes in.
 * Things on the list are bought and come off it, things bought before get this purchase, new products become
 * items, each with its price, how many and the shop. Opened from a supermarket payment (`transaction`), it
 * offers to confirm the payment after; from Groceries, it asks whether to add the shop as an expense.
 */
export default function ScanReceipt({ open, onClose, transaction = null, onConfirmTransaction }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const list = useGroceryList();
  const queryClient = useQueryClient();
  const { data: status } = useAssistStatus();
  const aiReady = !!(status?.ai?.configured && status?.ai?.enabled);
  const camera = useRef(null);
  const picker = useRef(null);
  const [stage, setStage] = useState('choose'); // choose | reading | review | saved | failed
  const [preview, setPreview] = useState(null);
  const [read, setRead] = useState(null);
  const [keep, setKeep] = useState(() => new Set());
  const [result, setResult] = useState(null);
  const [kept, setKept] = useState(false);
  const txDay = transaction?.date ? String(transaction.date).slice(0, 10) : null;
  const day = read?.date || txDay || localDay();
  const currency = read?.currency || transaction?.currency || user?.currency || 'ILS';
  const store = read?.store || transaction?.merchant || transaction?.description || '';
  const expense = useShopExpense({ enabled: open && !transaction, date: day, currency: read?.currency, onDone: onClose });

  useEffect(() => {
    if (open) { setStage('choose'); setPreview(null); setRead(null); setResult(null); setKept(false); }
  }, [open]);

  // What each line will be: on the list, bought before, or new
  const kinds = useMemo(() => (read ? receiptPurchases(list.items, read.items, { date: day }).kinds : []), [read, list.items, day]);
  const fmt = money(loc, currency);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStage('reading');
    try {
      let source = file;
      if (isPdf(file)) {
        const { pdfAsImage } = await import('@/components/notes/importDocument');
        source = await pdfAsImage(file);
      }
      const photo = await prepareReceipt(source);
      setPreview(photo.preview);
      // Matched against everything the household buys, what is on the list and what was bought before first
      const known = [...list.items].sort((a, b) => Number(b.onList) - Number(a.onList) || String(lastBought(b) || '').localeCompare(String(lastBought(a) || '')));
      const answer = await ascent.assist.readReceipt({
        image: photo.image,
        mediaType: photo.mediaType,
        items: known.slice(0, 400).map((i) => ({ id: i.id, name: i.name })),
      });
      if (!answer?.isReceipt) { setStage('failed'); return; }
      setRead(answer);
      setKeep(new Set(answer.items.map((_, i) => i)));
      setStage(answer.items.length ? 'review' : 'failed');
      ascent.entities.Receipt.create({
        type: 'image/jpeg', data: photo.image, thumb: photo.thumb, name: `receipt-${answer.date || txDay || localDay()}.jpg`,
        store: answer.store || store, date: answer.date || txDay || localDay(), total: answer.total, currency: answer.currency || currency, read: true,
        items: answer.items.map(({ matchId: _m, name: _n, aisle: _a, ...line }) => line),
      }).then(() => { setKept(true); queryClient.invalidateQueries({ queryKey: ['receipts'] }); }).catch(() => {});
    } catch {
      setStage('failed');
    }
  };

  const add = () => {
    setResult(list.recordReceipt(read, { keep, date: day, currency, store }));
    setStage('saved');
  };

  const toggle = (i) => setKeep((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const differs = transaction && read?.total > 0 && Math.abs(read.total - transaction.amount) > Math.max(0.05, transaction.amount * 0.01);
  const logged = !transaction && read ? expense.loggedFor({ ...read, date: day }) : null;
  const pending = transaction?.status === 'pending' && onConfirmTransaction;

  return (
    <>
      <Dialog open={open && !expense.isOpen} onOpenChange={(o) => { if (!o && stage !== 'reading') onClose(); }}>
        <DialogContent className="max-h-[92dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
          <DialogHeader className="text-start">
            <DialogTitle className="text-2xl font-bold tracking-tight">{t('grFromReceiptTitle')}</DialogTitle>
            <DialogDescription>
              {stage === 'saved' ? t('grFromReceiptDone') : transaction && stage !== 'review' ? t('grFromReceiptHintPayment', { shop: store || t('grExpenseDescription') }) : t('grFromReceiptHint')}
            </DialogDescription>
          </DialogHeader>

          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-hidden tabIndex={-1} />
          <input ref={picker} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={onFile} aria-label={t('grChooseReceipt')} tabIndex={-1} />

          {(stage === 'reading' || stage === 'failed') && preview && (
            <div className="relative h-40 overflow-hidden rounded-2xl bg-foreground/[0.04]">
              <img src={preview} alt={t('grReceiptPhoto')} className={cn('h-full w-full object-cover object-top transition-opacity', stage === 'reading' && 'opacity-70')} />
              {stage === 'reading' && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 animate-[grScan_1.6s_ease-in-out_infinite] bg-primary shadow-[0_2px_12px_0_hsl(var(--glow)/0.6)] motion-reduce:hidden" />
              )}
            </div>
          )}
          {stage === 'reading' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t('grReadingReceipt')}</p>
          )}
          {stage === 'failed' && (
            <p className="rounded-2xl bg-danger/10 p-3 text-sm text-foreground" role="alert">{t('grReceiptUnreadable')}</p>
          )}

          {stage === 'review' && read && (
            <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                {[
                  [t('grTotal'), read.total !== null ? fmt(read.total) : '—', true],
                  [t('grStore'), store || '—'],
                  [t('date'), new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`))],
                ].map(([label, value, figure]) => (
                  <div key={label} className="min-w-0 rounded-2xl bg-foreground/[0.04] px-2 py-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className={cn('truncate font-semibold text-foreground', figure && 'tabular-nums', figure && user?.blurValues && 'blur-sm')}>{value}</dd>
                  </div>
                ))}
              </dl>
              {differs && (
                <p className="flex gap-1.5 rounded-2xl bg-warning/10 p-3 text-sm text-foreground">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {t('grTotalDiffers', { receipt: fmt(read.total), payment: money(loc, transaction.currency || currency)(transaction.amount) })}
                </p>
              )}
              <section aria-labelledby="gr-from-lines">
                <h3 id="gr-from-lines" className="mb-1.5 text-sm font-semibold text-foreground">{t('grFromReceiptLines', { n: keep.size, total: read.items.length })}</h3>
                <ul className="max-h-[42dvh] divide-y divide-border/50 overflow-y-auto overscroll-contain rounded-2xl bg-foreground/[0.04] px-3">
                  {read.items.map((line, i) => {
                    const name = line.name || line.text;
                    const item = line.matchId ? list.items.find((x) => x.id === line.matchId) : null;
                    const [tag, tone] = TAG[kinds[i]] || TAG.new;
                    const qty = lineQty(line, loc);
                    const on = keep.has(i);
                    return (
                      // Lines have no id, and the same product can be on a receipt twice
                      <li key={i}>
                        <label className={cn('flex min-h-14 cursor-pointer items-center gap-3 py-2 text-sm transition-opacity', !on && 'opacity-45')}>
                          <Checkbox checked={on} onCheckedChange={() => toggle(i)} aria-label={name} className="h-5 w-5 rounded-md" />
                          {item ? <ItemEmoji item={item} className="text-xl" /> : (
                            <span aria-hidden className="text-xl leading-none">{guessItem(name).emoji || aisleEmoji(line.aisle)}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">{item?.name || name}</span>
                              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>{t(tag)}</span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[line.text !== (item?.name || name) ? line.text : null, qty].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className={cn('shrink-0 font-semibold tabular-nums text-foreground', user?.blurValues && 'blur-sm')} dir="ltr">
                            {typeof line.price === 'number' ? fmt(line.price) : '—'}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
              {kept && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Archive className="h-4 w-4" />{t('rcptKeptAfterShop')}</p>}
            </div>
          )}

          {stage === 'saved' && result && (
            <ul className="flex flex-wrap gap-2" aria-label={t('grFromReceiptDone')}>
              {[
                ['grSumBought', result.updated, 'bg-success/[0.12] text-success'],
                ['grSumNew', result.added, 'bg-primary/[0.12] text-primary'],
                ['grSumOffList', result.offList, 'bg-foreground/[0.07] text-foreground'],
              ].filter(([, n]) => n > 0).map(([key, n, tone]) => (
                <li key={key} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium', tone)}>
                  <Check className="h-4 w-4" />{t(key, { n })}
                </li>
              ))}
            </ul>
          )}

          {stage === 'saved' && !transaction && expense.canLog && (
            <ExpenseQuestion logged={logged} onNo={onClose} onYes={() => expense.open({ ...read, date: day }, { store })} />
          )}

          <div className="grid gap-2 empty:hidden">
            {(stage === 'choose' || stage === 'failed') && (aiReady ? (
              <>
                <Button onClick={() => camera.current?.click()} className="h-12 rounded-xl text-base">
                  {stage === 'failed' ? <RotateCcw className="me-2 h-5 w-5" /> : <Camera className="me-2 h-5 w-5" />}
                  {stage === 'failed' ? t('grTryAnotherPhoto') : t('grTakeReceiptPhoto')}
                </Button>
                <Button variant="secondary" onClick={() => picker.current?.click()} className="h-12 rounded-xl text-base">
                  <FileUp className="me-2 h-5 w-5" />{t('grChooseReceipt')}
                </Button>
              </>
            ) : (
              <p className="flex gap-2 rounded-2xl bg-foreground/[0.04] p-3 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t('grScanNeedsAssistant')}
              </p>
            ))}
            {stage === 'review' && (
              <>
                <Button onClick={add} disabled={!keep.size} className="h-12 rounded-xl text-base">
                  <Check className="me-2 h-5 w-5" />{t('grAddFromReceipt', { n: keep.size })}
                </Button>
                <Button variant="ghost" onClick={onClose} className="h-11 rounded-xl">{t('grNotNow')}</Button>
              </>
            )}
            {stage === 'saved' && pending && (
              <Button onClick={() => { onConfirmTransaction(transaction); onClose(); }} className="h-12 rounded-xl text-base">
                <Check className="me-2 h-5 w-5" />{t('grConfirmPaymentToo')}
              </Button>
            )}
            {(stage === 'choose' || stage === 'failed' || (stage === 'saved' && (transaction || !expense.canLog))) && (
              <Button variant="ghost" onClick={onClose} className="h-11 rounded-xl">{stage === 'saved' ? t('grDone') : t('grNotNow')}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!transaction && expense.dialog}
    </>
  );
}
