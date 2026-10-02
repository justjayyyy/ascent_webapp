import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/lib/motion';
import { CloudOff, Check, Loader2, AlertCircle, CloudUpload, RotateCw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import BlurValue from '@/components/BlurValue';
import { useTheme } from '@/components/ThemeProvider';
import { useOnline } from '@/lib/offline/network';
import { useOutbox } from '@/lib/offline/txOutbox';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring', stiffness: 460, damping: 34 };

function describe(op, t, language) {
  if (op.kind === 'create') {
    const row = op.rows[0] || {};
    const title = row.description || translateCategory(row.category, language) || t('offItemAdd');
    return { title, amount: row.amount, currency: row.currency, extra: op.rows.length > 1 ? op.rows.length : 0, verb: t('offItemAdd') };
  }
  if (op.kind === 'update') return { title: op.data?.description || t('offItemEdit'), amount: op.data?.amount, currency: op.data?.currency, verb: t('offItemEdit') };
  return { title: t('offItemDelete'), verb: t('offItemDelete') };
}

/**
 * The connection and sync state, as a small pill that drops out from under the phone's island
 * (bottom corner on desktop): offline, sending, done, or something the server would not take.
 * Tapping it lists what is waiting on this device, with retry and discard.
 */
export default function SyncStatus() {
  const { t, language, user } = useTheme();
  const online = useOnline();
  const { box, ops, pending, failed, syncing, lastSyncedAt } = useOutbox();
  const reduce = useReducedMotion();
  const [flash, setFlash] = useState(false);
  const [open, setOpen] = useState(false);
  const seen = useRef(lastSyncedAt);

  // A short "all synced" after queued changes went out
  useEffect(() => {
    if (!lastSyncedAt || lastSyncedAt === seen.current) return undefined;
    seen.current = lastSyncedAt;
    if (pending || failed) return undefined;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 2200);
    return () => clearTimeout(id);
  }, [lastSyncedAt, pending, failed]);

  let state = null;
  if (failed) state = { key: 'failed', icon: AlertCircle, text: t('offFailed').replace('{count}', failed), tone: 'text-danger' };
  else if (!online) state = { key: 'offline', icon: CloudOff, text: pending ? t('offOfflineWaiting').replace('{count}', pending) : t('offOffline'), tone: 'text-foreground' };
  else if (syncing && pending) state = { key: 'syncing', icon: Loader2, spin: true, text: t('offSyncing').replace('{count}', pending), tone: 'text-primary' };
  else if (pending) state = { key: 'waiting', icon: CloudUpload, text: t('offWaiting').replace('{count}', pending), tone: 'text-foreground' };
  else if (flash) state = { key: 'synced', icon: Check, text: t('offSynced'), tone: 'text-success' };

  const money = (amount, currency) => {
    if (amount == null || amount === '') return '';
    try {
      const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || user?.currency || 'ILS', maximumFractionDigits: 2 }).format(amount);
    } catch { return String(amount); }
  };

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--header-total)+var(--safe-top)+0.25rem)] z-[49] flex justify-center md:inset-x-auto md:bottom-6 md:end-6 md:top-auto"
      >
        <AnimatePresence>
          {state && (
            <motion.button
              key="pill"
              type="button"
              onClick={() => setOpen(true)}
              aria-live="polite"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.9, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.92, filter: 'blur(4px)' }}
              transition={SPRING}
              className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border border-border/70 bg-popover/95 px-3.5 text-xs font-medium shadow-[0_10px_28px_-14px_hsl(0_0%_0%/0.8)] backdrop-blur-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={state.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className={cn('inline-flex items-center gap-2', state.tone)}
                >
                  <state.icon className={cn('h-4 w-4', state.spin && 'animate-spin')} aria-hidden="true" />
                  <span className="tabular-nums">{state.text}</span>
                </motion.span>
              </AnimatePresence>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-start">
            <DialogTitle>{t('offSheetTitle')}</DialogTitle>
            <DialogDescription>{online ? t('offSheetOnline') : t('offSheetOffline')}</DialogDescription>
          </DialogHeader>

          {ops.length === 0 ? (
            <p className="rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-sm text-muted-foreground">{t('offNothingWaiting')}</p>
          ) : (
            <ul className="-mx-1 max-h-[45dvh] divide-y divide-border/50 overflow-y-auto px-1">
              {ops.map((op) => {
                const d = describe(op, t, language);
                return (
                  <li key={op.id} className="flex items-center gap-3 py-3">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-2xl', op.error ? 'bg-danger/15 text-danger' : 'bg-foreground/[0.06] text-muted-foreground')}>
                      {op.error ? <AlertCircle className="h-4 w-4" /> : <CloudUpload className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" dir="auto">{d.title}</p>
                      <p className={cn('truncate text-xs', op.error ? 'text-danger' : 'text-muted-foreground')}>
                        {op.error ? t('offRefused') : d.verb}{d.extra ? ` · ×${d.extra}` : ''}
                      </p>
                    </div>
                    {d.amount != null && d.amount !== '' && (
                      <span className="text-sm font-semibold tabular-nums" dir="ltr"><BlurValue blur={!!user?.blurValues}>{money(d.amount, d.currency)}</BlurValue></span>
                    )}
                    {op.error && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" aria-label={t('offRetry')} onClick={() => box?.retry(op.id)}><RotateCw /></Button>
                        <Button size="icon" variant="ghost" aria-label={t('offDiscard')} className="text-danger hover:text-danger" onClick={() => box?.discard(op.id)}><Trash2 /></Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {pending > 0 && online && (
            <Button onClick={() => box?.flush()} disabled={syncing} className="h-11 w-full rounded-full">
              {syncing ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {t('offSyncNow')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
