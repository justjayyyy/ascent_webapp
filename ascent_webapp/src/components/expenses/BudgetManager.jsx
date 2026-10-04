import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ChevronLeft, ChevronRight, Copy, Edit, Eye, EyeOff, Loader2, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { useAuth } from '@/lib/AuthContext';
import { useMoney } from '@/hooks/useWorkspaceData';
import { addMonths, budgetsForMonth, lastBudgetedBefore, removalFrom } from '@shared/budgets';
import { localeOf, monthNames, shownMonth } from './budgetMonths';

const clampThreshold = (value) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 80 : Math.min(100, Math.max(1, n));
};

/** Adding a budget, or changing one: its category (fixed once it has a budget), limit, warning and whether it repeats. */
function BudgetForm({ initial, categoryOptions, lockedCategory, monthName, note, showShare, isLoading, onSubmit, onCancel, submitLabel }) {
  const { colors, t, language } = useTheme();
  const [form, setForm] = useState(initial);

  // Keep the chosen category one that can still be picked (another may have just taken it)
  useEffect(() => {
    if (lockedCategory) return;
    if (form.category && categoryOptions.some((c) => c.name === form.category)) return;
    const next = categoryOptions[0]?.name || '';
    if (next !== form.category) setForm((prev) => ({ ...prev, category: next }));
  }, [categoryOptions, lockedCategory, form.category]);

  const limit = parseFloat(form.monthlyLimit);
  const valid = !!form.category && limit > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ ...form, monthlyLimit: limit, alertThreshold: clampThreshold(form.alertThreshold) });
  };

  const fieldClass = cn('h-11 text-base sm:h-10 sm:text-sm', colors.bgTertiary, colors.border, colors.textPrimary);
  const ids = initial.id ? `-${initial.id}` : '';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`budget-category${ids}`} className={cn('text-xs sm:text-sm', colors.textSecondary)}>{t('category')} *</Label>
          <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })} disabled={!!lockedCategory}>
            <SelectTrigger id={`budget-category${ids}`} className={fieldClass}>
              <SelectValue placeholder={t('selectCategory')} />
            </SelectTrigger>
            <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
              {(lockedCategory ? [{ id: 'locked', name: lockedCategory }] : categoryOptions).map((category) => (
                <SelectItem key={category.id} value={category.name} className={colors.textPrimary}>
                  {translateCategory(category.name, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`budget-limit${ids}`} className={cn('text-xs sm:text-sm', colors.textSecondary)}>{t('monthlyLimit')} *</Label>
          {/* Left to right in every language, so the currency stays after the number */}
          <div className="relative" dir="ltr">
            <Input
              id={`budget-limit${ids}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="1000"
              value={form.monthlyLimit}
              onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })}
              className={cn(fieldClass, 'pe-14 tabular-nums')}
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium text-muted-foreground">{form.currency}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`budget-threshold${ids}`} className={cn('text-xs sm:text-sm', colors.textSecondary)}>{t('alertThreshold')} (%)</Label>
        <Input
          id={`budget-threshold${ids}`}
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          placeholder="80"
          dir="ltr"
          value={form.alertThreshold}
          // Kept as typed; read as 1 to 100 on save
          onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
          className={cn(fieldClass, 'max-w-[8rem] tabular-nums')}
        />
        <p className={cn('text-xs', colors.textTertiary)}>{t('alertThresholdHelp')}</p>
      </div>

      <div className="flex items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <Label htmlFor={`budget-repeat${ids}`} className={cn('flex cursor-pointer items-center gap-2 text-sm', colors.textSecondary)}>
            <Repeat aria-hidden className="h-4 w-4 shrink-0" />
            {t('bdRepeat')}
          </Label>
          {!form.repeat && <p className={cn('mt-0.5 text-xs', colors.textTertiary)}>{t('bdRepeatHint', { month: monthName })}</p>}
        </div>
        <Switch id={`budget-repeat${ids}`} checked={form.repeat} onCheckedChange={(checked) => setForm({ ...form, repeat: checked })} />
      </div>

      {showShare && (
        <div className="flex items-center justify-between gap-3 py-1">
          <Label htmlFor={`budget-shared${ids}`} className={cn('flex cursor-pointer items-center gap-2 text-sm', colors.textSecondary)}>
            {form.isShared ? <Eye aria-hidden className="h-4 w-4 shrink-0" /> : <EyeOff aria-hidden className="h-4 w-4 shrink-0" />}
            {t('shareWithTeam')}
          </Label>
          <Switch id={`budget-shared${ids}`} checked={form.isShared} onCheckedChange={(checked) => setForm({ ...form, isShared: checked })} />
        </div>
      )}

      {note && <p className={cn('text-xs text-pretty', colors.textTertiary)}>{note}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className={cn('h-11 flex-1 bg-transparent sm:h-10', colors.border, colors.textSecondary)}>
            {t('cancel')}
          </Button>
        )}
        {/* Enabled once something is typed, so the browser says why 0 or less cannot be saved */}
        <Button type="submit" disabled={isLoading || !form.category || form.monthlyLimit === ''} className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/80 sm:h-10">
          {isLoading
            ? <Loader2 className="me-2 h-4 w-4 animate-spin" />
            : onCancel ? <Edit className="me-2 h-4 w-4" /> : <Plus className="me-2 h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Budgets month by month. A month shows the budgets that count in it (repeating ones from earlier months
 * included); changing one from a later month starts a new budget there, so earlier months keep theirs.
 */
export default function BudgetManager({
  open,
  onClose,
  budgets,
  categories = [],
  onAdd,
  onUpdate,
  onRemove,
  onCopy,
  isLoading,
  selectedYear,
  selectedMonths = [],
  canEdit = true,
}) {
  const { colors, t, language, user, isRTL } = useTheme();
  const { currentWorkspace } = useAuth();
  const isOwner = currentWorkspace?.ownerId === user?.id || currentWorkspace?.ownerId === user?._id;
  const userCurrency = user?.currency || 'ILS';
  const { convert } = useMoney(userCurrency);

  const pageMonth = shownMonth(selectedYear, selectedMonths);
  const [month, setMonth] = useState(pageMonth);
  const [editingId, setEditingId] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const [added, setAdded] = useState(0); // a fresh add form after each budget added

  // Opens on the month the page shows
  useEffect(() => {
    if (open) { setMonth(pageMonth); setEditingId(null); }
  }, [open, pageMonth]);

  const names = useMemo(() => monthNames(month, language), [month, language]);
  const nameOf = (key) => monthNames(key, language);
  const money = (amount, currency) => new Intl.NumberFormat(localeOf(language), {
    style: 'currency', currency: currency || userCurrency, maximumFractionDigits: 0,
  }).format(amount);

  const monthBudgets = useMemo(
    () => budgetsForMonth(budgets, month).sort((a, b) => translateCategory(a.category, language).localeCompare(translateCategory(b.category, language), language)),
    [budgets, month, language]
  );
  const total = monthBudgets.reduce((sum, b) => sum + (convert(b.monthlyLimit, b.currency) ?? b.monthlyLimit), 0);
  const previous = useMemo(() => (monthBudgets.length ? null : lastBudgetedBefore(budgets, month)), [budgets, month, monthBudgets.length]);

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'Expense' || c.type === 'Both' || !c.type), [categories]);
  const freeCategories = useMemo(() => {
    const used = new Set(monthBudgets.map((b) => b.category));
    return expenseCategories.filter((c) => !used.has(c.name));
  }, [expenseCategories, monthBudgets]);

  const newForm = {
    category: freeCategories[0]?.name || '', monthlyLimit: '', alertThreshold: 80, currency: userCurrency, repeat: true, isShared: true,
  };
  const [y, m] = month.split('-').map(Number);

  const save = async (budget, form) => {
    const fields = { monthlyLimit: form.monthlyLimit, alertThreshold: form.alertThreshold, repeat: form.repeat, isShared: form.isShared };
    if (!budget) {
      await onAdd({ ...fields, category: form.category, currency: form.currency, year: y, month: m });
      setAdded((n) => n + 1);
    } else if (budget.inherited) {
      // From an earlier month: a budget of its own from this month, so the months before keep theirs
      await onAdd({ ...fields, category: budget.category, currency: budget.currency || userCurrency, year: y, month: m }, { edit: true });
    } else {
      await onUpdate(budget.id, fields);
    }
    setEditingId(null);
  };

  const copyPrevious = () => onCopy(previous.budgets.map((b) => ({
    category: b.category, monthlyLimit: b.monthlyLimit, currency: b.currency || userCurrency, alertThreshold: b.alertThreshold || 80,
    isShared: b.isShared !== false, year: y, month: m, repeat: true,
  })));

  const describe = (b) => {
    if (b.repeat !== true || b.until === b.from) return t('bdOnlyMonth', { month: nameOf(b.from).name });
    if (b.until) return t('bdEveryUntil', { from: nameOf(b.from).from, until: nameOf(b.until).name });
    return t('bdEverySince', { month: nameOf(b.from).from });
  };

  // What removing it does, for the confirmation
  const removal = useMemo(() => {
    if (!toRemove) return null;
    const category = translateCategory(toRemove.category, language);
    if (!toRemove.inherited && toRemove.repeat !== true) {
      const [beneath] = budgetsForMonth(budgets.filter((b) => b.id !== toRemove.id && b.category === toRemove.category), month);
      return beneath
        ? t('bdRevertBody', { category, amount: money(beneath.monthlyLimit, beneath.currency), month: names.name })
        : t('bdRemoveOneBody', { category, month: names.name });
    }
    return t('bdStopBody', { category, month: names.from });
  }, [toRemove, budgets, month, language, names]);

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, 'max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto p-4 sm:w-full sm:p-6')}>
        <DialogHeader className="pb-1">
          <DialogTitle className={cn('flex items-center gap-2 text-lg font-bold sm:text-xl', colors.accentText)}>
            <Target className="h-5 w-5" />
            {t('manageBudgets')}
          </DialogTitle>
          <DialogDescription className={cn('text-xs sm:text-sm', colors.textTertiary)}>{t('setBudgetLimits')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-full bg-foreground/[0.05] p-1">
            <button type="button" aria-label={t('dashPrevMonth')} onClick={() => { setMonth(addMonths(month, -1)); setEditingId(null); }}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 sm:h-9 sm:w-9">
              <PrevIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize" aria-live="polite">{names.name}</span>
            <button type="button" aria-label={t('dashNextMonth')} onClick={() => { setMonth(addMonths(month, 1)); setEditingId(null); }}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-foreground/10 active:scale-95 sm:h-9 sm:w-9">
              <NextIcon className="h-4 w-4" />
            </button>
          </div>
          {monthBudgets.length > 0 && (
            <p className="text-end text-xs text-muted-foreground tabular-nums sm:text-sm">{t('bdMonthTotal', { amount: money(total, userCurrency) })}</p>
          )}
        </div>

        {/* A month without budgets, after months that had some */}
        {monthBudgets.length === 0 && previous && (
          <div className="rounded-2xl bg-primary/[0.08] p-4">
            <p className="text-sm font-medium text-foreground">{t('bdNoneThisMonth', { month: names.name })}</p>
            {canEdit && (
              <>
                <p className="mt-1 text-xs text-muted-foreground text-pretty">{t('bdCopyHint')}</p>
                <Button type="button" onClick={copyPrevious} disabled={isLoading} className="mt-3 h-11 bg-primary text-primary-foreground hover:bg-primary/80 sm:h-10">
                  {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Copy className="me-2 h-4 w-4" />}
                  {t('bdCopyFrom', { month: nameOf(previous.month).name })}
                </Button>
              </>
            )}
          </div>
        )}

        {monthBudgets.length > 0 && (
          <ul className="space-y-2" aria-label={t('currentBudgets')}>
            {monthBudgets.map((budget) => (
              <li key={budget.id} className={cn('rounded-2xl p-3 sm:p-4', colors.bgTertiary)}>
                {editingId === budget.id ? (
                  <BudgetForm
                    initial={{
                      id: budget.id, category: budget.category, monthlyLimit: String(budget.monthlyLimit), alertThreshold: budget.alertThreshold || 80,
                      currency: budget.currency || userCurrency, repeat: budget.repeat === true || budget.inherited, isShared: budget.isShared !== false,
                    }}
                    lockedCategory={budget.category}
                    categoryOptions={[]}
                    monthName={names.name}
                    note={budget.inherited ? t('bdChangesFrom', { month: names.from, amount: money(budget.monthlyLimit, budget.currency) }) : null}
                    showShare={isOwner}
                    isLoading={isLoading}
                    onSubmit={(form) => save(budget, form)}
                    onCancel={() => setEditingId(null)}
                    submitLabel={t('updateBudget')}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-medium sm:text-base', colors.textPrimary)}>{translateCategory(budget.category, language)}</p>
                      <p className={cn('mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs sm:text-sm', colors.textTertiary)}>
                        <span className="font-medium tabular-nums text-foreground" dir="ltr">{money(budget.monthlyLimit, budget.currency)}</span>
                        <span aria-hidden>·</span>
                        <span>{describe(budget)}</span>
                        <span aria-hidden>·</span>
                        <span>{t('alertAt')} {budget.alertThreshold || 80}%</span>
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => setEditingId(budget.id)}
                          className={cn('h-11 w-11 hover:bg-primary/20 sm:h-9 sm:w-9', colors.textSecondary)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => setToRemove(budget)}
                          className="h-11 w-11 text-danger hover:bg-danger/20 hover:text-danger sm:h-9 sm:w-9">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <section className="mt-2 border-t border-border/60 pt-4" aria-labelledby="budget-add-title">
            <h3 id="budget-add-title" className={cn('mb-3 text-sm font-semibold sm:text-base', colors.textPrimary)}>{t('bdAddTitle')}</h3>
            {freeCategories.length === 0 ? (
              <p className={cn('text-sm', colors.textTertiary)}>{t('bdAllBudgeted', { month: names.name })}</p>
            ) : (
              <BudgetForm
                key={`${month}-${added}`}
                initial={newForm}
                categoryOptions={freeCategories}
                monthName={names.name}
                showShare={isOwner}
                isLoading={isLoading}
                onSubmit={(form) => save(null, form)}
                submitLabel={t('addBudget')}
              />
            )}
          </section>
        )}

        <AlertDialog open={!!toRemove} onOpenChange={(o) => { if (!o) setToRemove(null); }}>
          <AlertDialogContent className={cn(colors.cardBg, colors.cardBorder)}>
            <AlertDialogHeader>
              <AlertDialogTitle className={colors.textPrimary}>{t('bdRemoveTitle')}</AlertDialogTitle>
              <AlertDialogDescription className={colors.textTertiary}>{removal}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className={cn(colors.border, colors.textSecondary)}>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { onRemove(removalFrom(budgets, toRemove.category, month)); setToRemove(null); setEditingId(null); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('bdRemove')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
