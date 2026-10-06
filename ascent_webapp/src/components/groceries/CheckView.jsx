import React, { memo, useMemo, useState } from 'react';
import { BellRing, Check, ListPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { localDay } from '@/lib/localDay';
import { ItemEmoji, TONE, daysAgo, leftLabel, localeOf, useWho } from './GroceryParts';
import { checkedSince, daysBetween, kitchenItems, runningLow } from './groceryUtils';
import { useKitchenCheck } from './useKitchenCheck';

const LEVELS = ['full', 'half', 'low', 'out'];
const STATUS_OF = { full: 'ok', half: 'ok', low: 'low', out: 'out' };
const levelName = (level, t) => t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`);
// How often the household is reminded: off, every 3 days, weekly, fortnightly
const RHYTHMS = [null, 3, 7, 14];
const rhythmName = (days, t) => (!days ? t('grRemindOff') : days === 7 ? t('grRemindWeek') : days === 14 ? t('grRemindTwoWeeks') : t('grRemindDays', { n: days }));

/** One thing at home: what it is, what the estimate says (or who said how much is left), and four levels to tap. */
const CheckRow = memo(function CheckRow({ item, supply, checked, by, onLevel, t }) {
  const chosen = checked ? item.level : null;
  return (
    <li className="px-3.5 py-3 sm:flex sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05]"><ItemEmoji item={item} className="text-xl" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-foreground">{item.name}</span>
          <span className={cn('flex items-center gap-1 truncate text-xs', checked ? 'font-medium text-success' : supply.status === 'low' || supply.status === 'out' ? TONE[supply.status].text : 'text-muted-foreground')}>
            {checked && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />}
            {checked ? [chosen ? levelName(chosen, t) : t('grBoughtToday'), by].filter(Boolean).join(' · ') : leftLabel(supply, t) || t('grLevelUnknown')}
          </span>
        </span>
      </div>
      <div role="group" aria-label={t('grHowMuchLeftOf', { name: item.name })} className="mt-2.5 grid grid-cols-4 gap-1.5 sm:mt-0 sm:w-72 sm:shrink-0">
        {LEVELS.map((level) => {
          const on = chosen === level;
          const tone = TONE[STATUS_OF[level]];
          return (
            <button
              key={level}
              type="button"
              aria-pressed={on}
              onClick={() => onLevel(item, level)}
              className={cn(
                'h-10 rounded-xl text-sm font-semibold transition-[background-color,color,transform] active:scale-95',
                on ? cn(tone.fill, tone.text, 'ring-1 ring-current') : 'bg-foreground/[0.06] text-muted-foreground hover:text-foreground'
              )}
            >
              {levelName(level, t)}
            </button>
          );
        })}
      </div>
    </li>
  );
});

/**
 * The kitchen check: everything at home, each with Full, Half, Low and Out to tap, emptiest by the estimate
 * first. Whoever finishes it finishes it for the household, and a reminder can be set for everyone.
 */
function CheckView({ list }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  const who = useWho();
  const { items, today, me } = list;
  const kitchen = useKitchenCheck();
  const { check, due, dueOn } = kitchen;
  const [finished, setFinished] = useState(false);

  // Said since the last check counts as checked in this one (or today, before there was one)
  const since = check.lastAt && !finished ? check.lastAt : null;
  const rows = useMemo(() => kitchenItems(items, today, loc).map((row) => ({ ...row, checked: checkedSince(row.item, since, today) })), [items, today, loc, since]);
  const done = rows.filter((r) => r.checked).length;
  const low = useMemo(() => runningLow(items, today), [items, today]);

  const onLevel = (item, level) => {
    // The same level again takes the answer back
    if (item.level === level && checkedSince(item, since, today)) list.setLevel(item, null);
    else list.setLevel(item, level);
  };
  const finish = async () => {
    haptic('success');
    if (await kitchen.finish(me)) {
      setFinished(true);
      toast(t('grKitchenChecked'), { description: who.isShared ? t('grCheckedForAll') : undefined });
    }
  };
  const addLow = () => {
    haptic('light');
    low.forEach(({ item }) => list.putOnList(item));
  };

  const lastBy = check.lastBy ? (check.lastBy === me ? t('grYou') : who.of(check.lastBy)?.name) : '';
  const lastWhen = check.lastAt ? daysAgo(Math.max(0, daysBetween(localDay(new Date(check.lastAt)), today)), loc) : '';
  const nextWhen = dueOn ? new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${dueOn}T12:00:00`)) : '';

  return (
    <div className="space-y-4 pb-24">
      <section aria-labelledby="gk-title" className="rounded-3xl border border-border/60 bg-card/75 p-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="gk-title" className="text-lg font-bold tracking-tight text-foreground">{t('grKitchenCheck')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {check.lastAt ? t('grLastCheckedBy', { name: lastBy || '—', when: lastWhen }) : t('grNeverChecked')}
            </p>
          </div>
          {due && !finished && <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{t('grCheckDue')}</span>}
        </div>

        <div className="mt-4">
          <p id="gk-remind" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground"><BellRing className="h-4 w-4 text-muted-foreground" aria-hidden />{t('grRemind')}</p>
          <div role="radiogroup" aria-labelledby="gk-remind" className="grid grid-cols-4 gap-1 rounded-2xl bg-foreground/[0.05] p-1">
            {RHYTHMS.map((days) => {
              const on = (check.everyDays || null) === days;
              return (
                <button
                  key={days ?? 'off'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { if (!on) { haptic('selection'); kitchen.setEvery(days); } }}
                  className={cn('min-h-9 rounded-xl px-1 text-xs font-semibold transition-colors sm:text-sm', on ? 'bg-popover text-foreground shadow-[0_2px_10px_-4px_hsl(0_0%_0%/0.5)]' : 'text-muted-foreground hover:text-foreground')}
                >
                  {rhythmName(days, t)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {check.everyDays ? [who.isShared ? t('grRemindHint') : t('grRemindHintSolo'), nextWhen && t('grNextCheck', { when: nextWhen })].filter(Boolean).join(' ') : t('grRemindOffHint')}
          </p>
        </div>
      </section>

      {finished ? (
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-success/[0.08] px-5 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success/[0.16] text-success"><Check className="h-6 w-6" strokeWidth={3} /></span>
          <h2 className="text-lg font-semibold text-foreground">{t('grKitchenChecked')}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{who.isShared ? t('grCheckedForAll') : t('grCheckedHint')}</p>
          {low.length > 0 && (
            <button type="button" onClick={addLow} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground active:scale-[0.98]">
              <ListPlus className="h-4 w-4" />{t('grAddLowToList', { n: low.length })}
            </button>
          )}
          <button type="button" onClick={() => setFinished(false)} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">{t('grCheckAgain')}</button>
        </section>
      ) : rows.length === 0 ? (
        <p className="rounded-3xl bg-foreground/[0.04] px-5 py-8 text-center text-sm text-muted-foreground">{t('grNothingAtHome')}</p>
      ) : (
        <section aria-labelledby="gk-items">
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
            <h2 id="gk-items" className="text-[15px] font-bold tracking-tight text-foreground">{t('grHowMuchLeft')}</h2>
            <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{t('grCheckProgress', { n: done, total: rows.length })}</span>
          </div>
          <ul className="divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/60 bg-card/75">
            {rows.map(({ item, supply, checked }) => (
              <CheckRow
                key={item.id} item={item} supply={supply} checked={checked} t={t} onLevel={onLevel}
                by={checked && who.isShared && item.levelBy && item.levelBy !== me ? who.of(item.levelBy)?.name : ''}
              />
            ))}
          </ul>
        </section>
      )}

      {!finished && rows.length > 0 && (
        // Stays in view at the foot of the list, above the dock on phones
        <div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom)+96px)] z-20 flex justify-center md:bottom-6">
          <button
            type="button"
            onClick={finish}
            disabled={done === 0}
            className="pointer-events-auto inline-flex h-[52px] items-center gap-2.5 rounded-full bg-primary pe-5 ps-4 text-[15px] font-bold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--glow)/0.55)] transition-[opacity,transform] active:scale-[0.97] disabled:opacity-50"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            {t('grFinishCheck')}
            <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[13px] tabular-nums">{done}/{rows.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(CheckView);
