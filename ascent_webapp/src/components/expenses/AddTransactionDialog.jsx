import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Repeat, ShoppingBag, Minus, Plus, Sparkles } from 'lucide-react';
import { format, addMonths, parseISO, isAfter } from 'date-fns';
import { useTheme } from '../ThemeProvider';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useCards, useExchangeRates } from '@/hooks/useWorkspaceData';
import { conversionFields } from '@shared/money';
import { PORTFOLIO_ENABLED } from '@/lib/features';
import HouseholdFields, { splitIsValid } from './HouseholdFields';
import { useCategorySuggestion } from './useCategorySuggestion';

const LAST_KEY = 'ascent_last_transaction_choices';
const readLastChoices = () => {
  try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch { return {}; }
};
const rememberChoices = ({ category, paymentMethod, currency, type }) => {
  if (type !== 'Expense') return;
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ category, paymentMethod, currency })); } catch { /* storage unavailable */ }
};

/**
 * @typedef {Object} AddTransactionDialogProps
 * @property {boolean} open
 * @property {Function} onClose
 * @property {Function} onSubmit
 * @property {boolean} isLoading
 * @property {Array} categories
 * @property {Object} editTransaction
 * @property {Array} accounts
 */

/**
 * @param {AddTransactionDialogProps} props
 */
export default function AddTransactionDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  categories = [],
  editTransaction = null,
  accounts = [],
  defaultType = null,
  plans = [],
}) {
  const { user, t, language, colors } = useTheme();
  const { rates, isLoading: isLoadingRates } = useExchangeRates();
  const userCurrency = user?.currency || 'ILS';
  const startType = defaultType || 'Expense';
  const isEditing = !!(editTransaction && (editTransaction.id || editTransaction._id));
  const activePlans = useMemo(() => plans.filter(p => p.status !== 'archived'), [plans]);
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const defaultCategory = categories.find(c => c.type === startType || c.type === 'Both');
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: startType,
    category: defaultCategory?.name || '',
    description: '',
    amount: '',
    currency: user?.currency || 'ILS',
    paymentMethod: '',
    cardId: '',
    relatedAccountId: '',
    isRecurring: false,
    recurringFrequency: 'monthly',
    recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
    recurringEndDate: format(addMonths(new Date(), 11), 'yyyy-MM-dd'), // Default to 12 months
    isBigPurchase: false,
    installmentCount: '1',
    planId: '',
    planItemId: '',
    commitmentId: '',
    paidBy: '',
    split: null,
  });

  const [errors, setErrors] = useState({});
  // A category picked by hand is never replaced by a suggestion
  const categoryTouched = useRef(false);
  const suggestion = useCategorySuggestion(formData.description, formData.type, open && !isEditing);
  useEffect(() => {
    if (!suggestion || categoryTouched.current) return;
    if (!categories.some((c) => c.name === suggestion.name)) return;
    setFormData((f) => (f.category === suggestion.name ? f : { ...f, category: suggestion.name }));
  }, [suggestion, categories]);
  const showSuggested = !!suggestion && !categoryTouched.current && formData.category === suggestion.name;

  // Category chips: last-used first, the rest behind a "more" menu
  const { quickCategories, moreCategories } = useMemo(() => {
    const filtered = categories.filter(cat => cat.type === formData.type || cat.type === 'Both');
    const last = readLastChoices().category;
    const sorted = [...filtered].sort((a, b) => (b.name === last) - (a.name === last));
    const visible = sorted.slice(0, 6);
    const selected = sorted.find(c => c.name === formData.category);
    if (selected && !visible.includes(selected)) visible[visible.length - 1] = selected;
    return { quickCategories: visible, moreCategories: sorted.filter(c => !visible.includes(c)) };
  }, [categories, formData.type, formData.category]);
  const dateInputRef = useRef(null);
  const isInitialOpenRef = useRef(true);

  // What gets stored next to the amount: its value in the person's own currency at today's rate,
  // or nothing when there is no rate yet (never the unconverted amount)
  const conversion = useMemo(
    () => conversionFields(parseFloat(formData.amount) || 0, formData.currency || userCurrency, userCurrency, rates),
    [formData.amount, formData.currency, userCurrency, rates]
  );
  const needsConversion = (formData.currency || userCurrency) !== userCurrency;

  const { data: allCards = [] } = useCards();
  const cards = useMemo(() => allCards.filter((c) => c.isActive !== false), [allCards]);

  useEffect(() => {
    if (editTransaction) {
      // Check if this is a duplicate (has no id or _id) - use today's date for duplicates
      const isDuplicate = !editTransaction.id && !editTransaction._id;
      setFormData({
        date: isDuplicate ? format(new Date(), 'yyyy-MM-dd') : editTransaction.date,
        type: editTransaction.type,
        category: editTransaction.category,
        description: editTransaction.description,
        amount: editTransaction.amount.toString(),
        currency: editTransaction.currency,
        paymentMethod: editTransaction.paymentMethod || '',
        cardId: editTransaction.cardId || '',
        relatedAccountId: editTransaction.relatedAccountId || '',
        isRecurring: editTransaction.isRecurring || false,
        recurringFrequency: editTransaction.recurringFrequency || 'monthly',
        recurringStartDate: editTransaction.recurringStartDate || format(new Date(), 'yyyy-MM-dd'),
        recurringEndDate: editTransaction.recurringEndDate || format(addMonths(new Date(), 11), 'yyyy-MM-dd'),
        isBigPurchase: !!editTransaction.isBigPurchase,
        installmentCount: '1',
        planId: editTransaction.planId || '',
        planItemId: editTransaction.planItemId || '',
        commitmentId: editTransaction.commitmentId || '',
        paidBy: editTransaction.paidBy || '',
        split: editTransaction.split?.mode ? editTransaction.split : null,
      });
      // If editing and no amountInGlobalCurrency exists, we'll recalculate it on submit
    } else {
      const last = readLastChoices();
      const usable = (n) => startType === 'Expense' && categories.some(c => c.name === n && (c.type === 'Expense' || c.type === 'Both'));
      const defaultCategory = categories.find(c => c.type === startType || c.type === 'Both');
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: startType,
        category: usable(last.category) ? last.category : (defaultCategory?.name || ''),
        description: '',
        amount: '',
        currency: last.currency || user?.currency || 'ILS',
        paymentMethod: last.paymentMethod || '',
        cardId: '',
        relatedAccountId: '',
        isRecurring: false,
        recurringFrequency: 'monthly',
        recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
        recurringEndDate: format(addMonths(new Date(), 11), 'yyyy-MM-dd'),
        isBigPurchase: false,
        installmentCount: '1',
        planId: '',
        planItemId: '',
        commitmentId: '',
        paidBy: '',
        split: null,
      });
    }
    categoryTouched.current = false;
    setErrors({});
  }, [editTransaction, open, user?.currency, categories, startType]);

  // Prevent date input from auto-focusing on mobile when dialog opens
  useEffect(() => {
    if (open) {
      isInitialOpenRef.current = true;
      if (dateInputRef.current && window.innerWidth < 640) {
        // Small delay to ensure dialog is fully rendered, then blur if focused
        setTimeout(() => {
          if (document.activeElement === dateInputRef.current && isInitialOpenRef.current) {
            dateInputRef.current.blur();
            isInitialOpenRef.current = false;
          }
        }, 150);
      } else {
        isInitialOpenRef.current = false;
      }
    }
  }, [open]);

  const validate = () => {
    const newErrors = {};

    if (!formData.isRecurring || isEditing) {
      if (!formData.date) {
        newErrors.date = t('dateRequired');
      }
    } else {
      if (!formData.recurringStartDate) {
        newErrors.recurringStartDate = t('startDateRequired') || 'Start date is required';
      }
      if (!formData.recurringEndDate) {
        newErrors.recurringEndDate = t('endDateRequired') || 'End date is required';
      }
      if (formData.recurringStartDate && formData.recurringEndDate) {
        const startDate = parseISO(formData.recurringStartDate);
        const endDate = parseISO(formData.recurringEndDate);
        if (isAfter(startDate, endDate)) {
          newErrors.recurringEndDate = t('endDateAfterStartDate') || 'End date must be after start date';
        }
      }
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = t('amountGreaterThanZero');
    }

    if (formData.type === 'Expense' && !splitIsValid(formData.split)) {
      newErrors.split = t('splitMustTotal');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    rememberChoices(formData);
    const isExpense = formData.type === 'Expense';
    await onSubmit({
      ...formData,
      description: formData.description.trim() || translateCategory(formData.category, language),
      amount: parseFloat(formData.amount),
      ...conversion,
      relatedAccountId: formData.relatedAccountId || undefined,
      isBigPurchase: isExpense && formData.isBigPurchase,
      installmentCount: splitting ? installments : 1,
      planId: (isExpense && formData.planId) || null,
      planItemId: (isExpense && formData.planId && formData.planItemId) || null,
      commitmentId: (isExpense && formData.commitmentId) || null,
      paidBy: (isExpense && formData.paidBy) || null,
      split: (isExpense && formData.split) || null,
    });
  };

  const installments = Math.max(1, Math.min(60, parseInt(formData.installmentCount, 10) || 1));
  const splitting = formData.type === 'Expense' && formData.isBigPurchase && !isEditing && installments > 1;
  const inCurrency = (n, currency = formData.currency) => new Intl.NumberFormat(loc, {
    style: 'currency', currency: currency || userCurrency, maximumFractionDigits: 2,
  }).format(n || 0);
  const installmentPreview = (() => {
    const total = parseFloat(formData.amount) || 0;
    if (!splitting || !total || !formData.date) return '';
    const month = (d) => new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric' }).format(d);
    const first = parseISO(formData.date);
    return t('installmentPreview')
      .replace('{count}', installments)
      .replace('{amount}', inCurrency(Math.round((total / installments) * 100) / 100))
      .replace('{from}', month(first))
      .replace('{to}', month(addMonths(first, installments - 1)));
  })();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "w-[95vw] max-w-[95vw] sm:w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-3 sm:p-6")}>
        <DialogHeader className="pb-1.5 sm:pb-4">
          <DialogTitle className={cn("text-base sm:text-xl font-bold", colors.accentText)}>
            {isEditing
              ? t('editTransaction')
              : defaultType === 'Income' ? t('addIncome') : defaultType === 'Expense' ? t('addExpense') : t('addTransactionTitle')
            }
          </DialogTitle>
          <DialogDescription className={cn("text-xs sm:text-sm hidden sm:block", colors.textTertiary)}>
            {editTransaction && (editTransaction.id || editTransaction._id)
              ? t('updateTransactionDetails')
              : t('recordNewTransaction')
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4 mt-1.5 sm:mt-4">
          <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="amount" className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('amount')} *</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                autoFocus={!editTransaction}
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={cn("h-14 text-3xl font-semibold tabular-nums", colors.bgTertiary, colors.border, colors.textPrimary, errors.amount && 'border-danger')}
              />
              {errors.amount && <p className="text-xs text-danger">{errors.amount}</p>}
              {needsConversion && parseFloat(formData.amount) > 0 && (
                <p className={cn("text-xs", colors.textTertiary)}>
                  {conversion.amountInGlobalCurrency !== null ? (
                    <>
                      ≈ {inCurrency(conversion.amountInGlobalCurrency, userCurrency)}
                      <span className="ms-1" dir="ltr">
                        (1 {formData.currency} = {conversion.exchangeRate.toFixed(4)} {userCurrency})
                      </span>
                    </>
                  ) : (
                    <span>{isLoadingRates ? t('txRateLoading') : t('txRateUnavailable')}</span>
                  )}
                </p>
              )}
            </div>

          <div className="space-y-1 sm:space-y-2">
            <Label className={cn("flex items-center gap-2 text-xs sm:text-sm", colors.textSecondary)}>
              {t('category')} *
              {showSuggested && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden />{t('suggestedCategory')}
                </span>
              )}
            </Label>
            <div role="radiogroup" aria-label={t('category')} className="flex flex-wrap gap-2">
              {quickCategories.map((category) => {
                const active = formData.category === category.name;
                return (
                  <button
                    key={category.id || category.name}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { categoryTouched.current = true; setFormData({ ...formData, category: category.name }); }}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 sm:px-3",
                      active ? "border-primary bg-primary/15 text-primary" : cn(colors.border, colors.textSecondary, "hover:bg-primary/10")
                    )}
                  >
                    {translateCategory(category.name, language)}
                  </button>
                );
              })}
              {moreCategories.length > 0 && (
                <Select value="" onValueChange={(value) => { categoryTouched.current = true; setFormData({ ...formData, category: value }); }}>
                  <SelectTrigger aria-label={t('category')} className={cn("h-11 w-auto min-w-[5.5rem] rounded-full text-sm sm:h-9", colors.bgTertiary, colors.border, colors.textSecondary)}>
                    <SelectValue placeholder="…" />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    {moreCategories.map((category) => (
                      <SelectItem key={category.id || category.name} value={category.name} className={colors.textPrimary}>
                        {translateCategory(category.name, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-1 sm:space-y-2">
            <Label htmlFor="description" className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('description')} ({t('optional')})</Label>
            <Textarea
              id="description"
              placeholder={t('descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn("text-xs sm:text-sm min-h-[44px] sm:min-h-[60px]", colors.bgTertiary, colors.border, colors.textPrimary, errors.description && 'border-danger')}
            />
            {errors.description && <p className="text-xs text-danger">{errors.description}</p>}
          </div>

          <div className={cn("grid gap-2 sm:gap-4", (formData.isRecurring && !isEditing) || (defaultType && !isEditing) ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {(!formData.isRecurring || isEditing) && (
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="date" className={cn("text-xs sm:text-sm", colors.textSecondary)}>{splitting ? t('firstPayment') : t('date')} *</Label>
                <Input
                  ref={dateInputRef}
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  max={splitting ? undefined : format(new Date(), 'yyyy-MM-dd')}
                  autoFocus={false}
                  onFocus={(e) => {
                    // Prevent auto-opening date picker on mobile when dialog first opens
                    if (window.innerWidth < 640 && isInitialOpenRef.current) {
                      setTimeout(() => {
                        e.target.blur();
                        isInitialOpenRef.current = false;
                      }, 0);
                    }
                  }}
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm w-full", colors.bgTertiary, colors.border, colors.textPrimary, errors.date && 'border-danger')}
                />
                {errors.date && <p className="text-xs text-danger">{errors.date}</p>}
              </div>
            )}

            {(!defaultType || isEditing) && <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="type" className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('type')} *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => {
                  const availableCategories = categories.filter(cat => cat.type === value || cat.type === 'Both');
                  setFormData({
                    ...formData,
                    type: value,
                    category: availableCategories.length > 0 ? availableCategories[0].name : '',
                    isBigPurchase: value === 'Income' ? false : formData.isBigPurchase,
                    planId: value === 'Income' ? '' : formData.planId,
                  });
                }}
              >
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Expense" className={colors.textPrimary}>{t('expense')}</SelectItem>
                  <SelectItem value="Income" className={colors.textPrimary}>{t('income')}</SelectItem>
                </SelectContent>
              </Select>
            </div>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="currency" className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('currency')} *</Label>
              <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="USD" className={colors.textPrimary}>USD ($)</SelectItem>
                  <SelectItem value="EUR" className={colors.textPrimary}>EUR (€)</SelectItem>
                  <SelectItem value="GBP" className={colors.textPrimary}>GBP (£)</SelectItem>
                  <SelectItem value="ILS" className={colors.textPrimary}>ILS (₪)</SelectItem>
                  <SelectItem value="JPY" className={colors.textPrimary}>JPY (¥)</SelectItem>
                  <SelectItem value="CAD" className={colors.textPrimary}>CAD ($)</SelectItem>
                  <SelectItem value="AUD" className={colors.textPrimary}>AUD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:space-y-2">
              <Label className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('paymentMethod')} ({t('optional')})</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => {
                  setFormData({ ...formData, paymentMethod: value, cardId: value === 'Card' ? formData.cardId : '' });
                }}
              >
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue placeholder={t('selectPaymentMethod')} />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value={null} className={colors.textPrimary}>{t('none')}</SelectItem>
                  <SelectItem value="Card" className={colors.textPrimary}>{t('card')}</SelectItem>
                  <SelectItem value="Cash" className={colors.textPrimary}>{t('cash')}</SelectItem>
                  <SelectItem value="Transfer" className={colors.textPrimary}>{t('transfer')}</SelectItem>
                  <SelectItem value="Apple Pay" className={colors.textPrimary}>Apple Pay</SelectItem>
                  <SelectItem value="Paybox" className={colors.textPrimary}>Paybox</SelectItem>
                  <SelectItem value="PayPal" className={colors.textPrimary}>PayPal</SelectItem>
                  <SelectItem value="Bit" className={colors.textPrimary}>Bit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>









          {/* Households: who paid, and whether the others owe their part */}
          {formData.type === 'Expense' && (
            <HouseholdFields
              value={{ paidBy: formData.paidBy, split: formData.split }}
              onChange={(v) => { setFormData({ ...formData, ...v }); if (errors.split) setErrors({ ...errors, split: '' }); }}
              amount={parseFloat(formData.amount) || 0}
              currency={formData.currency}
              creator={editTransaction?.created_by}
              error={errors.split}
            />
          )}

          {/* Big purchase: kept apart from everyday spending, optionally paid in installments */}
          {formData.type === 'Expense' && (!formData.isRecurring || isEditing) && (
            <div className={cn("rounded-2xl border p-2 transition-colors sm:p-3", formData.isBigPurchase ? "border-primary/40 bg-primary/[0.06]" : colors.border)}>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isBigPurchase"
                  checked={formData.isBigPurchase}
                  onCheckedChange={(checked) => setFormData({ ...formData, isBigPurchase: !!checked })}
                  className={cn(colors.border)}
                />
                <Label htmlFor="isBigPurchase" className={cn("flex cursor-pointer items-center gap-1.5 text-xs sm:text-sm", colors.textSecondary)}>
                  <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{t('bigPurchase')}</span>
                </Label>
              </div>
              {formData.isBigPurchase && (
                <div className="mt-2 space-y-2 ps-6">
                  <p className={cn("text-xs", colors.textTertiary)}>{t('bigPurchaseHelp')}</p>
                  {isEditing ? (
                    editTransaction?.installmentCount > 1 && (
                      <p className={cn("text-xs font-medium", colors.textSecondary)}>
                        {t('installmentOf').replace('{index}', editTransaction.installmentIndex).replace('{count}', editTransaction.installmentCount)}
                        {editTransaction.installmentTotal ? ` · ${t('totalPrice')} ${inCurrency(editTransaction.installmentTotal, editTransaction.currency)}` : ''}
                      </p>
                    )
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('installments')}</span>
                        <div className="flex items-center gap-1" role="group" aria-label={t('installments')}>
                          <button type="button" aria-label={t('fewerPayments')} onClick={() => setFormData({ ...formData, installmentCount: String(Math.max(1, installments - 1)) })} className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition-colors hover:bg-foreground/10 active:scale-95">
                            <Minus className="h-4 w-4" />
                          </button>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="60"
                            aria-label={t('installments')}
                            value={formData.installmentCount}
                            onChange={(e) => setFormData({ ...formData, installmentCount: e.target.value })}
                            className={cn("h-10 w-14 text-center tabular-nums", colors.bgTertiary, colors.border, colors.textPrimary)}
                          />
                          <button type="button" aria-label={t('morePayments')} onClick={() => setFormData({ ...formData, installmentCount: String(Math.min(60, installments + 1)) })} className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition-colors hover:bg-foreground/10 active:scale-95">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 3, 6, 12, 24, 36].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={installments === n}
                            onClick={() => setFormData({ ...formData, installmentCount: String(n) })}
                            className={cn("min-h-9 rounded-full px-3 text-xs font-medium tabular-nums transition-colors", installments === n ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10")}
                          >
                            {n === 1 ? t('singlePayment') : `×${n}`}
                          </button>
                        ))}
                      </div>
                      {installmentPreview && <p className="text-xs font-medium text-primary">{installmentPreview}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Part of a plan (a trip, a wedding): counts towards that plan's budget */}
          {formData.type === 'Expense' && activePlans.length > 0 && (
            <div className="space-y-1 sm:space-y-2">
              <Label className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('partOfPlan')} ({t('optional')})</Label>
              <Select
                value={formData.planId || 'none'}
                onValueChange={(value) => setFormData({ ...formData, planId: value === 'none' ? '' : value, planItemId: value === formData.planId ? formData.planItemId : '' })}
              >
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="none" className={colors.textPrimary}>{t('none')}</SelectItem>
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className={colors.textPrimary}>
                      {p.emoji ? `${p.emoji} ` : ''}{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monthly recurring (rent, salary, subscriptions) */}
          {!(formData.type === 'Expense' && formData.isBigPurchase) && !isEditing && (
            <div className="flex items-center gap-2 p-2 rounded-md">
              <Checkbox
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked) => {
                  setFormData({
                    ...formData,
                    isRecurring: checked,
                    recurringStartDate: checked ? formData.recurringStartDate : format(new Date(), 'yyyy-MM-dd'),
                    recurringEndDate: checked ? formData.recurringEndDate : format(addMonths(new Date(), 11), 'yyyy-MM-dd'),
                  });
                  setErrors({});
                }}
                className={cn(colors.border)}
              />
              <Label
                htmlFor="isRecurring"
                className={cn("text-xs sm:text-sm cursor-pointer flex items-center gap-1.5", colors.textSecondary)}
              >
                <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{t('monthlyRecurring')}</span>
              </Label>
            </div>
          )}

          {/* Recurring Transaction Date Range */}
          {formData.isRecurring && !isEditing && (
            <div className="space-y-0 sm:space-y-2 p-1 sm:p-2 pt-0 sm:pt-1 pb-0 sm:pb-2 rounded-md -my-2 sm:my-0" style={{ backgroundColor: colors.bgTertiary }}>
              <p className={cn("text-xs mb-0 pb-0", colors.textTertiary)}>
                {t('recurringTransactionHelp')}
              </p>
              <div className="grid grid-cols-2 gap-0 sm:gap-4">
                <div className="space-y-0 sm:space-y-2">
                  <Label htmlFor="recurringStartDate" className={cn("text-xs sm:text-sm mb-0 sm:mb-0 block", colors.textSecondary)}>
                    {t('fromDate') || 'From Date'} *
                  </Label>
                  <Input
                    id="recurringStartDate"
                    type="date"
                    value={formData.recurringStartDate}
                    onChange={(e) => {
                      setFormData({ ...formData, recurringStartDate: e.target.value });
                      setErrors({ ...errors, recurringStartDate: '' });
                    }}
                    max={formData.recurringEndDate || undefined}
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm mt-0 sm:mt-0", colors.bgPrimary, colors.border, colors.textPrimary, errors.recurringStartDate && 'border-danger')}
                  />
                  {errors.recurringStartDate && <p className="text-xs text-danger">{errors.recurringStartDate}</p>}
                </div>

                <div className="space-y-0 sm:space-y-2">
                  <Label htmlFor="recurringEndDate" className={cn("text-xs sm:text-sm mb-0 sm:mb-0 block", colors.textSecondary)}>
                    {t('toDate') || 'To Date'} *
                  </Label>
                  <Input
                    id="recurringEndDate"
                    type="date"
                    value={formData.recurringEndDate}
                    onChange={(e) => {
                      setFormData({ ...formData, recurringEndDate: e.target.value });
                      setErrors({ ...errors, recurringEndDate: '' });
                    }}
                    min={formData.recurringStartDate || undefined}
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm mt-0 sm:mt-0", colors.bgPrimary, colors.border, colors.textPrimary, errors.recurringEndDate && 'border-danger')}
                  />
                  {errors.recurringEndDate && <p className="text-xs text-danger">{errors.recurringEndDate}</p>}
                </div>
              </div>
            </div>
          )}

          {formData.paymentMethod === 'Card' && (
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1 sm:space-y-2">
                <Label className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('selectCard')}</Label>
                <Select
                  value={formData.cardId}
                  onValueChange={(value) => setFormData({ ...formData, cardId: value, paymentMethod: 'Card' })}
                >
                  <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                    <SelectValue placeholder={t('selectACard')} />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    {cards.length === 0 ? (
                      <SelectItem value="none" disabled className={colors.textTertiary}>
                        {t('noCardsAvailable')}
                      </SelectItem>
                    ) : (
                      cards.map((card) => (
                        <SelectItem key={card.id} value={card.id} className={colors.textPrimary}>
                          {user?.blurValues ? (
                            '••••••'
                          ) : (
                            `${card.name || card.cardName || ''} •••• ${card.lastFourDigits || ''}`
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {PORTFOLIO_ENABLED && (
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="relatedAccount" className={cn("text-xs sm:text-sm", colors.textSecondary)}>
                  {t('relatedAccount')}
                </Label>
                <Select
                  value={formData.relatedAccountId}
                  onValueChange={(value) => setFormData({ ...formData, relatedAccountId: value })}
                >
                  <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                    <SelectValue placeholder={t('selectAccountOptional')} />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    <SelectItem value={null} className={colors.textPrimary}>{t('none')}</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id} className={colors.textPrimary}>
                        {account.name} ({account.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
            </div>
          )}

          {formData.paymentMethod !== 'Card' && PORTFOLIO_ENABLED && (
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="relatedAccount" className={cn("text-xs sm:text-sm", colors.textSecondary)}>
                {t('relatedAccount')}
              </Label>
              <Select
                value={formData.relatedAccountId}
                onValueChange={(value) => setFormData({ ...formData, relatedAccountId: value })}
              >
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue placeholder={t('selectAccountOptional')} />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value={null} className={colors.textPrimary}>{t('none')}</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id} className={colors.textPrimary}>
                      {account.name} ({account.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="sticky -bottom-3 z-10 -mx-3 flex gap-2 bg-popover/95 px-3 pb-3 pt-3 backdrop-blur sm:static sm:mx-0 sm:gap-3 sm:bg-transparent sm:p-0 sm:pt-4 sm:backdrop-blur-none">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className={cn("flex-1 h-11 text-sm sm:h-10 sm:text-base bg-transparent hover:bg-primary/20", colors.border, colors.textSecondary)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 h-11 text-sm sm:h-10 sm:text-base bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 me-1 sm:me-2 animate-spin" />
                  <span className="hidden sm:inline">{editTransaction && (editTransaction.id || editTransaction._id) ? t('updating') : t('adding')}</span>
                </>
              ) : (
                isEditing ? t('updateTransaction') : splitting ? t('addInstallments').replace('{count}', installments) : t('addTransaction')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}