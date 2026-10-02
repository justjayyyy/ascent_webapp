import React, { memo, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from '@/lib/motion';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import AddBar from './AddBar';
import GroceryRows from './GroceryRows';
import { ItemEmoji, daysAgo, leftLabel, localeOf } from './GroceryParts';
import { checkQueue, haveItChanges, isTracked, levelChanges, supplyOf } from './groceryUtils';

const SWIPE = 110;

/** One "running out?" card. Drag it left to put it on the list, right if there is still some. */
function CheckCard({ entry, onAnswer, t, loc, reduce }) {
  const { item, supply } = entry;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-10, 0, 10]);
  const toList = useTransform(x, [-SWIPE, -20, 0], [1, 0, 0]);
  const toHave = useTransform(x, [0, 20, SWIPE], [0, 0, 1]);

  return (
    <motion.article
      drag="x"
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.85}
      style={{ x, rotate }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -SWIPE || info.velocity.x < -700) onAnswer('low', -1);
        else if (info.offset.x > SWIPE || info.velocity.x > 700) onAnswer('have', 1);
      }}
      variants={{
        enter: reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 },
        shown: { opacity: 1, y: 0, scale: 1 },
        gone: (dir) => (reduce ? { opacity: 0 } : { x: (dir || -1) * 420, rotate: (dir || -1) * 14, opacity: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }),
      }}
      initial="enter"
      animate="shown"
      exit="gone"
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="absolute inset-x-0 top-0 h-[216px] cursor-grab touch-pan-y select-none rounded-[28px] border border-border/80 bg-gradient-to-b from-popover to-card p-5 shadow-[0_20px_40px_-24px_hsl(0_0%_0%/0.6)] active:cursor-grabbing"
      aria-label={t('grRunningOutQ', { name: item.name })}
    >
      <motion.span aria-hidden style={{ opacity: toList }} className="pointer-events-none absolute inset-0 flex items-center rounded-[28px] bg-gradient-to-r from-warning/30 to-transparent ps-6 text-lg font-extrabold tracking-tight text-warning">
        {t('grSwipeAddToList')}
      </motion.span>
      <motion.span aria-hidden style={{ opacity: toHave }} className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-[28px] bg-gradient-to-l from-success/25 to-transparent pe-6 text-lg font-extrabold tracking-tight text-success">
        {t('grSwipeStillHave')}
      </motion.span>

      <p className="text-xs font-semibold text-muted-foreground">{t('grRunningOut')}</p>
      <div className="mt-4 flex items-center gap-4">
        <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[22px] bg-foreground/[0.06]">
          <ItemEmoji item={item} className="text-[40px]" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-2xl font-extrabold tracking-tight text-foreground">{item.name}</h3>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {supply.lastBought ? t('grBoughtWhen', { when: daysAgo(supply.sinceBought, loc) }) : t('grNeverBought')}
            {supply.interval ? <><br />{t('grUsuallyLastsDays', { n: supply.interval })}</> : null}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onAnswer('out', -1)} className="h-12 rounded-2xl bg-danger/[0.14] text-sm font-bold text-danger transition-transform active:scale-95">{t('grOut')}</button>
        <button type="button" onClick={() => onAnswer('low', -1)} className="h-12 rounded-2xl bg-warning/[0.15] text-sm font-bold text-warning transition-transform active:scale-95">{t('grLevelLow')}</button>
        <button type="button" onClick={() => onAnswer('have', 1)} className="h-12 rounded-2xl bg-success/[0.13] text-sm font-bold text-success transition-transform active:scale-95">{t('grHaveIt')}</button>
      </div>
    </motion.article>
  );
}

/**
 * The Check: the staples that are probably running out, one card at a time (swipe left onto the list,
 * right if there is still some), and the list itself by aisle. Side by side on wide screens.
 */
function CheckView({ list, shell }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const reduce = useReducedMotion();
  const { items, onList, groups, today } = list;
  const [answered, setAnswered] = useState(() => new Set());
  const [dir, setDir] = useState(-1);
  const sessionSize = useRef(0);

  const queue = useMemo(() => checkQueue(items, today).filter((e) => !answered.has(e.item.id)), [items, today, answered]);
  sessionSize.current = Math.max(sessionSize.current, queue.length + answered.size);

  const nextOut = useMemo(() => items
    .filter((i) => !i.onList && isTracked(i))
    .map((item) => ({ item, supply: supplyOf(item, today) }))
    .filter(({ supply }) => supply.daysLeft !== null && supply.status === 'ok')
    .sort((a, b) => a.supply.daysLeft - b.supply.daysLeft)[0], [items, today]);

  const answer = (entry, kind, direction) => {
    setDir(direction);
    setAnswered((s) => new Set(s).add(entry.item.id));
    if (kind === 'have') { haptic('selection'); list.save(entry.item, haveItChanges()); } else list.putOnList(entry.item, levelChanges(kind));
  };

  const top = queue.slice(0, 3);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-6">
        <section aria-label={t('grKitchenCheck')} className="mb-6 lg:mb-0">
          {top.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between px-0.5">
                <h2 className="text-[15px] font-bold tracking-tight text-foreground">{t('grKitchenCheck')}</h2>
                <span className="flex gap-1" aria-label={t('grCheckProgress', { n: answered.size, total: sessionSize.current })}>
                  {Array.from({ length: Math.min(8, sessionSize.current) }).map((_, i) => (
                    <i key={i} className={cn('h-1 w-4 rounded-full', i < answered.size ? 'bg-primary' : i === answered.size ? 'bg-primary/60' : 'bg-foreground/15')} />
                  ))}
                </span>
              </div>
              <div className="relative h-[238px]">
                {top.length > 2 && <div aria-hidden className="absolute inset-x-0 top-0 h-[216px] translate-y-[18px] scale-[0.92] rounded-[28px] border border-border/50 bg-card/60" />}
                {top.length > 1 && <div aria-hidden className="absolute inset-x-0 top-0 h-[216px] translate-y-[9px] scale-[0.96] rounded-[28px] border border-border/60 bg-card/85" />}
                <AnimatePresence custom={dir} initial={false}>
                  <CheckCard key={top[0].item.id} entry={top[0]} t={t} loc={loc} reduce={reduce} onAnswer={(kind, d) => answer(top[0], kind, d)} />
                </AnimatePresence>
              </div>
              <p className="mt-1 flex justify-between px-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" />{t('grSwipeAddToList')}</span>
                <span className="inline-flex items-center gap-1">{t('grSwipeStillHave')}<ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" /></span>
              </p>
            </>
          ) : (
            <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card/75 p-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05)]">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success/[0.14] text-success"><Check className="h-6 w-6" strokeWidth={3} /></span>
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">{t('grKitchenChecked')}</h2>
                <p className="text-sm text-muted-foreground">
                  {nextOut ? t('grNextToRunOut', { name: nextOut.item.name, when: leftLabel(nextOut.supply, t) }) : t('grKitchenCheckedHint')}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      <div>
        <AddBar inputRef={shell.addRef} items={items} onAddText={list.addText} onPick={(i) => list.putOnList(i)} className="mb-5" />
        <section aria-labelledby="gc-list">
          <h2 id="gc-list" className="mb-2.5 px-0.5 text-[15px] font-bold tracking-tight text-foreground">
            {t('grOnTheList')} <span className="ms-1 font-medium tabular-nums text-muted-foreground">{onList.length}</span>
          </h2>
          {groups.length === 0 ? (
            <p className="rounded-3xl bg-foreground/[0.04] px-5 py-6 text-center text-sm text-muted-foreground">{t('grListEmpty')}</p>
          ) : (
            <GroceryRows groups={groups} today={today} onOpen={shell.openItem} onBought={list.boughtOne} />
          )}
        </section>
      </div>
    </div>
  );
}

export default memo(CheckView);
