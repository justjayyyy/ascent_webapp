import React, { memo } from 'react';
import { Check, Repeat } from 'lucide-react';
import { motion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import BlurValue from '../BlurValue';
import { countdown, formatDay, moneyIn } from '../plans/PlanParts';
import { daysUntil, dueState, taskEmoji } from './taskUtils';

const DUE_TONE = {
  overdue: 'text-danger',
  today: 'text-warning',
  soon: 'text-warning',
  later: 'text-muted-foreground',
  undated: 'text-muted-foreground',
  done: 'text-success',
};

/** "3 days late", "today", "in 5 days · 12 Oct", "no date". */
export function dueLabel(task, { t, loc, today = new Date() }) {
  const state = dueState(task, today);
  if (state === 'done') return task.doneAt ? t('tkDoneOnDate', { date: formatDay(String(task.doneAt).slice(0, 10), loc) }) : t('tkDone');
  if (state === 'undated') return t('tkNoDate');
  const days = daysUntil(task, today);
  if (days < 0) return t('tkDaysLate', { n: -days });
  if (days === 0) return t('today');
  return days <= 14 ? `${countdown(days, loc, t)} · ${formatDay(task.dueDate, loc)}` : formatDay(task.dueDate, loc, true);
}

/** One task as a row: tap it to edit, the circle at the end to mark it done. */
export const TaskRow = memo(function TaskRow({ task, onOpen, onDone, who, t, loc, blur, today }) {
  const state = dueState(task, today);
  const person = who?.isShared && task.assignee ? who.of(task.assignee) : null;
  const done = state === 'done';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center"
    >
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pe-2 ps-4 text-start transition-colors hover:bg-foreground/[0.03]"
      >
        <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xl', state === 'overdue' ? 'bg-danger/10' : 'bg-foreground/[0.05]', done && 'opacity-60')}>
          {taskEmoji(task)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('flex items-center gap-1.5 text-[15px] font-medium text-foreground', done && 'text-muted-foreground line-through decoration-foreground/30')}>
            <span className="truncate">{task.title}</span>
            {task.repeat && task.repeat !== 'none' && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t(`tkRepeat_${task.repeat}`)} />}
          </span>
          <span className={cn('flex items-center gap-1.5 truncate text-xs', DUE_TONE[state])}>
            {person && (
              <span aria-hidden title={person.name} className="inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-background" style={{ background: person.color }}>
                {person.initials?.slice(0, 1)}
              </span>
            )}
            <span className="truncate">{dueLabel(task, { t, loc, today })}</span>
          </span>
        </span>
        {task.amount > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
            <BlurValue blur={blur}>{moneyIn(loc, task.currency)(task.amount)}</BlurValue>
          </span>
        )}
      </button>
      {!done && (
        <button
          type="button"
          onClick={() => onDone(task)}
          aria-label={t('tkMarkDoneNamed', { name: task.title })}
          className="group me-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-success/10 hover:text-success focus-visible:text-success"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-current">
            <Check className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={3} />
          </span>
        </button>
      )}
    </motion.li>
  );
});

/** A titled group of task rows on one card. */
export function TaskGroup({ id, title, tone, count, children }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={cn('mb-2 flex items-baseline gap-2 px-1 text-sm font-bold uppercase tracking-[0.06em]', tone || 'text-muted-foreground')}>
        {title}<span className="font-medium tabular-nums opacity-70">{count}</span>
      </h2>
      <ul className="divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/60 bg-card/75 shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05),0_8px_30px_-14px_hsl(0_0%_0%/0.45)]">
        {children}
      </ul>
    </section>
  );
}
