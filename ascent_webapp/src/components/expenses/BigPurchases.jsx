import React, { memo, useMemo, useState } from 'react';
import { motion } from '@/lib/motion';
import { ChevronDown, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import BlurValue from '../BlurValue';
import { localDay } from '@/lib/localDay';

const SHOWN = 3;
const todayKey = () => localDay();

/** Group big-purchase rows: installments of one purchase share a group id, single payments stand alone. */
export function groupBigPurchases(rows) {
  const groups = new Map();
  rows.forEach((tx) => {
    if (!tx.isBigPurchase) return;
    const key = tx.installmentGroupId || tx.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  });
  const today = todayKey();
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const head = sorted[0];
    const count = head.installmentCount || sorted.length;
    const total = head.installmentTotal ?? sorted.reduce((s, x) => s + (x.amount || 0), 0);
    const paidRows = sorted.filter((x) => (x.date || '').slice(0, 10) <= today);
    const paid = paidRows.reduce((s, x) => s + (x.amount || 0), 0);
    const next = sorted.find((x) => (x.date || '').slice(0, 10) > today);
    return {
      key, head, rows: sorted, count, total, currency: head.currency,
      paidCount: paidRows.length, paid, remaining: Math.max(0, total - paid), next,
    };
  }).sort((a, b) => (b.head.date || '').localeCompare(a.head.date || ''));
}

/**
 * Big purchases touching the selected period: what each one cost, how many installments are
 * behind you and what is still to come.
 */
function BigPurchases({ periodRows, allRows, iconByCategory, onOpen }) {
  const { t, language, user } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const blur = !!user?.blurValues;

  const groups = useMemo(() => {
    const inPeriod = new Set(periodRows.filter((x) => x.isBigPurchase).map((x) => x.installmentGroupId || x.id));
    return groupBigPurchases(allRows).filter((g) => inPeriod.has(g.key));
  }, [periodRows, allRows]);

  if (!groups.length) return null;

  const money = (v, c) => new Intl.NumberFormat(loc, { style: 'currency', currency: c || user?.currency || 'ILS', maximumFractionDigits: 0 }).format(v || 0);
  const shortDate = (d) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${d.slice(0, 10)}T12:00:00`));
  const list = open ? groups : groups.slice(0, SHOWN);

  return (
    <section className="rounded-3xl bg-foreground/[0.04] p-4 sm:p-5" aria-label={t('bigPurchases')}>
      <div className="flex items-center gap-2">
        <ShoppingBag aria-hidden className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t('bigPurchases')}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{groups.length}</span>
      </div>
      <ul className="mt-2 divide-y divide-border/30">
        {list.map((g) => {
          const pct = g.total > 0 ? Math.min(100, (g.paid / g.total) * 100) : 0;
          const split = g.count > 1;
          const target = g.rows.find((r) => periodRows.some((p) => p.id === r.id)) || g.head;
          return (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => onOpen(target)}
                className="flex w-full items-center gap-3 rounded-2xl py-3 text-start transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg">
                  {iconByCategory[g.head.category] || <ShoppingBag className="h-5 w-5 text-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.9375rem] font-medium text-foreground">{g.head.description}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                      <BlurValue blur={blur}>{money(g.total, g.currency)}</BlurValue>
                    </span>
                  </span>
                  {split ? (
                    <>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                        <motion.span
                          className="block h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">{t('paymentsMade').replace('{paid}', g.paidCount).replace('{count}', g.count)}</span>
                        <span className="tabular-nums" dir="auto">
                          {g.remaining > 0
                            ? <>{t('leftToPay')} <BlurValue blur={blur}>{money(g.remaining, g.currency)}</BlurValue>{g.next ? ` · ${t('nextPayment')} ${shortDate(g.next.date)}` : ''}</>
                            : t('paidOff')}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{shortDate(g.head.date)} · {t('singlePayment')}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {groups.length > SHOWN && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? t('showLess') : t('showMore')} className="mx-auto mt-1 grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
          <ChevronDown className={cn("h-5 w-5 transition-transform duration-300", open && "rotate-180")} />
        </button>
      )}
    </section>
  );
}

export default memo(BigPurchases);
