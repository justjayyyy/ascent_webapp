import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Camera, Check, CircleAlert, Loader2, PenLine, RotateCcw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { ascent } from '@/api/client';
import { useAssistStatus, useCategories, useMoney, usePlans } from '@/hooks/useWorkspaceData';
import { useTransactions } from '@/lib/offline/txOutbox';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { localDay } from '@/lib/localDay';
import { cn } from '@/lib/utils';
import { prepareReceipt } from './receiptImage';
import { ReceiptLines, localeOf, money } from './GroceryParts';
import { findLoggedExpense } from './groceryUtils';

const groceriesCategory = (categories) =>
  categories.find((c) => c.nameKey === 'groceries' || c.name === 'groceries')
  || categories.find((c) => /grocer|מכולת|продукт/i.test(c.name))
  || categories.find((c) => c.type === 'Expense');

/**
 * After the shop: the items are already counted as bought today. Snap the receipt and the assistant
 * reads the total, shop, date and every line (how many, the price of each), and each line's price goes
 * onto its item for next time. The photo is kept in the receipts vault too. Then it asks whether to add
 * the shop as an expense, saying so when the payment seems to be there already (from Apple Pay, say).
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
  // The payments around the shop's day, to spot the one Apple Pay or the bank already added
  const since = trip?.date ? localDay(new Date(Date.parse(`${trip.date}T12:00:00`) - 7 * 86_400_000)) : undefined;
  const { data: transactions = [] } = useTransactions({ from: since, enabled: !!trip && canLog && hasPermission('viewExpenses') });
  const { save, saving } = useSaveTransaction();
  const fileRef = useRef(null);
  const [stage, setStage] = useState('choose'); // choose | reading | read | failed
  const [preview, setPreview] = useState(null);
  const [read, setRead] = useState(null);
  const [expense, setExpense] = useState(null);
  const [kept, setKept] = useState(false);
  const queryClient = useQueryClient();
  const { convert } = useMoney(read?.currency || user?.currency || 'ILS');

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
      // Each matched line's price goes onto today's purchase of that item: the price of one (or of a kg), so
      // buying three, or a heavier bag, does not read as a price rise; and how many, when the list did not say
      const prices = {};
      const qtys = {};
      result.items.forEach((line) => {
        if (!line.matchId || prices[line.matchId] !== undefined) return;
        const price = line.unitPrice ?? line.price;
        if (price !== null) prices[line.matchId] = price;
        if (line.qty && (line.qty !== 1 || line.unit)) qtys[line.matchId] = line.unit ? `${line.qty} ${line.unit}` : String(line.qty);
      });
      const fresh = trip.items.map((i) => list.items.find((x) => x.id === i.id) || i);
      list.addPrices(fresh, prices, { currency: result.currency || currency, date: trip.date, store: trip.store ? '' : result.store || '', qtys });
      ascent.entities.Receipt.create({
        type: 'image/jpeg', data: photo.image, thumb: photo.thumb, name: `receipt-${result.date || trip.date}.jpg`,
        store: result.store || trip.store || '', date: result.date || trip.date, total: result.total, currency: result.currency || currency, read: true,
        items: result.items.map(({ matchId: _m, ...line }) => line),
      }).then(() => { setKept(true); queryClient.invalidateQueries({ queryKey: ['receipts'] }); }).catch(() => {});
    } catch {
      setStage('failed');
    }
  };

  const matched = read ? new Set(read.items.filter((l) => l.matchId).map((l) => l.matchId)).size : 0;
  const logged = read && canLog
    ? findLoggedExpense(transactions, { total: read.total, currency: read.currency || currency, date: read.date || trip.date }, convert)
    : null;
  const day = (d) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${String(d).slice(0, 10)}T12:00:00`));

  return (
    <>
      <Dialog open={!expense} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
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
              <ReceiptLines lines={read.items} fmt={fmt} loc={loc} blur={!!user?.blurValues} t={t} />
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

          {stage === 'read' && canLog && (
            <section aria-labelledby="gr-expense-q" className={cn('rounded-2xl p-3.5', logged ? 'bg-warning/10' : 'bg-foreground/[0.04]')}>
              <h3 id="gr-expense-q" className="text-base font-semibold text-foreground">{t('grExpenseQ')}</h3>
              {logged ? (
                <p className="mt-1 flex gap-1.5 text-sm text-foreground">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span>
                    {t('grExpenseAlreadyThere', {
                      what: logged.description || logged.merchant || t('grExpenseDescription'),
                      amount: money(loc, logged.currency || currency)(logged.amount),
                      date: day(logged.date),
                    })}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('grExpenseQHint')}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant={logged ? 'default' : 'secondary'} onClick={onClose} className="h-12 rounded-xl text-base">{t('grExpenseNo')}</Button>
                <Button variant={logged ? 'secondary' : 'default'} onClick={() => openExpense(read)} className="h-12 rounded-xl text-base">
                  {t(logged ? 'grExpenseAddAnyway' : 'grExpenseYes')}
                </Button>
              </div>
            </section>
          )}

          <div className="grid gap-2 empty:hidden">
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
            {/* After a read, the question above is the way out */}
            {!(stage === 'read' && canLog) && (
              <Button variant="ghost" onClick={onClose} disabled={stage === 'reading'} className="h-11 rounded-xl">
                {stage === 'read' || !canLog ? t('grDone') : t('grSkip')}
              </Button>
            )}
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
