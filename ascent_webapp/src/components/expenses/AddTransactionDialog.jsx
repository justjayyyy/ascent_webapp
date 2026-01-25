import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Repeat } from 'lucide-react';
import { format, addMonths, startOfMonth, parseISO, isBefore, isAfter, eachMonthOfInterval } from 'date-fns';
import { useTheme, translateCategory } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';

export default function AddTransactionDialog({ 
  open, 
  onClose, 
  onSubmit, 
  isLoading, 
  accounts = [],
  categories = [],
  editTransaction = null 
}) {
  const { user, t, language, colors } = useTheme();
  const defaultCategory = categories.find(c => c.type === 'Expense' || c.type === 'Both');
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Expense',
    category: defaultCategory?.name || '',
    description: '',
    amount: '',
    currency: user?.currency || 'USD',
    paymentMethod: '',
    cardId: '',
    relatedAccountId: '',
    isRecurring: false,
    recurringFrequency: 'monthly',
    recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
    recurringEndDate: format(addMonths(new Date(), 11), 'yyyy-MM-dd'), // Default to 12 months
  });

  const [errors, setErrors] = useState({});
  const dateInputRef = useRef(null);
  const isInitialOpenRef = useRef(true);

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Card.filter({ created_by: user.email, isActive: true }, '-created_date');
    },
    enabled: !!user,
  });

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
      });
    } else {
      const defaultCategory = categories.find(c => c.type === 'Expense' || c.type === 'Both');
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'Expense',
        category: defaultCategory?.name || '',
        description: '',
        amount: '',
        currency: user?.currency || 'USD',
        paymentMethod: '',
        cardId: '',
        relatedAccountId: '',
        isRecurring: false,
        recurringFrequency: 'monthly',
        recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
        recurringEndDate: format(addMonths(new Date(), 11), 'yyyy-MM-dd'),
      });
    }
    setErrors({});
  }, [editTransaction, open, user?.currency, categories]);

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

    if (!formData.isRecurring) {
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

    if (!formData.description.trim()) {
      newErrors.description = t('descriptionRequired');
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = t('amountGreaterThanZero');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    await onSubmit({
      ...formData,
      amount: parseFloat(formData.amount),
      relatedAccountId: formData.relatedAccountId || undefined,
    });
  };

  // Filter categories based on transaction type
  const getFilteredCategories = () => {
    return categories.filter(cat => 
      cat.type === formData.type || cat.type === 'Both'
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "w-[95vw] max-w-[95vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-3 sm:p-6")}>
        <DialogHeader className="pb-1.5 sm:pb-4">
          <DialogTitle className={cn("text-base sm:text-xl font-bold", colors.accentText)}>
            {editTransaction && (editTransaction.id || editTransaction._id)
              ? t('editTransaction')
              : t('addTransactionTitle')
            }
          </DialogTitle>
          <DialogDescription className={cn("text-[10px] sm:text-sm hidden sm:block", colors.textTertiary)}>
            {editTransaction && (editTransaction.id || editTransaction._id)
              ? t('updateTransactionDetails')
              : t('recordNewTransaction')
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4 mt-1.5 sm:mt-4">
          <div className={cn("grid gap-2 sm:gap-4", formData.isRecurring ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {!formData.isRecurring && (
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="date" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('date')} *</Label>
                <Input
                  ref={dateInputRef}
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  max={format(new Date(), 'yyyy-MM-dd')}
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
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm w-full", colors.bgTertiary, colors.border, colors.textPrimary, errors.date && 'border-red-500')}
                />
                {errors.date && <p className="text-[9px] sm:text-xs text-red-400">{errors.date}</p>}
              </div>
            )}

            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="type" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('type')} *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => {
                  const availableCategories = categories.filter(cat => cat.type === value || cat.type === 'Both');
                  setFormData({ 
                    ...formData, 
                    type: value,
                    category: availableCategories.length > 0 ? availableCategories[0].name : ''
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="category" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('category')} *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  {getFilteredCategories().map((category) => (
                    <SelectItem key={category.id} value={category.name} className={colors.textPrimary}>
                      {translateCategory(category.name, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="amount" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary, errors.amount && 'border-red-500')}
              />
              {errors.amount && <p className="text-[9px] sm:text-xs text-red-400">{errors.amount}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="currency" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('currency')} *</Label>
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
              <Label className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('paymentMethod')} ({t('optional')})</Label>
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
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 sm:space-y-2">
            <Label htmlFor="description" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('description')} *</Label>
            <Textarea
              id="description"
              placeholder={t('descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn("text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]", colors.bgTertiary, colors.border, colors.textPrimary, errors.description && 'border-red-500')}
            />
            {errors.description && <p className="text-[9px] sm:text-xs text-red-400">{errors.description}</p>}
          </div>

          {/* Recurring Transaction Toggle */}
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
              <span>{t('monthlyRecurring') !== 'monthlyRecurring' ? t('monthlyRecurring') : 'Monthly Recurring'}</span>
            </Label>
          </div>

          {/* Recurring Transaction Date Range */}
          {formData.isRecurring && (
            <div className="space-y-0 sm:space-y-2 p-1 sm:p-2 pt-0 sm:pt-1 pb-0 sm:pb-2 rounded-md -my-2 sm:my-0" style={{ backgroundColor: colors.bgTertiary }}>
              <p className={cn("text-[10px] sm:text-xs mb-0 pb-0", colors.textTertiary)}>
                {(() => {
                  const helpText = t('recurringTransactionHelp');
                  if (helpText !== 'recurringTransactionHelp') {
                    return helpText;
                  }
                  const altHelpText = t('recurringHelpText');
                  if (altHelpText !== 'recurringHelpText') {
                    return altHelpText;
                  }
                  return 'Transactions will be created monthly from start to end date';
                })()}
              </p>
              <div className="grid grid-cols-2 gap-0 sm:gap-4">
                <div className="space-y-0 sm:space-y-2">
                  <Label htmlFor="recurringStartDate" className={cn("text-[10px] sm:text-sm mb-0 sm:mb-0 block", colors.textSecondary)}>
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
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm mt-0 sm:mt-0", colors.bgPrimary, colors.border, colors.textPrimary, errors.recurringStartDate && 'border-red-500')}
                  />
                  {errors.recurringStartDate && <p className="text-[9px] sm:text-xs text-red-400">{errors.recurringStartDate}</p>}
                </div>

                <div className="space-y-0 sm:space-y-2">
                  <Label htmlFor="recurringEndDate" className={cn("text-[10px] sm:text-sm mb-0 sm:mb-0 block", colors.textSecondary)}>
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
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm mt-0 sm:mt-0", colors.bgPrimary, colors.border, colors.textPrimary, errors.recurringEndDate && 'border-red-500')}
                  />
                  {errors.recurringEndDate && <p className="text-[9px] sm:text-xs text-red-400">{errors.recurringEndDate}</p>}
                </div>
              </div>
            </div>
          )}

          {formData.paymentMethod === 'Card' && (
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1 sm:space-y-2">
                <Label className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('selectCard')}</Label>
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

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="relatedAccount" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
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
            </div>
          )}

          {formData.paymentMethod !== 'Card' && (
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="relatedAccount" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
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

          <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className={cn("flex-1 h-8 sm:h-10 text-xs sm:text-base bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 h-8 sm:h-10 text-xs sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">{editTransaction && (editTransaction.id || editTransaction._id) ? t('updating') : t('adding')}</span>
                </>
              ) : (
                editTransaction && (editTransaction.id || editTransaction._id) ? t('updateTransaction') : t('addTransaction')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}