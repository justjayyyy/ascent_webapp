import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Edit, Trash2, ArrowDownLeft, ArrowUpRight, Copy, Repeat, Check, Nfc, Receipt, Loader2, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
import { useHousehold } from '@/hooks/useHousehold';
import BlurValue from '../BlurValue';

const PAGE = 30;
const isObjectId = (s) => !!s && /^[0-9a-fA-F]{24}$/.test(s);

const localeOf = (language) => (language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US');

function dayKey(date) {
  return (date || '').slice(0, 10);
}

function useDayLabel(language, t) {
  return useCallback((key) => {
    const loc = localeOf(language);
    const d = new Date(`${key}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return t('today');
    if (diff === -1) {
      const s = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(-1, 'day');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    const sameYear = d.getFullYear() === today.getFullYear();
    return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
  }, [language, t]);
}

function Avatar({ transaction, icon, size = 'md' }) {
  const income = transaction.type === 'Income';
  const Fallback = income ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl text-lg leading-none",
        size === 'lg' ? 'h-14 w-14 text-2xl' : 'h-11 w-11',
        income ? 'bg-success/15 text-success' : 'bg-foreground/[0.07] text-foreground/80'
      )}
    >
      {icon ? icon : <Fallback className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />}
    </span>
  );
}

function ActionRow({ icon: Icon, label, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-start text-base font-medium transition-colors active:scale-[0.99]",
        tone === 'danger' ? 'text-danger hover:bg-danger/10' : tone === 'primary' ? 'text-primary hover:bg-primary/10' : 'text-foreground hover:bg-foreground/[0.06]'
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function TransactionList({ transactions, cards = [], categories = [], plans = {}, onEdit, onDelete, onDuplicate, onConfirm, canEdit = true, emptyTitle }) {
  const { t, language, user } = useTheme();
  const { byEmail, isShared } = useHousehold();
  const { convertCurrency, fetchExchangeRates, rates } = useCurrencyConversion();
  const userCurrency = user?.currency || 'ILS';
  const loc = localeOf(language);
  const dayLabel = useDayLabel(language, t);
  const [visible, setVisible] = useState(PAGE);
  const [active, setActive] = useState(null);
  const sentinel = useRef(null);

  useEffect(() => {
    if (userCurrency) fetchExchangeRates('USD');
  }, [userCurrency, fetchExchangeRates]);

  const iconByCategory = useMemo(() => {
    const map = {};
    categories.forEach((c) => { if (c.icon) map[c.nameKey || c.name] = c.icon; });
    return map;
  }, [categories]);

  const money = useCallback((value, currency, decimals = 2) => new Intl.NumberFormat(loc, {
    style: 'currency', currency: currency || userCurrency, minimumFractionDigits: 0, maximumFractionDigits: decimals,
  }).format(value || 0), [loc, userCurrency]);

  const converted = useCallback((tx) => {
    if (tx.currency === userCurrency) return null;
    if (tx.amountInGlobalCurrency !== null && tx.amountInGlobalCurrency !== undefined) return tx.amountInGlobalCurrency;
    if (rates && Object.keys(rates).length > 0) return convertCurrency(tx.amount, tx.currency || 'USD', userCurrency, rates);
    return null;
  }, [userCurrency, rates, convertCurrency]);

  const cardText = useCallback((tx) => {
    if (tx.paymentMethod === 'Card' && tx.cardId) {
      const c = cards.find((x) => x.id === tx.cardId);
      return c ? `${c.name || c.cardName || ''} ••${c.lastFourDigits || ''}`.trim() : t('card');
    }
    return (tx.paymentMethod === 'Card' && tx.ingest?.sources?.[0]?.cardText) || tx.paymentMethod || '';
  }, [cards, t]);

  const shown = useMemo(() => transactions.slice(0, visible), [transactions, visible]);
  const hasMore = visible < transactions.length;

  useEffect(() => {
    if (!hasMore || !sentinel.current) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => v + PAGE);
    }, { rootMargin: '400px' });
    obs.observe(sentinel.current);
    return () => obs.disconnect();
  }, [hasMore, shown.length]);

  const groups = useMemo(() => {
    const out = [];
    shown.forEach((tx) => {
      const key = dayKey(tx.date);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(tx);
      else out.push({ key, items: [tx] });
    });
    return out;
  }, [shown]);

  const run = (fn) => () => { const tx = active; setActive(null); if (tx) setTimeout(() => fn(tx), 180); };

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary/12 text-primary">
          <Receipt className="h-8 w-8" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">{emptyTitle || t('noTransactionsFound')}</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t('addFirstTransactionOrAdjust')}</p>
      </div>
    );
  }

  const activeAuthor = active && isShared ? byEmail[active.created_by] : null;
  const activeConverted = active ? converted(active) : null;

  return (
    <>
      <div className="-mx-1">
        {groups.map((group) => (
          <section key={group.key} aria-label={dayLabel(group.key)}>
            <h3 className="sticky top-[calc(4rem+var(--safe-top,0px))] z-10 bg-background/80 md:top-0 px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground backdrop-blur-md">
              {dayLabel(group.key)}
            </h3>
            <ul>
              {group.items.map((tx, i) => {
                const income = tx.type === 'Income';
                const author = isShared ? byEmail[tx.created_by] : null;
                const conv = converted(tx);
                const pending = tx.status === 'pending';
                const cat = isObjectId(tx.category) ? '' : translateCategory(tx.category, language);
                const meta = [cat, cardText(tx)].filter(Boolean).join(' · ');
                return (
                  <motion.li
                    key={tx.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <button
                      type="button"
                      onClick={() => setActive(tx)}
                      className="flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-[background-color,transform] duration-150 hover:bg-foreground/[0.05] active:scale-[0.985] active:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Avatar transaction={tx} icon={iconByCategory[tx.category]} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[0.9375rem] font-medium text-foreground">{tx.description}</span>
                          {tx.isRecurring && <Repeat aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          {tx.isBigPurchase && !(tx.installmentCount > 1) && <ShoppingBag aria-label={t('bigPurchase')} className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          {tx.installmentCount > 1 && (
                            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[0.6875rem] font-semibold tabular-nums text-primary" dir="ltr" aria-label={t('installmentOf').replace('{index}', tx.installmentIndex).replace('{count}', tx.installmentCount)}>
                              {tx.installmentIndex}/{tx.installmentCount}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {pending && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                              <Nfc className="h-3 w-3" aria-hidden />
                              {tx.ingest?.flags?.includes('possibleDuplicate') ? t('possibleDuplicate') : t('needsReview')}
                            </span>
                          )}
                          {plans[tx.planId] && (
                            <span className="inline-flex max-w-[45%] shrink-0 items-center gap-1 truncate rounded-full bg-foreground/[0.07] px-2 py-0.5 font-medium text-foreground/80">
                              {plans[tx.planId].emoji && <span aria-hidden>{plans[tx.planId].emoji}</span>}
                              <span className="truncate">{plans[tx.planId].name}</span>
                            </span>
                          )}
                          <span className="truncate">{meta}</span>
                          {author && (
                            <span aria-label={author.name} className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold leading-none text-background" style={{ backgroundColor: author.color }}>
                              {author.initials.slice(0, 1)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className={cn("text-[0.9375rem] font-semibold tabular-nums", income ? 'text-success' : 'text-foreground')} dir="ltr">
                          <BlurValue blur={user?.blurValues}>{income ? '+' : '−'}{money(tx.amount, tx.currency)}</BlurValue>
                        </span>
                        {conv !== null && (
                          <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                            <BlurValue blur={user?.blurValues}>{money(conv, userCurrency, 0)}</BlurValue>
                          </span>
                        )}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </section>
        ))}
        {hasMore && (
          <div ref={sentinel} className="grid place-items-center py-6" aria-hidden>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Drawer open={!!active} onOpenChange={(o) => !o && setActive(null)} shouldScaleBackground={false}>
        <DrawerContent className="rounded-t-3xl border-0 bg-popover">
          {active && (
            <>
              <DrawerHeader className="items-center gap-3 pb-2 text-center">
                <Avatar transaction={active} icon={iconByCategory[active.category]} size="lg" />
                <DrawerTitle className="text-lg leading-tight">{active.description}</DrawerTitle>
                <p className={cn("text-3xl font-bold tabular-nums tracking-tight", active.type === 'Income' ? 'text-success' : 'text-foreground')} dir="ltr">
                  <BlurValue blur={user?.blurValues}>{active.type === 'Income' ? '+' : '−'}{money(active.amount, active.currency)}</BlurValue>
                </p>
                <DrawerDescription className="text-center">
                  {[
                    isObjectId(active.category) ? '' : translateCategory(active.category, language),
                    new Intl.DateTimeFormat(loc, { dateStyle: 'medium' }).format(new Date(`${dayKey(active.date)}T12:00:00`)) + (active.occurredAt ? ` · ${new Intl.DateTimeFormat(loc, { timeStyle: 'short' }).format(new Date(active.occurredAt))}` : ''),
                    cardText(active),
                    activeAuthor ? (activeAuthor.isMe ? t('me') : activeAuthor.name) : '',
                    activeConverted !== null ? money(activeConverted, userCurrency, 0) : '',
                    active.installmentCount > 1 ? `${t('installmentOf').replace('{index}', active.installmentIndex).replace('{count}', active.installmentCount)} · ${t('totalPrice')} ${money(active.installmentTotal, active.currency, 0)}` : (active.isBigPurchase ? t('bigPurchase') : ''),
                    plans[active.planId] ? `${plans[active.planId].emoji || ''} ${plans[active.planId].name}`.trim() : '',
                  ].filter(Boolean).join(' · ')}
                </DrawerDescription>
              </DrawerHeader>
              {canEdit && (
                <div className="space-y-1 px-3 pb-4 pt-2">
                  {onConfirm && active.status === 'pending' && <ActionRow icon={Check} tone="primary" label={t('confirmTransaction')} onClick={run(onConfirm)} />}
                  <ActionRow icon={Edit} label={t('edit')} onClick={run(onEdit)} />
                  <ActionRow icon={Copy} label={t('duplicate')} onClick={run(onDuplicate)} />
                  <ActionRow icon={Trash2} tone="danger" label={t('delete')} onClick={run((tx) => onDelete(tx.id))} />
                </div>
              )}
              {!canEdit && <div className="pb-4" />}
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

export default React.memo(TransactionList);
