import React from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import BlurValue from '@/components/BlurValue';

/**
 * The way into the weekly check-in, shown while it is due: how many payments wait for a look, or the
 * week's spending when nothing does.
 */
export default function CheckinCard({ checkin, onOpen, t, fmt, blur }) {
  const n = checkin.queue.length;
  const week = checkin.week;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-4 p-5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
    >
      <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', n ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success')}>
        <ClipboardCheck className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold tracking-tight text-foreground">{t('ciTitle')}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {n ? t('ciToLookAt', { n }) : (
            <>{t('ciCardWeek')} <span className="font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{fmt(week.spent)}</BlurValue></span></>
          )}
        </span>
      </span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform group-active:scale-95">
        {t('ciStart')}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
      </span>
    </button>
  );
}
