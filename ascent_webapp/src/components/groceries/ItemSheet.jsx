import React, { useEffect, useRef, useState } from 'react';
import { ListPlus, ListX, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { AISLES, LEVEL_VALUE, isTracked, lastPrice, supplyOf } from './groceryUtils';
import { TONE, daysAgo, leftLabel, localeOf, money } from './GroceryParts';

const LEVELS = ['full', 'half', 'low', 'out'];
const nearestLevel = (share) => LEVELS.reduce((best, l) => (Math.abs(LEVEL_VALUE[l] - share) < Math.abs(LEVEL_VALUE[best] - share) ? l : best), 'full');
const statusOfLevel = (level) => (level === 'out' ? 'out' : level === 'low' ? 'low' : 'ok');

/**
 * How much is left, as a glass you pour: drag the surface up or down (or use the arrow keys) and it
 * settles on Full, Half, Low or Out.
 */
export function LevelVessel({ item, supply, onLevel, t }) {
  const share = supply.share;
  const ref = useRef(null);
  const [drag, setDrag] = useState(null); // live share while dragging
  const shown = drag ?? share ?? 0;
  const level = drag !== null ? nearestLevel(drag) : share === null ? null : nearestLevel(share);
  // While dragging it shows the level being poured; otherwise the estimate, in its own words
  const settled = drag === null && !supply.manual;
  const tone = TONE[settled ? supply.status : level ? statusOfLevel(level) : 'unknown'];
  const caption = settled ? leftLabel(supply, t) : level ? t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`) : '';

  const shareAt = (clientY) => {
    const box = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (box.bottom - clientY) / box.height));
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(shareAt(e.clientY));
  };
  const onMove = (e) => {
    if (drag === null) return;
    const next = shareAt(e.clientY);
    if (nearestLevel(next) !== nearestLevel(drag)) haptic('selection');
    setDrag(next);
  };
  const onUp = () => {
    if (drag === null) return;
    onLevel(nearestLevel(drag));
    setDrag(null);
  };
  const onKey = (e) => {
    const at = level ? LEVELS.indexOf(level) : 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onLevel(LEVELS[Math.max(0, at - 1)]); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onLevel(LEVELS[Math.min(LEVELS.length - 1, at + 1)]); }
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('grHowMuchLeft')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={level ? t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`) : t('grLevelUnknown')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      className="relative mx-auto h-48 w-36 cursor-ns-resize touch-none select-none overflow-hidden rounded-[32px_32px_40px_40px] border-2 border-foreground/15 bg-foreground/[0.03] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={cn('absolute inset-x-0 bottom-0 border-t-[3px]', tone.fill, tone.line, drag === null && 'transition-[height] duration-500 ease-out')}
        style={{ height: `${shown * 100}%` }}
      />
      <span aria-hidden className="absolute start-1/2 top-[28%] -translate-x-1/2 text-5xl leading-none rtl:translate-x-1/2">{item.emoji || '🛒'}</span>
      {caption && (
        <span
          className={cn('absolute start-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background shadow-lg rtl:translate-x-1/2', drag === null && 'transition-[bottom] duration-500 ease-out')}
          style={{ bottom: `calc(${Math.min(0.9, Math.max(0.04, shown)) * 100}% - 13px)` }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

/** Everything about one item: its level, aisle, how often it is bought, and putting it on or off the list. */
export default function ItemSheet({ item, open, onClose, onSave, onLevel, onList, onUnlist, onDelete }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (open && item) setForm({ name: item.name, emoji: item.emoji || '', aisle: item.aisle || 'other', qty: item.qty || '', note: item.note || '', staple: isTracked(item) });
  }, [open, item?.id]);

  if (!item || !form) return null;
  const supply = supplyOf(item);
  const last = lastPrice(item);
  const times = new Set((item.purchases || []).map((p) => p.date)).size;
  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  const close = () => {
    const changes = {};
    if (form.name.trim() && form.name.trim() !== item.name) changes.name = form.name.trim().slice(0, 120);
    if (form.emoji !== (item.emoji || '')) changes.emoji = [...form.emoji].slice(0, 2).join('');
    if (form.aisle !== item.aisle) changes.aisle = form.aisle;
    if (item.onList && form.qty !== (item.qty || '')) changes.qty = form.qty.slice(0, 40);
    if (item.onList && form.note !== (item.note || '')) changes.note = form.note.slice(0, 300);
    if (form.staple !== isTracked(item)) changes.staple = form.staple;
    if (Object.keys(changes).length) onSave(item, changes);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92dvh] w-[95vw] max-w-[95vw] overflow-y-auto p-5 sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-3">
            <input
              value={form.emoji}
              onChange={(e) => set({ emoji: e.target.value })}
              aria-label={t('grEmoji')}
              placeholder="🛒"
              className="h-12 w-12 shrink-0 rounded-2xl bg-foreground/[0.05] text-center text-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="min-w-0 flex-1">
              <DialogTitle className="sr-only">{item.name}</DialogTitle>
              <input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                aria-label={t('grItemName')}
                maxLength={120}
                className="w-full bg-transparent text-xl font-bold tracking-tight text-foreground outline-none"
              />
              <DialogDescription className="text-sm text-muted-foreground">
                {supply.lastBought ? t('grLastBought', { when: daysAgo(supply.sinceBought, loc) }) : t('grNeverBought')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <section className="mt-1">
          <LevelVessel item={{ ...item, emoji: form.emoji }} supply={supply} onLevel={(level) => onLevel(item, level)} t={t} />
          <div role="group" aria-label={t('grHowMuchLeft')} className="mt-4 grid grid-cols-4 gap-1.5">
            {LEVELS.map((level) => {
              const on = supply.manual && item.level === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onLevel(item, level)}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold transition-colors',
                    on ? cn(TONE[statusOfLevel(level)].fill, TONE[statusOfLevel(level)].text, 'ring-1 ring-current') : 'bg-foreground/[0.06] text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`grLevel${level[0].toUpperCase()}${level.slice(1)}`)}
                </button>
              );
            })}
          </div>
        </section>

        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grUsuallyLasts')}</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">{supply.interval ? t('grDays', { n: supply.interval }) : '—'}</dd>
          </div>
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grTimesBought')}</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">{times}</dd>
          </div>
          <div className="rounded-2xl bg-foreground/[0.04] p-3">
            <dt className="text-xs text-muted-foreground">{t('grLastPrice')}</dt>
            <dd className={cn('mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground', user?.blurValues && 'blur-sm')}>
              {last ? money(loc, last.currency || user?.currency)(last.price) : '—'}
            </dd>
          </div>
        </dl>

        {item.onList && (
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Input value={form.qty} onChange={(e) => set({ qty: e.target.value })} placeholder={t('grQty')} aria-label={t('grQty')} maxLength={40} className="h-11 rounded-xl" />
            <Input value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder={t('grNote')} aria-label={t('grNote')} maxLength={300} className="h-11 rounded-xl" />
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('grAisle')}</h3>
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
            {AISLES.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={form.aisle === a.key}
                onClick={() => set({ aisle: a.key })}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
                  form.aisle === a.key ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10'
                )}
              >
                <span aria-hidden>{a.emoji}</span>{t(`grAisle_${a.key}`)}
              </button>
            ))}
          </div>
        </section>

        <label className="flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] p-3.5">
          <span>
            <span className="block text-sm font-semibold text-foreground">{t('grTrackSupply')}</span>
            <span className="block text-xs text-muted-foreground">{t('grTrackSupplyHint')}</span>
          </span>
          <Switch checked={form.staple} onCheckedChange={(v) => set({ staple: v })} />
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => { onDelete(item); onClose(); }} aria-label={t('grDelete')} className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-5 w-5" />
          </Button>
          {item.onList ? (
            <Button type="button" variant="secondary" onClick={() => { onUnlist(item); onClose(); }} className="h-11 flex-1 rounded-xl">
              <ListX className="me-2 h-4 w-4" />{t('grTakeOffList')}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => { onList(item); close(); }} className="h-11 flex-1 rounded-xl">
              <ListPlus className="me-2 h-4 w-4" />{t('grPutOnList')}
            </Button>
          )}
          <Button type="button" onClick={close} className="h-11 flex-1 rounded-xl">{t('grDone')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
