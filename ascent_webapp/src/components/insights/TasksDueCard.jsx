import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import BlurValue from '@/components/BlurValue';
import { createPageUrl } from '@/utils';
import { dueLabel } from '@/components/tasks/TaskParts';
import { dueState, taskEmoji } from '@/components/tasks/taskUtils';
import { moneyIn } from '@/components/plans/PlanParts';

/** Household tasks that are late or close, with what they will cost. Shown only when there are some. */
export default function TasksDueCard({ tasks, t, loc, blur }) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden />{t('tkDueSoon')}
        </h2>
        <Link to={createPageUrl('Tasks')} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">{t('dashViewAll')}</Link>
      </div>
      <ul className="mt-2 divide-y divide-border/50">
        {tasks.map((task) => {
          const late = dueState(task) === 'overdue';
          return (
            <li key={task.id}>
              <Link to={`${createPageUrl('Tasks')}?task=${task.id}`} className="flex min-h-12 items-center gap-3 py-2">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-lg">{taskEmoji(task)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
                  <span className={cn('block truncate text-xs', late ? 'text-danger' : 'text-warning')}>{dueLabel(task, { t, loc })}</span>
                </span>
                {task.amount > 0 && (
                  <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr"><BlurValue blur={blur}>{moneyIn(loc, task.currency)(task.amount)}</BlurValue></span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
