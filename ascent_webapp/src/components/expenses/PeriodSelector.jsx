import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { getYear, parseISO } from 'date-fns';

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function PeriodSelector({ transactions = [], selectedYear, selectedMonths = [], onYearChange, onMonthChange }) {
  const { t } = useTheme();
  const stripRef = useRef(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const yearNum = parseInt(selectedYear);

  const years = useMemo(() => {
    const set = new Set([currentYear, yearNum]);
    transactions.forEach((tx) => tx.date && set.add(getYear(parseISO(tx.date))));
    return Array.from(set).sort((a, b) => a - b);
  }, [transactions, currentYear, yearNum]);

  const yearIdx = years.indexOf(yearNum);
  const canPrev = yearIdx > 0;
  const canNext = yearIdx < years.length - 1;

  const changeYear = useCallback((next) => {
    onYearChange(String(next));
    onMonthChange([]);
  }, [onYearChange, onMonthChange]);

  const toggleMonth = useCallback((value) => {
    const key = String(value);
    onMonthChange(selectedMonths.includes(key) ? selectedMonths.filter((m) => m !== key) : [...selectedMonths, key]);
    if (navigator.vibrate) navigator.vibrate(8);
  }, [selectedMonths, onMonthChange]);

  useEffect(() => {
    const target = stripRef.current?.querySelector('[data-active="true"]');
    target?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedYear, selectedMonths.length]);

  const chip = (active, current) => cn(
    "relative shrink-0 snap-center rounded-full px-4 min-h-11 text-sm font-medium transition-[background-color,color,transform] duration-200 active:scale-95 sm:min-h-9",
    active
      ? "bg-primary text-primary-foreground shadow-[0_6px_18px_-8px_hsl(var(--glow)/0.7)]"
      : "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
    current && !active && "text-foreground"
  );

  const arrow = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 disabled:opacity-30 sm:h-9 sm:w-9";

  return (
    <div className="flex items-center gap-1">
      <div className="flex shrink-0 items-center">
        <button type="button" className={arrow} disabled={!canPrev} onClick={() => changeYear(years[yearIdx - 1])} aria-label={String(years[yearIdx - 1] ?? '')}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <span className="min-w-[3.25rem] text-center text-base font-semibold tabular-nums text-foreground">{selectedYear}</span>
        <button type="button" className={arrow} disabled={!canNext} onClick={() => changeYear(years[yearIdx + 1])} aria-label={String(years[yearIdx + 1] ?? '')}>
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </button>
      </div>

      <div
        ref={stripRef}
        role="group"
        className="flex flex-1 snap-x gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-12px),transparent)]"
      >
        <button type="button" data-active={selectedMonths.length === 0} aria-pressed={selectedMonths.length === 0} onClick={() => onMonthChange([])} className={chip(selectedMonths.length === 0)}>
          {t('all')}
        </button>
        {MONTH_KEYS.map((key, i) => {
          const value = i + 1;
          const active = selectedMonths.includes(String(value));
          const isCurrent = yearNum === currentYear && value === currentMonth;
          return (
            <button key={key} type="button" data-active={active} aria-pressed={active} aria-label={t(FULL_KEYS[i])} onClick={() => toggleMonth(value)} className={chip(active, isCurrent)}>
              {t(key)}
              {isCurrent && !active && <span aria-hidden className="absolute bottom-1 start-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary rtl:translate-x-1/2" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(PeriodSelector);
