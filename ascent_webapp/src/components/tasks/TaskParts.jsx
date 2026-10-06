import React, { memo, useMemo, useRef } from 'react';
import { Check, Repeat } from 'lucide-react';
import { motion, useMotionValue, useTransform } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import BlurValue from '../BlurValue';
import { countdown, formatDay, moneyIn } from '../plans/PlanParts';
import { daysUntil, dueState, taskEmoji } from './taskUtils';

const DUE_TONE = {
  overdue: 'text-danger',
  today: 'text-warning',
  soon: 'text-foreground/80',
  later: 'text-muted-foreground',
  undated: 'text-muted-foreground',
  done: 'text-success',
};

const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** "Sat, Oct 10" in the reader's language. */
export const dayWithWeekday = (day, loc) => new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' })
  .format(new Date(`${day}T12:00:00`));

/** "1 day", "3 days", "3 дня", "3 ימים". */
const daysIn = (n, loc) => new Intl.NumberFormat(loc, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(n);

/** "Late by 3 days", "Today", "Tomorrow · Wed, Oct 7", "in 5 days · Sun, Oct 11", "Mar 3, 2027", "No date". */
export function dueLabel(task, { t, loc, today = new Date() }) {
  const state = dueState(task, today);
  if (state === 'done') return task.doneAt ? t('tkDoneOnDate', { date: formatDay(String(task.doneAt).slice(0, 10), loc) }) : t('tkDone');
  if (state === 'undated') return t('tkNoDate');
  const days = daysUntil(task, today);
  if (days < 0) return t('tkLateBy', { days: daysIn(-days, loc) });
  if (days === 0) return t('today');
  return days <= 14 ? `${countdown(days, loc, t)} · ${dayWithWeekday(task.dueDate, loc)}` : formatDay(task.dueDate, loc, true);
}

/** The person a task is given to, as a small coloured initial. */
function WhoDot({ person }) {
  if (!person) return null;
  return (
    <span
      title={person.name}
      className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold leading-none text-background"
      style={{ background: person.color }}
    >
      <span aria-hidden>{person.initials?.slice(0, 1)}</span>
      <span className="sr-only">{person.name}</span>
    </span>
  );
}

/** When it is due, how often it comes round, and who does it, on one line. */
function TaskMeta({ task, who, t, loc, today, showDue = true, className }) {
  const state = dueState(task, today);
  const person = who?.isShared && task.assignee ? who.of(task.assignee) : null;
  const repeats = task.repeat && task.repeat !== 'none' && state !== 'done';
  if (!showDue && !repeats && !person) return null;
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-[13px] leading-5', className)}>
      {person && <WhoDot person={person} />}
      {showDue && <span className={cn('truncate', DUE_TONE[state], (state === 'overdue' || state === 'today') && 'font-semibold')}>{dueLabel(task, { t, loc, today })}</span>}
      {repeats && (
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          {showDue && <span aria-hidden>·</span>}
          <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t(`tkRepeat_${task.repeat}`)}</span>
        </span>
      )}
    </span>
  );
}

const Money = ({ task, loc, blur, className }) => (
  <span className={cn('shrink-0 font-semibold tabular-nums text-foreground', className)} dir="ltr">
    <BlurValue blur={blur}>{moneyIn(loc, task.currency)(task.amount)}</BlurValue>
  </span>
);

const SWIPE = 96;

/**
 * Phones: drag a task sideways to mark it done, the way mail apps archive. A tap that ends a drag
 * is not a tap. Off with a mouse, where the Done button and the task view do the same.
 */
function SwipeToDone({ enabled, onDone, label, className, children }) {
  const coarse = useMemo(isCoarse, []);
  const on = enabled && coarse;
  const x = useMotionValue(0);
  const reveal = useTransform(x, [-SWIPE, -24, 0, 24, SWIPE], [1, 0.25, 0, 0.25, 1]);
  const dragged = useRef(false);
  const armed = useRef(false);
  if (!on) return <div className={className}>{children}</div>;
  return (
    <div className={cn('relative isolate', className)}>
      <motion.div
        aria-hidden
        style={{ opacity: reveal }}
        className="absolute inset-0 -z-10 flex items-center justify-between rounded-[inherit] bg-success/15 px-5 text-sm font-semibold text-success"
      >
        <span className="inline-flex items-center gap-1.5"><Check className="h-5 w-5" strokeWidth={3} />{label}</span>
        <span className="inline-flex items-center gap-1.5">{label}<Check className="h-5 w-5" strokeWidth={3} /></span>
      </motion.div>
      <motion.div
        drag="x"
        dragSnapToOrigin
        dragDirectionLock
        dragElastic={0.5}
        dragConstraints={{ left: 0, right: 0 }}
        style={{ x }}
        onDragStart={() => { dragged.current = true; armed.current = false; }}
        onDrag={(_, info) => {
          const past = Math.abs(info.offset.x) > SWIPE;
          if (past !== armed.current) { armed.current = past; if (past) haptic('selection'); }
        }}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.x) > SWIPE || Math.abs(info.velocity.x) > 800) onDone();
          setTimeout(() => { dragged.current = false; }, 60);
        }}
        onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); } }}
        className="rounded-[inherit] touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}

const rowMotion = {
  layout: 'position',
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.18 } },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
};

/**
 * A task that needs someone now, as a card: what and when on top, what it costs and a Done button
 * below. Tapping anywhere else on the card opens the task.
 */
export const NowCard = memo(function NowCard({ task, onOpen, onDone, who, t, loc, blur, today }) {
  const late = dueState(task, today) === 'overdue';
  return (
    <motion.li {...rowMotion} className="list-none">
      <SwipeToDone enabled onDone={() => onDone(task)} label={t('tkDone')} className="rounded-[22px]">
        <div
          className={cn(
            'relative rounded-[22px] border p-3.5 md:flex md:items-center md:gap-4 md:py-3 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] transition-colors',
            late
              ? 'border-danger/30 bg-[linear-gradient(170deg,hsl(var(--danger)/0.09),hsl(var(--card)/0.85)_60%)]'
              : 'border-border/60 bg-card/80 hover:bg-card'
          )}
        >
          <button
            type="button"
            onClick={() => onOpen(task)}
            aria-label={task.title}
            className="absolute inset-0 z-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="pointer-events-none relative flex min-w-0 items-center gap-3 md:flex-1">
            <span aria-hidden className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[22px]', late ? 'bg-danger/[0.12]' : 'bg-foreground/[0.05]')}>
              {taskEmoji(task)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right text-base font-semibold tracking-tight text-foreground">{task.title}</span>
              <TaskMeta task={task} who={who} t={t} loc={loc} today={today} className="mt-0.5" />
            </span>
          </div>
          <div className="pointer-events-none relative mt-3 flex min-h-11 shrink-0 items-center justify-between gap-3 md:mt-0 md:gap-5">
            {task.amount > 0
              ? <Money task={task} loc={loc} blur={blur} className="text-xl font-bold tracking-tight" />
              : <span className="text-sm text-muted-foreground">{t('tkNoCost')}</span>}
            <button
              type="button"
              onClick={() => onDone(task)}
              aria-label={t('tkMarkDoneNamed', { name: task.title })}
              className="pointer-events-auto relative z-10 inline-flex h-11 items-center gap-1.5 rounded-full bg-success/[0.14] pe-4 ps-3 text-sm font-bold text-success transition-[background-color,transform] hover:bg-success/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
            >
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden />{t('tkDone')}
            </button>
          </div>
        </div>
      </SwipeToDone>
    </motion.li>
  );
});

/** The day of the month large, its weekday small: the start edge of a row in the list by month. */
function DayBlock({ day, loc }) {
  const date = new Date(`${day}T12:00:00`);
  return (
    <span aria-hidden className="w-11 shrink-0 text-center">
      <span className="block text-xl font-bold leading-none tracking-tight tabular-nums text-foreground">{date.getDate()}</span>
      <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(date)}
      </span>
    </span>
  );
}

/**
 * A task further ahead, undated or done, as one row of the list: the day, what, how often and who,
 * and what it costs. Tap it to open the task; on a phone, swipe it to mark it done.
 */
export const LedgerRow = memo(function LedgerRow({ task, onOpen, onDone, who, t, loc, blur, today }) {
  const done = task.status === 'done';
  const dated = !!task.dueDate && !done;
  return (
    <motion.li {...rowMotion} className="list-none">
      <SwipeToDone enabled={!done} onDone={() => onDone(task)} label={t('tkDone')}>
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="flex min-h-[60px] w-full items-center gap-3 bg-card/0 py-2 pe-4 ps-2 text-start transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04] focus-visible:outline-none"
        >
          {dated ? <DayBlock day={task.dueDate} loc={loc} /> : <span aria-hidden className="w-11 shrink-0 text-center text-xl font-bold text-muted-foreground/50">–</span>}
          <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-foreground/[0.05] text-xl', done && 'opacity-60')}>
            {taskEmoji(task)}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('line-clamp-2 break-words [unicode-bidi:plaintext] ltr:text-left rtl:text-right text-[15px] font-medium leading-snug text-foreground', done && 'text-muted-foreground line-through decoration-foreground/30')}>
              {task.title}
            </span>
            {/* A dated row shows its date in the day block and an undated one sits under "No date": only a done one says when */}
            <TaskMeta task={task} who={who} t={t} loc={loc} today={today} showDue={done} />
            {dated && <span className="sr-only">{dueLabel(task, { t, loc, today })}</span>}
          </span>
          {task.amount > 0 && <Money task={task} loc={loc} blur={blur} className={cn('text-sm', done && 'text-muted-foreground')} />}
        </button>
      </SwipeToDone>
    </motion.li>
  );
});

/** One stretch of the list (a month, the undated ones): its name and what it adds up to. */
export function LedgerGroup({ id, title, total, children }) {
  return (
    <section aria-labelledby={id} className="[&+&]:border-t [&+&]:border-border/60">
      <h3 id={id} className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3.5">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
        {total}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

/** The card the list by month sits on. */
export const LedgerCard = ({ children }) => (
  <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/75 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] backdrop-blur-xl">
    {children}
  </div>
);

/** The page's two answers: how many need someone now (and how many are late), and what the next 30 days cost. */
export function TaskSummary({ needCount, lateCount, cost, hasCost, t }) {
  return (
    <section aria-label={t('tkSummary')} className="grid grid-cols-2 rounded-3xl border border-border/60 bg-card/75 p-4 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)] backdrop-blur-xl sm:p-5">
      <div className="min-w-0 pe-4">
        <p className="text-[28px] font-bold leading-tight tracking-tight tabular-nums text-foreground sm:text-3xl">{needCount}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t('tkNeedNow')}</p>
        {lateCount > 0 && <p className="text-[13px] font-semibold leading-snug text-danger">{t('tkLateCount', { n: lateCount })}</p>}
      </div>
      <div className="min-w-0 border-s border-border/70 ps-4">
        <p className="truncate text-[28px] font-bold leading-tight tracking-tight tabular-nums text-foreground sm:text-3xl" dir="ltr">{cost}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{hasCost ? t('tkComingCost') : t('tkNoCosts30')}</p>
      </div>
    </section>
  );
}

/** Everyone's tasks or only mine (given to me, or to nobody). Shown in a shared household. */
export function WhoSwitch({ value, onChange, t }) {
  const options = [['all', t('tkEveryone')], ['mine', t('tkMine')]];
  return (
    <div role="radiogroup" aria-label={t('tkShowWhose')} className="inline-flex shrink-0 rounded-full bg-foreground/[0.06] p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => { if (value !== key) { haptic('selection'); onChange(key); } }}
          className={cn(
            'h-9 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,box-shadow] [@media(pointer:coarse)]:h-10',
            value === key ? 'bg-secondary text-foreground shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06),0_2px_8px_-2px_hsl(0_0%_0%/0.5)]' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The page's shape while the tasks load. */
export function TasksSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="h-[104px] animate-pulse rounded-3xl bg-foreground/[0.04]" />
      <div className="mx-1 mt-5 h-4 w-24 animate-pulse rounded-full bg-foreground/[0.05]" />
      {[0, 1, 2].map((i) => <div key={i} className="h-[124px] animate-pulse rounded-[22px] bg-foreground/[0.04]" />)}
    </div>
  );
}
