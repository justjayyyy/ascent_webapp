import { Trophy } from 'lucide-react';
import { translateCategory } from '@/lib/translations';

/**
 * What stood out in a month review, in words: records, the categories that moved most, new places
 * and no-spend days. Shared by the review page and its card on the Dashboard.
 */
export function reviewHighlights(review, { t, language, fmt, blur }) {
  const cat = (c) => translateCategory(c, language);
  const out = review.records.map((r) => ({
    icon: Trophy,
    tone: r.kind === 'highestSpend' || r.kind === 'categoryHigh' ? 'text-warning' : 'text-success',
    text: t(`rvRecord_${r.kind}`, { n: r.months, category: r.category ? cat(r.category) : '' }),
  }));
  review.movers.up.slice(0, 2).forEach((m) => out.push({ tone: 'text-danger', text: t('rvMoverUp', { category: cat(m.category), amount: blur ? '••' : fmt(m.delta) }) }));
  review.movers.down.slice(0, 2).forEach((m) => out.push({ tone: 'text-success', text: t('rvMoverDown', { category: cat(m.category), amount: blur ? '••' : fmt(-m.delta) }) }));
  if (review.newMerchants.length) out.push({ tone: 'text-primary', text: t('rvNewPlaces', { n: review.newMerchants.length }) });
  if (review.noSpend.counted > 0) out.push({ tone: 'text-success', text: t('rvNoSpendSummary', { n: review.noSpend.free, longest: review.noSpend.longest }) });
  return out;
}
