import React from 'react';
import { Bell, Check, Pencil, Repeat, RotateCcw, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { translateCategory } from '@/lib/translations';
import BlurValue from '../BlurValue';
import { useTheme } from '../ThemeProvider';
import { formatDay, localeOf, moneyIn } from '../plans/PlanParts';
import { dueLabel } from './TaskParts';
import { dueState, nextDue, taskEmoji } from './taskUtils';

const TONE = { overdue: 'text-danger', today: 'text-warning', done: 'text-success' };

const Chip = ({ icon: Icon, children }) => (
  <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-[13px] font-medium text-foreground/85">
    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    <span className="truncate">{children}</span>
  </span>
);

const Fact = ({ value, label }) => (
  <div className="min-w-0 rounded-2xl bg-foreground/[0.04] p-3">
    <dd className="text-base font-bold leading-snug tracking-tight tabular-nums text-foreground">{value}</dd>
    <dt className="mt-0.5 text-xs leading-snug text-muted-foreground">{label}</dt>
  </div>
);

/**
 * A task as it stands, before anything is changed: when it is due and how often, who does it, what
 * it usually costs and what it cost the last times, and the notes. Done (or Reopen) and Edit sit at the
 * bottom, in thumb reach.
 */
export default function TaskSheet({ task, open, onClose, onDone, onEdit, onReopen, who, blur, today = new Date() }) {
  const { t, language } = useTheme();
  const loc = localeOf(language);
  if (!task) return null;

  const state = dueState(task, today);
  const done = state === 'done';
  const repeats = task.repeat && task.repeat !== 'none';
  const person = who?.isShared ? (task.assignee ? who.of(task.assignee) : null) : null;
  const history = [...(task.history || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
  const last = history.find((h) => h.amount > 0);
  const after = !done && repeats ? nextDue(task.dueDate, task.repeat) : null;
  const money = (amount, currency) => <BlurValue blur={blur}><span dir="ltr">{moneyIn(loc, currency || task.currency)(amount)}</span></BlurValue>;
  const facts = [
    task.amount > 0 && <Fact key="usual" value={money(task.amount)} label={t('tkUsualCost')} />,
    last && <Fact key="last" value={money(last.amount, last.currency)} label={`${t('tkLastTime')}, ${formatDay(last.date, loc, true)}`} />,
    after && <Fact key="after" value={formatDay(after, loc, after.slice(0, 4) !== String(today.getFullYear()))} label={t('tkAfterThis')} />,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-start sm:text-start">
          <div className="flex items-center gap-3.5 pe-8">
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-primary/[0.12] text-3xl">{taskEmoji(task)}</span>
            <div className="min-w-0">
              <DialogTitle className="[unicode-bidi:plaintext] ltr:text-left rtl:text-right text-xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{task.title}</DialogTitle>
              <DialogDescription className={cn('mt-1 text-sm font-semibold', TONE[state] || 'text-muted-foreground')}>
                {done || !task.dueDate ? dueLabel(task, { t, loc, today }) : `${dueLabel(task, { t, loc, today })}${state === 'overdue' || state === 'today' ? ` · ${formatDay(task.dueDate, loc)}` : ''}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {(repeats || person || task.category || (task.dueDate && !done)) && (
          <div className="flex flex-wrap gap-1.5">
            {repeats && <Chip icon={Repeat}>{t(`tkRepeat_${task.repeat}`)}</Chip>}
            {person && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.06] pe-3 ps-1.5 text-[13px] font-medium text-foreground/85">
                <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full text-xs font-bold text-background" style={{ background: person.color }}>{person.initials?.slice(0, 1)}</span>
                {person.name}
              </span>
            )}
            {task.dueDate && !done && (
              <Chip icon={Bell}>{task.remindDays ? t('tkRemindDaysBefore', { n: task.remindDays }) : t('tkRemindOnDay')}</Chip>
            )}
            {task.category && <Chip icon={Tag}>{translateCategory(task.category, language)}</Chip>}
          </div>
        )}

        {facts.length > 0 && <dl className={cn('grid gap-2', facts.length === 1 ? 'grid-cols-1' : facts.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{facts}</dl>}

        {task.notes && (
          <div className="rounded-2xl bg-foreground/[0.04] px-3.5 py-3">
            <p className="text-xs font-semibold text-muted-foreground">{t('notes')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">{task.notes}</p>
          </div>
        )}

        {history.length > 0 && (
          <section aria-labelledby="tk-history">
            <h3 id="tk-history" className="px-0.5 text-xs font-semibold text-muted-foreground">{t('tkHistory')}</h3>
            <ul className="mt-1 divide-y divide-border/60">
              {history.map((h) => {
                const by = who?.isShared && h.by ? who.of(h.by)?.name : '';
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-muted-foreground">{formatDay(h.date, loc, true)}{by ? ` · ${by}` : ''}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {h.amount > 0 ? money(h.amount, h.currency) : t('tkNoCost')}
                      {h.logged && <span className="ms-1.5 font-medium text-muted-foreground">· {t('tkLogged')}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="sheet-actions grid grid-cols-[1fr_1.6fr] gap-2">
          <Button type="button" variant="secondary" onClick={() => onEdit(task)} className="h-12 rounded-2xl text-[15px] font-semibold">
            <Pencil className="me-2 h-4 w-4" aria-hidden />{t('edit')}
          </Button>
          {done ? (
            <Button type="button" onClick={() => onReopen(task)} className="h-12 rounded-2xl text-[15px] font-bold">
              <RotateCcw className="me-2 h-4 w-4" aria-hidden />{t('tkReopen')}
            </Button>
          ) : (
            <Button type="button" onClick={() => onDone(task)} className="h-12 rounded-2xl bg-success text-[15px] font-bold text-background shadow-none hover:bg-success/90">
              <Check className="me-2 h-4 w-4" strokeWidth={3} aria-hidden />{t('tkMarkDone')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
