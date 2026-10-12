import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import BlurValue from '@/components/BlurValue';
import { buildMonthReview } from '@/lib/monthReview';
import { Delta } from '@/components/review/ReviewParts';
import { reviewHighlights } from '@/components/review/reviewHighlights';

const MAX_HIGHLIGHTS = 3;

/**
 * The Dashboard's way into the monthly review: the month's spending against last month and what
 * stood out, with the full review a tap away. `rows` carry `_amount` in the viewer's currency.
 */
export default function MonthReviewCard({ rows, month, monthKey, t, language, isRTL, loc, fmt, blur }) {
  const review = useMemo(() => buildMonthReview({
    // A possible duplicate still waiting for review would count the same purchase twice
    rows: rows.filter((x) => !(x.status === 'pending' && x.ingest?.flags?.includes('possibleDuplicate'))),
    month,
  }), [rows, month]);
  const highlights = useMemo(
    () => reviewHighlights(review, { t, language, fmt, blur }).slice(0, MAX_HIGHLIGHTS),
    [review, t, language, fmt, blur],
  );
  const lastMonth = new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />{t('rvTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{review.running ? t('rvRunningNote', { day: review.elapsed }) : t('rvSubtitle')}</p>
        </div>
        <Link
          to={`${createPageUrl('Review')}?month=${monthKey}`}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-4 text-sm font-semibold text-primary transition hover:bg-primary/25 active:scale-95 sm:h-9"
        >
          {t('rvOpen')}<Arrow className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {!review.isEmpty && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">{t('rvSpent')}</span>
          <span className="text-lg font-bold tabular-nums" dir="ltr"><BlurValue blur={blur}>{fmt(review.totals.spent)}</BlurValue></span>
          {review.base && <Delta now={review.totals.spent} base={review.base.spent} goodWhen="down" fmt={fmt} blur={blur} />}
          <span className="text-xs text-muted-foreground">
            {review.hasBase ? t('rvComparedWith', { what: t('rvVs_prev'), months: lastMonth }) : t('rvNoComparison')}
          </span>
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="mt-4 grid gap-2 md:grid-cols-3">
          {highlights.map((h, i) => {
            const Icon = h.icon || Sparkles;
            return (
              <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-foreground/[0.04] px-3.5 py-3 text-sm text-foreground">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', h.tone)} aria-hidden />
                <span className="text-pretty">{h.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
