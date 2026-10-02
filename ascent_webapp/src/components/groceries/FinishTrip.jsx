import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Camera, Check, Loader2, PenLine, RotateCcw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { ascent } from '@/api/client';
import { useAssistStatus, useCategories, usePlans } from '@/hooks/useWorkspaceData';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { localDay } from '@/lib/localDay';
import { cn } from '@/lib/utils';
import { prepareReceipt } from './receiptImage';
import { localeOf, money } from './GroceryParts';

const groceriesCategory = (categories) =>
  categories.find((c) => c.nameKey === 'groceries' || c.name === 'groceries')
  || categories.find((c) => /grocer|מכולת|продукт/i.test(c.name))
  || categories.find((c) => c.type === 'Expense');

/**
 * After the shop: the items are already counted as bought today. Snap the receipt and the assistant
 * reads the total, shop and date into an expense, and each line's price onto its item for next time.
 * The photo is kept in the receipts vault too.
 */
export default function FinishTrip({ trip, list, onClose }) {
  const { t, language, user } = useTheme();
  const { hasPermission } = useAuth();
  const loc = localeOf(language);
  const canLog = hasPermission('editExpenses');
  const { data: status } = useAssistStatus();
  const aiReady = !!(status?.ai?.configured && status?.ai?.enabled);
  const { data: categories = [] } = useCategories({ enabled: !!trip && canLog });
  const { data: plans = [] } = usePlans({ enabled: !!trip && canLog });
  const { save, saving } = useSaveTransaction();
  const fileRef = useRef(null);
  const [stage, setStage] = useState('choose'); // choose | reading | read | failed
  const [preview, setPreview] = useState(null);
  const [read, setRead] = useState(null);
  const [expense, setExpense] = useState(null);
  const [kept, setKept] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (trip) { setStage('choose'); setPreview(null); setRead(null); setExpense(null); setKept(false); }
  }, [trip]);

  if (!trip) return null;
  const currency = user?.currency || 'ILS';
  const fmt = money(loc, read?.currency || currency);

  const openExpense = (fromReceipt) => {
    const category = groceriesCategory(categories);
    setExpense({
      type: 'Expense',
      category: category?.name || '',
      description: fromReceipt?.store || trip.store || t('grExpenseDescription'),
      amount: fromReceipt?.total || '',
      currency: fromReceipt?.currency || currency,
      date: fromReceipt?.date || trip.date || localDay(),
      paymentMethod: '',
    });
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStage('reading');
    try {
      const photo = await prepareReceipt(file);
      setPreview(photo.preview);
      const result = await ascent.assist.readReceipt({
        image: photo.image,
        mediaType: photo.mediaType,
        items: trip.items.map((i) => ({ id: i.id, name: i.name })),
      });
      if (!result?.isReceipt) { setStage('failed'); return; }
      setRead(result);
      setStage('read');
      // Each matched line's price goes onto today's purchase of that item
      const prices = {};
      result.items.forEach((line) => { if (line.matchId && line.price !== null && prices[line.matchId] === undefined) prices[line.matchId] = line.price; });
      const fresh = trip.items.map((i) => list.items.find((x) => x.id === i.id) || i);
      list.addPrices(fresh, prices, { currency: result.currency || currency, date: trip.date, store: trip.store ? '' : result.store || '' });
      ascent.entities.Receipt.create({
        type: 'image/jpeg', data: photo.image, thumb: photo.thumb, name: `receipt-${result.date || trip.date}.jpg`,
        store: result.store || trip.store || '', date: result.date || trip.date, total: result.total, currency: result.currency || currency, read: true,
      }).then(() => { setKept(true); queryClient.invalidateQueries({ queryKey: ['receipts'] }); }).catch(() => {});
    } catch {
      setStage('failed');
    }
  };

  const matched = read ? new Set(read.items.filter((l) => l.matchId).map((l) => l.matchId)).size : 0;

  return (
    <>
      <Dialog open={!expense} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-[95vw] max-w-[95vw] p-5 sm:w-full sm:max-w-md sm:p-6">
          <DialogHeader className="text-start">
            <DialogTitle className="text-2xl font-bold tracking-tight">{t('grShopDone')}</DialogTitle>
            <DialogDescription>{t('grShopDoneHint', { n: trip.items.length })}</DialogDescription>
          </DialogHeader>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

          {(stage === 'reading' || stage === 'read' || stage === 'failed') && preview && (
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

          {stage === 'read' && read && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">{t('grTotal')}</dt>
                <dd className={cn('text-end text-2xl font-bold tabular-nums tracking-tight text-foreground', user?.blurValues && 'blur-sm')}>{read.total !== null ? fmt(read.total) : '—'}</dd>
                <dt className="text-muted-foreground">{t('grStore')}</dt>
                <dd className="truncate text-end font-medium text-foreground">{read.store || '—'}</dd>
                <dt className="text-muted-foreground">{t('date')}</dt>
                <dd className="text-end font-medium text-foreground">{read.date ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${read.date}T12:00:00`)) : '—'}</dd>
              </dl>
              {matched > 0 && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-success/[0.12] px-3 py-1.5 text-sm font-medium text-success">
                  <Check className="h-4 w-4" />{t('grPricesSaved', { n: matched, total: trip.items.length })}
                </p>
              )}
              {kept && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Archive className="h-4 w-4" />{t('rcptKeptAfterShop')}</p>
              )}
            </div>
          )}

          {stage === 'failed' && (
            <p className="rounded-2xl bg-danger/10 p-3 text-sm text-foreground" role="alert">{t('grReceiptUnreadable')}</p>
          )}

          <div className="grid gap-2">
            {stage === 'read' && canLog && (
              <Button onClick={() => openExpense(read)} className="h-12 rounded-xl text-base">{t('grSaveExpense')}</Button>
            )}
            {(stage === 'choose' || stage === 'failed') && canLog && (
              aiReady ? (
                <Button onClick={() => fileRef.current?.click()} className="h-12 rounded-xl text-base">
                  {stage === 'failed' ? <RotateCcw className="me-2 h-5 w-5" /> : <Camera className="me-2 h-5 w-5" />}
                  {stage === 'failed' ? t('grTryAnotherPhoto') : t('grScanReceipt')}
                </Button>
              ) : (
                <p className="flex gap-2 rounded-2xl bg-foreground/[0.04] p-3 text-sm text-muted-foreground">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t('grScanNeedsAssistant')}
                </p>
              )
            )}
            {stage !== 'reading' && canLog && stage !== 'read' && (
              <Button variant="secondary" onClick={() => openExpense(null)} className="h-12 rounded-xl text-base">
                <PenLine className="me-2 h-5 w-5" />{t('grEnterAmount')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={stage === 'reading'} className="h-11 rounded-xl">
              {stage === 'read' || !canLog ? t('grDone') : t('grSkip')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddTransactionDialog
        open={!!expense}
        onClose={() => { setExpense(null); onClose(); }}
        onSubmit={async (data) => { if (await save(data, null)) { setExpense(null); onClose(); } }}
        isLoading={saving}
        categories={categories}
        editTransaction={expense}
        defaultType="Expense"
        plans={plans}
      />
    </>
  );
}
